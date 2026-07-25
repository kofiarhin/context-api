'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource, sendPagedCollection } = require('../utils/responses');
const zoroDispatcher = require('../services/zoro/zoroDispatcher');

/**
 * The unified Zoro engineering dispatcher controller.
 *
 * Thin by design, exactly like the other gateway controllers: it hands the
 * already-parsed body to the dispatcher and emits the shared envelope. Every
 * catalogue lookup, policy check, and service call happens in
 * `services/zoro/zoroDispatcher`.
 */
const execute = asyncHandler(async (req, res) => {
  const outcome = await zoroDispatcher.dispatch(req.params.operationId, req.body);

  if (outcome.collection) {
    sendPagedCollection(res, outcome.result, outcome.meta, outcome.status);
    return;
  }

  sendResource(res, outcome.result, outcome.status, outcome.meta);
});

module.exports = { execute };
