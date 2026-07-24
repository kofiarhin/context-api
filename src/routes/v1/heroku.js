'use strict';

const { Router } = require('express');
const routes = require('../../services/heroku/herokuRoutes');
const controller = require('../../controllers/heroku.controller');
const { RouteNotFoundError } = require('../../utils/errors');

const router = Router();

for (const descriptor of routes) {
  router[descriptor.method.toLowerCase()](descriptor.route, controller.handler(descriptor));
}

router.use((req, res, next) => next(new RouteNotFoundError()));

module.exports = router;
