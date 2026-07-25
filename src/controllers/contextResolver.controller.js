'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource } = require('../utils/responses');
const { serializeResolvedContext } = require('../serializers/contextResolver.serializer');
const contextResolverService = require('../services/contextResolver.service');

const resolveContext = asyncHandler(async (req, res) => {
  const resolved = await contextResolverService.resolveContext(req.validated.filters);

  sendResource(res, serializeResolvedContext(resolved));
});

module.exports = { resolveContext };
