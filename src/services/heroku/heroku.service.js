'use strict';

const { ValidationError } = require('../../utils/errors');
const serializer = require('../../serializers/heroku.serializer');
const client = require('./herokuClient');
const policy = require('./herokuPolicy');

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

function requestBody(descriptor, input) {
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

  const upstream = UPSTREAM_OVERRIDES[descriptor.operationId] || descriptor.upstream;
  const result = await client.request(descriptor.method, pathFor(upstream, input.params), {
    baseEnv: config,
    source: options.source,
    fetchImpl: options.fetchImpl,
    expectedEtag: input.expectedEtag,
    range: input.range,
    query: input.query,
    body: requestBody(descriptor, input),
  });

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
