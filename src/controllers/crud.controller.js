'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendResource } = require('../utils/responses');
const crudService = require('../services/crud.service');

function create(domainName) {
  return asyncHandler(async (req, res) => {
    const record = await crudService.createRecord(domainName, req.validated.body);
    sendResource(res, record, 201);
  });
}

function patch(domainName, paramName = null) {
  return asyncHandler(async (req, res) => {
    const identifier = paramName ? req.validated.params[paramName] : null;
    const record = await crudService.updateRecord(domainName, identifier, req.validated.body);
    sendResource(res, record);
  });
}

function remove(domainName, paramName = null) {
  return asyncHandler(async (req, res) => {
    const identifier = paramName ? req.validated.params[paramName] : null;
    const record = await crudService.archiveRecord(domainName, identifier);
    sendResource(res, record);
  });
}

module.exports = { create, patch, remove };
