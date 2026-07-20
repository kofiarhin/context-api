'use strict';

const { getCrudDomain } = require('../config/crudDomains');
const { ConflictError, ResourceNotFoundError } = require('../utils/errors');

function buildIdentifierFilter(config, rawIdentifier) {
  const identifier = config.normalizeIdentifier
    ? config.normalizeIdentifier(rawIdentifier)
    : rawIdentifier;

  return { [config.identifierField]: identifier };
}

function findByIdentifier(config, rawIdentifier) {
  let query = config.Model.findOne(buildIdentifierFilter(config, rawIdentifier));

  if (config.lookupSort) {
    query = query.sort(config.lookupSort);
  }

  return query;
}

async function findSingletonForWrite(config) {
  const current = await config.Model.findOne({
    status: { $ne: 'archived' },
  }).sort({
    updatedAt: -1,
    key: 1,
  });

  if (current) {
    return current;
  }

  return config.Model.findOne({ status: 'archived' }).sort({
    updatedAt: -1,
    key: 1,
  });
}

async function createRecord(domainName, payload) {
  const config = getCrudDomain(domainName);
  const identifierFilter = buildIdentifierFilter(config, payload[config.identifierField]);
  const duplicate = await config.Model.exists(identifierFilter);

  if (duplicate) {
    throw new ConflictError(`${config.label} identifier already exists.`, [
      { field: config.identifierField, message: 'Value must be unique.' },
    ]);
  }

  if (config.singleton) {
    const existingSingleton = await config.Model.exists({
      status: { $ne: 'archived' },
    });

    if (existingSingleton) {
      throw new ConflictError('An active profile already exists.');
    }
  }

  const document = new config.Model(payload, null, { strict: 'throw' });

  if (document.status === 'archived') {
    document.archivedAt = new Date();
  }

  await document.save();
  return config.serializer(document);
}

async function updateRecord(domainName, rawIdentifier, payload) {
  const config = getCrudDomain(domainName);
  const document = config.singleton
    ? await findSingletonForWrite(config)
    : await findByIdentifier(config, rawIdentifier);

  if (!document) {
    throw new ResourceNotFoundError(`${config.label} was not found.`);
  }

  const wasArchived = document.status === 'archived';
  document.set(payload, null, { strict: 'throw' });

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    if (document.status === 'archived') {
      if (!wasArchived || !document.archivedAt) {
        document.archivedAt = new Date();
      }
    } else {
      document.archivedAt = null;
    }
  }

  await document.save();
  return config.serializer(document);
}

async function archiveRecord(domainName, rawIdentifier) {
  const config = getCrudDomain(domainName);
  const document = config.singleton
    ? await findSingletonForWrite(config)
    : await findByIdentifier(config, rawIdentifier);

  if (!document) {
    throw new ResourceNotFoundError(`${config.label} was not found.`);
  }

  if (document.status !== 'archived') {
    document.status = 'archived';
    document.archivedAt = new Date();
    await document.save();
  } else if (!document.archivedAt) {
    document.archivedAt = new Date();
    await document.save();
  }

  return config.serializer(document);
}

module.exports = {
  buildIdentifierFilter,
  createRecord,
  updateRecord,
  archiveRecord,
};
