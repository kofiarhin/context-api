'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource } = require('../utils/responses');
const service = require('../services/heroku/heroku.service');

function handler(descriptor) {
  return asyncHandler(async (req, res) => {
    const input = {
      ...req.params,
      body: req.body,
      query: req.query,
      approval: req.body && req.body.approval,
      expectedEtag: req.get('if-match') || (req.body && req.body.expectedEtag),
      range: req.get('range'),
    };
    const result = await service.execute(descriptor, input);
    if (result.meta) res.locals.providerMeta = result.meta;
    sendResource(res, result.data, result.status === 201 ? 201 : result.status === 202 ? 202 : 200);
  });
}

module.exports = { handler };
