'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { getInstallationClient } = require('../githubClient');
const { AppError, ValidationError, PayloadTooLargeError } = require('../../utils/errors');

const CAPABILITY_TTL_MS = 10 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30 * 1000;
const capabilities = new Map();

function operationalError(code, message, statusCode) {
  return new AppError(code, message, statusCode);
}

function isTrustedUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return false;
  }
  return host === 'heroku.com' || host.endsWith('.heroku.com') || host.endsWith('.amazonaws.com');
}

function prune(now = Date.now()) {
  for (const [id, entry] of capabilities) {
    if (entry.expiresAt <= now || (entry.uploadUsed && entry.buildUsed)) capabilities.delete(id);
  }
}

function issue(source, options = {}) {
  const now = options.now || Date.now();
  prune(now);
  const blob = source && source.source_blob;
  const putUrl = blob && (blob.put_url || blob.upload_url);
  const getUrl = blob && (blob.get_url || blob.download_url);
  if (!isTrustedUploadUrl(putUrl) || !isTrustedUploadUrl(getUrl)) {
    throw operationalError('HEROKU_INVALID_SOURCE_URL', 'Heroku returned an untrusted source target.', 502);
  }
  const id = crypto.randomUUID();
  const expiresAt = now + CAPABILITY_TTL_MS;
  capabilities.set(id, { putUrl, getUrl, expiresAt, uploadUsed: false, buildUsed: false });
  return { capability: id, expiresAt: new Date(expiresAt).toISOString() };
}

function getCapability(id, purpose, now = Date.now()) {
  prune(now);
  const entry = capabilities.get(id);
  if (!entry || entry.expiresAt <= now) {
    throw operationalError('HEROKU_SOURCE_CAPABILITY_INVALID', 'The Heroku source capability is invalid or expired.', 410);
  }
  if (purpose === 'upload') {
    if (entry.uploadUsed) {
      throw operationalError('HEROKU_SOURCE_CAPABILITY_USED', 'The Heroku source upload capability was already used.', 409);
    }
    entry.uploadUsed = true;
  } else {
    if (!entry.uploadUsed) {
      throw operationalError('HEROKU_SOURCE_NOT_UPLOADED', 'The Heroku source archive has not been uploaded.', 409);
    }
    if (entry.buildUsed) {
      throw operationalError('HEROKU_SOURCE_CAPABILITY_USED', 'The Heroku source build capability was already used.', 409);
    }
    entry.buildUsed = true;
  }
  return entry;
}

function normalizeRepository(repository) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(repository || ''));
  if (!match) throw new ValidationError('repository must be in owner/name format.');
  return { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` };
}

function normalizeDirectory(value) {
  const directory = String(value || '').replace(/^\/+|\/+$/g, '');
  if (!directory || directory.includes('..') || directory.includes('\\')) {
    throw new ValidationError('sourceDirectory must be a safe repository-relative directory.');
  }
  return directory;
}

function excluded(path) {
  return path.split('/').some((part) =>
    part === '.git' || part === 'node_modules' || part === '.env' || part.startsWith('.env.')
  );
}

function writeOctal(buffer, offset, length, value) {
  const text = Math.max(0, value).toString(8).padStart(length - 1, '0');
  buffer.write(text.slice(-(length - 1)), offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512, 0);
  if (Buffer.byteLength(name) > 100) throw new ValidationError(`Archive path is too long: ${name}`);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  header.write(checksumText, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function makeArchive(files) {
  const parts = [];
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    parts.push(tarHeader(file.path, file.content.length), file.content);
    const padding = (512 - (file.content.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  const tar = Buffer.concat(parts);
  const archive = zlib.gzipSync(tar, { level: 9, mtime: 0 });
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new PayloadTooLargeError('The generated Heroku source archive exceeds the size limit.');
  }
  return archive;
}

async function readRepositoryFiles(input, options = {}) {
  const repository = normalizeRepository(input.repository);
  const sourceDirectory = normalizeDirectory(input.sourceDirectory);
  if (!/^[0-9a-f]{40}$/i.test(String(input.commitSha || ''))) {
    throw new ValidationError('commitSha must be a full 40-character Git commit SHA.');
  }
  const github = options.githubClient || (await getInstallationClient(options));
  const commit = await github.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    owner: repository.owner,
    repo: repository.repo,
    commit_sha: input.commitSha,
  });
  const tree = await github.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
    owner: repository.owner,
    repo: repository.repo,
    tree_sha: commit.data.tree.sha,
    recursive: '1',
  });
  const prefix = `${sourceDirectory}/`;
  const entries = tree.data.tree.filter(
    (item) => item.type === 'blob' && item.path.startsWith(prefix) && !excluded(item.path)
  );
  if (!entries.length) throw new ValidationError('No deployable files were found in sourceDirectory.');

  let total = 0;
  const files = [];
  for (const item of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    const blob = await github.request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
      owner: repository.owner,
      repo: repository.repo,
      file_sha: item.sha,
    });
    if (blob.data.encoding !== 'base64') {
      throw operationalError('GITHUB_UNSUPPORTED_CONTENT', 'GitHub returned unsupported blob content.', 502);
    }
    const content = Buffer.from(blob.data.content.replace(/\n/g, ''), 'base64');
    total += content.length;
    if (total > MAX_SOURCE_BYTES) {
      throw new PayloadTooLargeError('The selected GitHub source exceeds the size limit.');
    }
    files.push({ path: item.path.slice(prefix.length), content });
  }
  return { repository, sourceDirectory, files };
}

async function upload(input, options = {}) {
  const entry = getCapability(input.capability, 'upload', options.now || Date.now());
  const source = await readRepositoryFiles(input, options);
  const archive = makeArchive(source.files);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || UPLOAD_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await (options.fetchImpl || fetch)(entry.putUrl, {
      method: 'PUT',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(archive.length),
        'User-Agent': 'context-api-heroku-gateway/1.0',
      },
      body: archive,
    });
    if (!response.ok) {
      throw operationalError('HEROKU_SOURCE_UPLOAD_FAILED', 'Heroku source upload failed.', 502);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw operationalError('HEROKU_TIMEOUT', 'Heroku source upload timed out.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  return {
    uploaded: true,
    byteCount: archive.length,
    sha256: crypto.createHash('sha256').update(archive).digest('hex'),
    repository: source.repository.fullName,
    commitSha: input.commitSha,
    sourceDirectory: source.sourceDirectory,
    capability: input.capability,
  };
}

function buildSourceBlob(capability, now = Date.now()) {
  const entry = getCapability(capability, 'build', now);
  return { url: entry.getUrl };
}

function reset() {
  capabilities.clear();
}

module.exports = {
  issue,
  upload,
  buildSourceBlob,
  makeArchive,
  readRepositoryFiles,
  isTrustedUploadUrl,
  reset,
  CAPABILITY_TTL_MS,
  MAX_ARCHIVE_BYTES,
  MAX_SOURCE_BYTES,
};