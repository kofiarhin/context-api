'use strict';

require('dotenv').config();

const VALID_NODE_ENVS = ['development', 'test', 'production'];
const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug'];
const VALID_GITHUB_REPOSITORY_ACCESS = ['all'];

const DEFAULTS = {
  LOG_LEVEL: 'info',
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 100,
};

const GITHUB_VARIABLES = [
  'GITHUB_APP_ID',
  'GITHUB_INSTALLATION_ID',
  'GITHUB_PRIVATE_KEY_BASE64',
  'GITHUB_REPOSITORY_ACCESS',
  'ZORO_GITHUB_API_KEY',
];

// A bearer secret below this length cannot carry the 32 bytes of entropy the
// gateway specification requires.
const MIN_BEARER_KEY_LENGTH = 32;

const BASE64 = /^[A-Za-z0-9+/\r\n]+={0,2}$/;
const PEM_HEADER = /^-----BEGIN ((?:RSA |EC |ENCRYPTED )?PRIVATE KEY)-----/;

function parseInteger(raw, field, { min, max }, problems) {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${field} must be an integer between ${min} and ${max}.`);
    return null;
  }

  return value;
}

function parseOrigins(raw) {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Parses a GitHub numeric identifier.
 *
 * GitHub app and installation identifiers are transported as strings but must
 * be positive integers, so a stray quote or placeholder fails here rather than
 * during the first installation token request.
 */
function parseGithubId(raw, field, problems) {
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1) {
    problems.push(`${field} must be a positive integer.`);
    return null;
  }

  return Number(raw);
}

/**
 * Decodes the Base64 GitHub App private key and confirms it looks like a PEM.
 *
 * The decoded key is returned to the caller but never pushed into `problems`:
 * validation failures name the variable only, so key material cannot reach a
 * crash log or an error response.
 */
function decodePrivateKey(raw, field, problems) {
  const encoded = String(raw).trim();

  if (!BASE64.test(encoded)) {
    problems.push(`${field} must be Base64 encoded.`);
    return null;
  }

  let decoded;

  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    problems.push(`${field} must be Base64 encoded.`);
    return null;
  }

  const header = PEM_HEADER.exec(decoded);

  if (!header) {
    problems.push(`${field} must decode to a PEM private key.`);
    return null;
  }

  if (!decoded.trimEnd().endsWith(`-----END ${header[1]}-----`)) {
    problems.push(`${field} must decode to a PEM private key with a matching footer.`);
    return null;
  }

  return decoded;
}

/**
 * Validates the GitHub gateway configuration.
 *
 * Every variable is mandatory in production so a misconfigured release fails at
 * startup. Outside production the gateway is optional — the rest of the Context
 * API runs without it — but any value that *is* supplied is still validated, so
 * a typo surfaces locally instead of on Heroku.
 */
function loadGithubConfig(source, { isProduction }, problems) {
  const present = GITHUB_VARIABLES.filter(
    (name) => source[name] !== undefined && source[name] !== ''
  );
  const required = isProduction || present.length > 0;

  if (!required) {
    return {
      githubAppId: null,
      githubInstallationId: null,
      githubPrivateKey: null,
      githubRepositoryAccess: null,
      zoroGithubApiKey: null,
    };
  }

  for (const name of GITHUB_VARIABLES) {
    if (!present.includes(name)) {
      problems.push(`${name} is required.`);
    }
  }

  const githubAppId = present.includes('GITHUB_APP_ID')
    ? parseGithubId(source.GITHUB_APP_ID, 'GITHUB_APP_ID', problems)
    : null;

  const githubInstallationId = present.includes('GITHUB_INSTALLATION_ID')
    ? parseGithubId(source.GITHUB_INSTALLATION_ID, 'GITHUB_INSTALLATION_ID', problems)
    : null;

  const githubPrivateKey = present.includes('GITHUB_PRIVATE_KEY_BASE64')
    ? decodePrivateKey(source.GITHUB_PRIVATE_KEY_BASE64, 'GITHUB_PRIVATE_KEY_BASE64', problems)
    : null;

  let githubRepositoryAccess = null;
  if (present.includes('GITHUB_REPOSITORY_ACCESS')) {
    githubRepositoryAccess = String(source.GITHUB_REPOSITORY_ACCESS).trim();

    if (!VALID_GITHUB_REPOSITORY_ACCESS.includes(githubRepositoryAccess)) {
      problems.push(
        `GITHUB_REPOSITORY_ACCESS must be one of: ${VALID_GITHUB_REPOSITORY_ACCESS.join(', ')}.`
      );
      githubRepositoryAccess = null;
    }
  }

  let zoroGithubApiKey = null;
  if (present.includes('ZORO_GITHUB_API_KEY')) {
    zoroGithubApiKey = String(source.ZORO_GITHUB_API_KEY);

    if (zoroGithubApiKey.length < MIN_BEARER_KEY_LENGTH) {
      problems.push(`ZORO_GITHUB_API_KEY must be at least ${MIN_BEARER_KEY_LENGTH} characters.`);
      zoroGithubApiKey = null;
    }
  }

  return {
    githubAppId,
    githubInstallationId,
    githubPrivateKey,
    githubRepositoryAccess,
    zoroGithubApiKey,
  };
}

/**
 * Validates a raw environment source and returns a frozen configuration object.
 *
 * Throws a single error listing every problem. Error messages deliberately name
 * the offending variable without echoing its value, so a malformed connection
 * string never reaches logs or crash output.
 */
function loadEnv(source = process.env) {
  const problems = [];

  const nodeEnv = source.NODE_ENV;
  if (!nodeEnv) {
    problems.push('NODE_ENV is required.');
  } else if (!VALID_NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')}.`);
  }

  let port = null;
  if (source.PORT === undefined || source.PORT === '') {
    problems.push('PORT is required.');
  } else {
    port = parseInteger(source.PORT, 'PORT', { min: 1, max: 65535 }, problems);
  }

  const mongodbUri = source.MONGODB_URI;
  if (!mongodbUri) {
    problems.push('MONGODB_URI is required.');
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    problems.push('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }

  const logLevel = source.LOG_LEVEL || DEFAULTS.LOG_LEVEL;
  if (!VALID_LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${VALID_LOG_LEVELS.join(', ')}.`);
  }

  let rateLimitWindowMs = DEFAULTS.RATE_LIMIT_WINDOW_MS;
  if (source.RATE_LIMIT_WINDOW_MS !== undefined && source.RATE_LIMIT_WINDOW_MS !== '') {
    rateLimitWindowMs = parseInteger(
      source.RATE_LIMIT_WINDOW_MS,
      'RATE_LIMIT_WINDOW_MS',
      { min: 1000, max: 3600000 },
      problems
    );
  }

  let rateLimitMax = DEFAULTS.RATE_LIMIT_MAX;
  if (source.RATE_LIMIT_MAX !== undefined && source.RATE_LIMIT_MAX !== '') {
    rateLimitMax = parseInteger(
      source.RATE_LIMIT_MAX,
      'RATE_LIMIT_MAX',
      { min: 1, max: 1000000 },
      problems
    );
  }

  const github = loadGithubConfig(source, { isProduction: nodeEnv === 'production' }, problems);

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
  }

  return Object.freeze({
    nodeEnv,
    port,
    mongodbUri,
    logLevel,
    corsOrigins: Object.freeze(parseOrigins(source.CORS_ORIGINS)),
    rateLimitWindowMs,
    rateLimitMax,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    ...github,
  });
}

let cached = null;

function getEnv() {
  if (!cached) {
    cached = loadEnv();
  }

  return cached;
}

function resetEnv() {
  cached = null;
}

module.exports = {
  loadEnv,
  getEnv,
  resetEnv,
  VALID_NODE_ENVS,
  VALID_LOG_LEVELS,
  VALID_GITHUB_REPOSITORY_ACCESS,
  GITHUB_VARIABLES,
  MIN_BEARER_KEY_LENGTH,
};
