'use strict';

const coreRoutes = require('./herokuCatalogue');
const extensionRoutes = require('./herokuCatalogueExtensions');

module.exports = coreRoutes.concat(extensionRoutes);
