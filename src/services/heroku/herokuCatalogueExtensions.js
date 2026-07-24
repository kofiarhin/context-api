'use strict';

module.exports = [
  { method: 'POST', route: '/apps/:app/logs/query', upstream: '/apps/{app}/log-sessions', operationId: 'queryHerokuLogs', classification: 'read' },
  { method: 'PATCH', route: '/apps/:app/webhooks/:webhook', upstream: '/apps/{app}/webhooks/{webhook}', operationId: 'updateHerokuAppWebhook', classification: 'production-sensitive' },
  { method: 'GET', route: '/pipelines/:pipeline/review-app-config', upstream: '/pipelines/{pipeline}/review-app-config', operationId: 'getHerokuReviewAppConfig', classification: 'read' },
  { method: 'POST', route: '/pipelines/:pipeline/review-app-config', upstream: '/pipelines/{pipeline}/review-app-config', operationId: 'enableHerokuReviewAppConfig', classification: 'production-sensitive' },
  { method: 'PATCH', route: '/pipelines/:pipeline/review-app-config', upstream: '/pipelines/{pipeline}/review-app-config', operationId: 'updateHerokuReviewAppConfig', classification: 'production-sensitive' },
  { method: 'DELETE', route: '/pipelines/:pipeline/review-app-config', upstream: '/pipelines/{pipeline}/review-app-config', operationId: 'disableHerokuReviewAppConfig', classification: 'destructive' },
  { method: 'GET', route: '/pipelines/:pipeline/webhooks', upstream: '/pipelines/{pipeline}/webhooks', operationId: 'listHerokuPipelineWebhooks', classification: 'read' },
  { method: 'POST', route: '/pipelines/:pipeline/webhooks', upstream: '/pipelines/{pipeline}/webhooks', operationId: 'createHerokuPipelineWebhook', classification: 'production-sensitive' },
  { method: 'GET', route: '/pipelines/:pipeline/webhooks/:webhook', upstream: '/pipelines/{pipeline}/webhooks/{webhook}', operationId: 'getHerokuPipelineWebhook', classification: 'read' },
  { method: 'PATCH', route: '/pipelines/:pipeline/webhooks/:webhook', upstream: '/pipelines/{pipeline}/webhooks/{webhook}', operationId: 'updateHerokuPipelineWebhook', classification: 'production-sensitive' },
  { method: 'DELETE', route: '/pipelines/:pipeline/webhooks/:webhook', upstream: '/pipelines/{pipeline}/webhooks/{webhook}', operationId: 'deleteHerokuPipelineWebhook', classification: 'destructive' },
  { method: 'GET', route: '/pipelines/:pipeline/stack', upstream: '/pipelines/{pipeline}/pipeline-stack', operationId: 'getHerokuPipelineStack', classification: 'read' },
  { method: 'PATCH', route: '/pipelines/:pipeline/stack', upstream: '/pipelines/{pipeline}/pipeline-stack', operationId: 'updateHerokuPipelineStack', classification: 'production-sensitive' },
];
