'use strict';

const { Router } = require('express');

const controller = require('../../controllers/zoro.controller');
const { RouteNotFoundError } = require('../../utils/errors');

const router = Router();

/**
 * The single executable surface of the unified Zoro engineering Action.
 *
 * One route, one path parameter drawn from a closed set of fifteen dispatcher
 * ids. This is deliberately *not* a proxy: `operationId` selects a catalogue
 * entry, it does not name an upstream path, and the request body carries no
 * method, URL, or header field.
 */
router.post('/operations/:operationId', controller.execute);

/**
 * Terminates the Zoro namespace.
 *
 * Without this, an unmatched `/api/v1/zoro/*` path would fall through to the
 * context router and hit the MongoDB availability guard, so an unknown route
 * could report DATABASE_UNAVAILABLE instead of a 404.
 */
router.use((req, res, next) => {
  next(new RouteNotFoundError());
});

module.exports = router;
