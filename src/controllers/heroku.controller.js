'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { API_VERSION } = require('../utils/responses');
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
    if (result.status === 204) {
      res.status(204).end();
      return;
    }
    res.status(result.status || 200).json({
      data: result.data,
      meta: { ...(result.meta || {}), version: API_VERSION },
    });
  });
}

module.exports = { handler };
