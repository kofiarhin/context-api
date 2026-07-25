'use strict';

const { Router } = require('express');
const routes = require('../../services/heroku/herokuRoutes');
const controller = require('../../controllers/heroku.controller');
const validateHeroku = require('../../middleware/validateHeroku');
const { RouteNotFoundError, ResourceNotFoundError } = require('../../utils/errors');

const router = Router();
const byOperationId = new Map(routes.map((descriptor) => [descriptor.operationId, descriptor]));

router.post('/operations/:operationId', validateHeroku, (req, res, next) => {
  const descriptor = byOperationId.get(req.params.operationId);
  if (!descriptor) {
    next(new ResourceNotFoundError('The requested Heroku operation was not found.'));
    return;
  }
  controller.handler(descriptor, { dispatch: true })(req, res, next);
});

for (const descriptor of routes) {
  router[descriptor.method.toLowerCase()](
    descriptor.route,
    validateHeroku,
    controller.handler(descriptor)
  );
}

router.use((req, res, next) => next(new RouteNotFoundError()));

module.exports = router;
module.exports.byOperationId = byOperationId;
