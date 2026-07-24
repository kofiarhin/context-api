'use strict';

const client = require('./herokuClient');
const policy = require('./herokuPolicy');

function pathFor(template, params) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => encodeURIComponent(params[key]));
}

function stripControl(input) {
  const { approval, expectedEtag, range, body, query, ...params } = input;
  return { approval, expectedEtag, range, body, query, params };
}

function deleteConfigBody(input) {
  if (input.descriptor.operationId !== 'deleteHerokuConfigVar') return input.body;
  return { [input.params.key]: null };
}

async function execute(descriptor, rawInput, options = {}) {
  const input = stripControl(rawInput);
  const config = policy.enforce({
    input: { ...input.params, body: input.body, approval: input.approval },
    descriptor,
    baseEnv: options.baseEnv,
    source: options.source,
  });

  const result = await client.request(descriptor.method, pathFor(descriptor.upstream, input.params), {
    baseEnv: config,
    source: options.source,
    fetchImpl: options.fetchImpl,
    expectedEtag: input.expectedEtag,
    range: input.range,
    query: input.query,
    body: deleteConfigBody({ descriptor, params: input.params, body: input.body }),
  });

  if (descriptor.operationId === 'listHerokuConfigVarMetadata' || descriptor.operationId === 'listHerokuPipelineConfigVarMetadata') {
    result.data = policy.redactConfigVars(result.data || {});
  }

  return result;
}

module.exports = { execute, pathFor, stripControl };
