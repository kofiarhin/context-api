'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { API_VERSION } = require('../utils/responses');
const service = require('../services/heroku/heroku.service');

function inputFromRequest(req, dispatch = false) {
  if (dispatch) {
    const envelope = req.body || {};
    return {
      ...(envelope.params || {}),
      body: envelope.body || {},
      query: envelope.query || {},
      approval: envelope.approval,
      expectedEtag: req.get('if-match') || envelope.expectedEtag,
      range: req.get('range') || envelope.range,
    };
  }

  return {
    ...req.params,
    body: req.body,
    query: req.query,
    approval: req.body && req.body.approval,
    expectedEtag: req.get('if-match') || (req.body && req.body.expectedEtag),
    range: req.get('range'),
  };
}

function respond(res, result) {
  if (result.status === 204) {
    res.status(204).end();
    return;
  }
  res.status(result.status || 200).json({
    data: result.data,
    meta: { ...(result.meta || {}), version: API_VERSION },
  });
}

function handler(descriptor, options = {}) {
  return asyncHandler(async (req, res) => {
    const result = await service.execute(descriptor, inputFromRequest(req, options.dispatch));
    respond(res, result);
  });
}

module.exports = { handler, inputFromRequest, respond };
