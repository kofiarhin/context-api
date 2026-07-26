'use strict';

const { ValidationError } = require('../../utils/errors');
const serializer = require('../../serializers/heroku.serializer');
const client = require('./herokuClient');
const policy = require('./herokuPolicy');
const sourceUpload = require('./herokuSourceUpload');

const UPSTREAM_OVERRIDES = {
  transferHerokuApp: '/account/app-transfers',
  listHerokuPipelinePromotionTargets: '/pipeline-promotions/{promotion}/promotion-targets',
};

function pathFor(template, params) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      throw new ValidationError(`Missing Heroku path parameter: ${key}.`);
    }
    return encodeURIComponent(params[key]);
  });
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { approval, expectedEtag, params, query, ...payload } = body;
  return payload;
}

function stripControl(input) {
  const { approval, expectedEtag, range, body, query, ...params } = input;
  return { approval, expectedEtag, range, body: sanitizeBody(body), query, params };
}

/**
 * Builds the upstream request body for one operation.
 *
 * Returns `undefined` for GET and HEAD. A read carries no body, and callers
 * routinely supply an empty one — the unified Zoro dispatcher defaults `body` to
 * `{}` for every operation — so without this guard `fetch` rejects the request
 * with "Request with GET/HEAD method cannot have body" before any network call,
 * which the client then reports as the misleading HEROKU_UNAVAILABLE.
 */
function requestBody(descriptor, input, options = {}) {
  if (descriptor.method === 'GET' || descriptor.method === 'HEAD') {
    return undefined;
  }

  if (descriptor.operationId === 'deleteHerokuConfigVar') {
    return { [input.params.key]: null };
  }
  if (descriptor.operationId === 'rollbackHerokuRelease') {
    return { release: input.params.release, ...(input.body || {}) };
  }
  if (descriptor.operationId === 'transferHerokuApp') {
    return { app: input.params.app, ...(input.body || {}) };
  }
  if (descriptor.operationId === 'updateHerokuAppStack') {
    const body = input.body || {};
    return { build_stack: body.build_stack || body.stack };
  }
  if (descriptor.operationId === 'createHerokuBuild') {
    const body = { ...(input.body || {}) };
    if (body.sourceCapability) {
      body.source_blob = sourceUpload.buildSourceBlob(
        body.sourceCapability,
        options.now || Date.now()
      );
      delete body.sourceCapability;
    }
    return body;
  }
  return input.body;
}

async function queryLogs(descriptor, input, config, options) {
  const sessionBody = {
    ...(input.body || {}),
    tail: false,
    lines: Math.min(Number((input.body || {}).lines || 100), 1500),
  };
  const session = await client.request('POST', pathFor(descriptor.upstream, input.params), {
    baseEnv: config,
    source: options.source,
    fetchImpl: options.fetchImpl,
    body: sessionBody,
  });
  const url = session.data && (session.data.logplex_url || session.data.url);
  const logs = await client.fetchLogText(url, {
    baseEnv: config,
    source: options.source,
    fetchImpl: options.logFetchImpl || options.fetchImpl,
  });
  return {
    data: logs,
    meta: session.meta,
    status: 200,
  };
}

async function execute(descriptor, rawInput, options = {}) {
  const input = stripControl(rawInput);
  const config = policy.enforce({
    input: { ...input.params, body: input.body, approval: input.approval },
    descriptor,
    baseEnv: options.baseEnv,
    source: options.source,
  });

  if (descriptor.operationId === 'queryHerokuLogs') {
    return queryLogs(descriptor, input, config, options);
  }

  if (descriptor.operationId === 'uploadHerokuSourceArchive') {
    const body = input.body || {};
    const data = await sourceUpload.upload(
      {
        capability: input.params.capability || body.capability,
        repository: body.repository,
        commitSha: body.commitSha,
        sourceDirectory: body.sourceDirectory,
      },
      {
        ...options,
        baseEnv: config,
      }
    );
    return { data: serializer.serialize(descriptor.operationId, data), meta: {}, status: 200 };
  }

  const upstream = UPSTREAM_OVERRIDES[descriptor.operationId] || descriptor.upstream;
  const result = await client.request(descriptor.method, pathFor(upstream, input.params), {
    baseEnv: config,
    source: options.source,
    fetchImpl: options.fetchImpl,
    expectedEtag: input.expectedEtag,
    range: input.range,
    query: input.query,
    body: requestBody(descriptor, input, options),
  });

  if (descriptor.operationId === 'createHerokuSource') {
    const capability = sourceUpload.issue(result.data, { now: options.now || Date.now() });
    result.data = {
      id: result.data && result.data.id,
      source_blob: capability,
    };
  }

  if (
    descriptor.operationId === 'listHerokuConfigVarMetadata' ||
    descriptor.operationId === 'listHerokuPipelineConfigVarMetadata'
  ) {
    result.data = policy.redactConfigVars(result.data || {});
  } else if (descriptor.operationId === 'getHerokuAppStack') {
    result.data = serializer.serialize(
      descriptor.operationId,
      result.data && result.data.build_stack
    );
  } else {
    result.data = policy.filterCollection(descriptor.operationId, result.data, config);
    result.data = serializer.serialize(descriptor.operationId, result.data);
  }

  return result;
}

module.exports = {
  execute,
  queryLogs,
  pathFor,
  stripControl,
  sanitizeBody,
  requestBody,
  UPSTREAM_OVERRIDES,
};