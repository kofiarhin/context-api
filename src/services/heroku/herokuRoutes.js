'use strict';

const coreRoutes = require('./herokuCatalogue');
const extensionRoutes = require('./herokuCatalogueExtensions');

const replacements = {
  getHerokuAppStack: {
    method: 'GET',
    route: '/apps/:app/stack',
    upstream: '/apps/{app}',
    operationId: 'getHerokuAppStack',
    classification: 'read',
  },
  updateHerokuAppStack: {
    method: 'PATCH',
    route: '/apps/:app/stack',
    upstream: '/apps/{app}',
    operationId: 'updateHerokuAppStack',
    classification: 'production-sensitive',
  },
  stopHerokuDyno: {
    method: 'DELETE',
    route: '/apps/:app/dynos/:dyno/restart',
    upstream: '/apps/{app}/dynos/{dyno}',
    operationId: 'restartHerokuDyno',
    classification: 'production-sensitive',
  },
};

const normalizedCoreRoutes = coreRoutes.map((route) => replacements[route.operationId] || route);

const runtimeActions = [
  {
    method: 'POST',
    route: '/sources/:capability/upload',
    upstream: '/sources',
    operationId: 'uploadHerokuSourceArchive',
    classification: 'production-sensitive',
  },
  {
    method: 'POST',
    route: '/apps/:app/dynos/:dyno/stop',
    upstream: '/apps/{app}/dynos/{dyno}/actions/stop',
    operationId: 'stopHerokuDyno',
    classification: 'production-sensitive',
  },
  {
    method: 'DELETE',
    route: '/apps/:app/formations/:type/restart',
    upstream: '/apps/{app}/formations/{type}',
    operationId: 'restartHerokuFormationDynos',
    classification: 'production-sensitive',
  },
  {
    method: 'POST',
    route: '/apps/:app/formations/:type/stop',
    upstream: '/apps/{app}/formations/{type}/actions/stop',
    operationId: 'stopHerokuFormationDynos',
    classification: 'production-sensitive',
  },
  {
    method: 'GET',
    route: '/apps/:app/available-stacks',
    upstream: '/apps/{app}/available-stacks',
    operationId: 'listHerokuAppStacks',
    classification: 'read',
  },
  {
    method: 'GET',
    route: '/apps/:app/available-dyno-sizes',
    upstream: '/apps/{app}/available-dyno-sizes',
    operationId: 'listHerokuAppDynoSizes',
    classification: 'read',
  },
];

module.exports = normalizedCoreRoutes.concat(extensionRoutes, runtimeActions);