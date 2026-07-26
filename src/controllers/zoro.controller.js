'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ResourceNotFoundError, ValidationError } = require('../utils/errors');
const { sendResource, sendPagedCollection } = require('../utils/responses');
const zoroCatalogue = require('../services/zoro/zoroCatalogue');
const zoroDispatcher = require('../services/zoro/zoroDispatcher');

function sendOutcome(res, outcome) {
  if (outcome.collection) {
    sendPagedCollection(res, outcome.result, outcome.meta, outcome.status);
    return;
  }

  sendResource(res, outcome.result, outcome.status, outcome.meta);
}

/**
 * Resolves a request against the closed catalogue and refuses anything that is
 * not classified as read before any provider or persistence service is called.
 */
function normalizeReadRequest(operationId, body) {
  const dispatcher = zoroCatalogue.getDispatcher(operationId);

  if (!dispatcher) {
    throw new ResourceNotFoundError(
      `Unknown engineering operation "${operationId}".`,
      zoroCatalogue.DISPATCHER_IDS.map((id) => ({ field: 'operationId', message: id }))
    );
  }

  const request = zoroDispatcher.normalizeEnvelope(dispatcher, body);
  const operation = zoroCatalogue.getOperation(dispatcher, request.operation);

  if (!operation) {
    throw new ValidationError(
      `Operation "${request.operation}" is not allowed by the ${operationId} dispatcher.`,
      Object.keys(dispatcher.operations).map((name) => ({ field: 'operation', message: name }))
    );
  }

  if (operation.classification !== zoroCatalogue.CLASSIFICATIONS.READ) {
    throw new ValidationError(
      `Operation "${request.operation}" is not available through the read-only Zoro Action.`
    );
  }

  return request;
}

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
  sendOutcome(res, outcome);
});

/**
 * The non-consequential read surface used by the Custom GPT Action.
 *
 * The server resolves the exact catalogue operation and verifies its
 * classification before dispatching. Dispatcher names alone are insufficient:
 * `github.review` and `heroku.execute` intentionally contain mixed-risk
 * operations.
 */
const executeRead = asyncHandler(async (req, res) => {
  const request = normalizeReadRequest(req.params.operationId, req.body);
  const outcome = await zoroDispatcher.dispatch(req.params.operationId, request);
  sendOutcome(res, outcome);
});

module.exports = { execute, executeRead, normalizeReadRequest };
