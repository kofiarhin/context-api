'use strict';

/**
 * Response allowlists.
 *
 * Every domain maps explicitly from stored document to response body. Nothing is
 * spread from the raw document, so a new internal field cannot leak by default.
 */

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value == null ? null : value;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function serializeSource(source) {
  if (!source) {
    return null;
  }

  return { type: source.type, reference: source.reference ?? null };
}

function baseFields(doc) {
  return {
    tags: toArray(doc.tags),
    source: serializeSource(doc.source),
    status: doc.status,
    archivedAt: toIso(doc.archivedAt),
    version: doc.version,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

function summaryBaseFields(doc) {
  return {
    tags: toArray(doc.tags),
    source: serializeSource(doc.source),
    status: doc.status,
    version: doc.version,
    updatedAt: toIso(doc.updatedAt),
  };
}

function serializeProfile(doc) {
  return {
    key: doc.key,
    displayName: doc.displayName,
    description: doc.description ?? null,
    professionalRoles: toArray(doc.professionalRoles),
    preferredStack: toArray(doc.preferredStack),
    responsePreferences: toArray(doc.responsePreferences),
    testingPreferences: toArray(doc.testingPreferences),
    architecturePreferences: toArray(doc.architecturePreferences),
    communicationPreferences: toArray(doc.communicationPreferences),
    ...baseFields(doc),
  };
}

function serializeProfileSummary(doc) {
  return {
    key: doc.key,
    displayName: doc.displayName,
    professionalRoles: toArray(doc.professionalRoles),
    preferredStack: toArray(doc.preferredStack),
    responsePreferences: toArray(doc.responsePreferences),
    testingPreferences: toArray(doc.testingPreferences),
    architecturePreferences: toArray(doc.architecturePreferences),
    communicationPreferences: toArray(doc.communicationPreferences),
    ...summaryBaseFields(doc),
  };
}

function serializeCodingConvention(doc) {
  return {
    key: doc.key,
    title: doc.title,
    description: doc.description ?? null,
    rules: toArray(doc.rules),
    scope: doc.scope,
    technology: toArray(doc.technology),
    layer: toArray(doc.layer),
    projectId: doc.projectId ?? null,
    priority: doc.priority,
    ...baseFields(doc),
  };
}

function serializeCodingConventionSummary(doc) {
  return {
    key: doc.key,
    title: doc.title,
    description: doc.description ?? null,
    scope: doc.scope,
    technology: toArray(doc.technology),
    layer: toArray(doc.layer),
    projectId: doc.projectId ?? null,
    priority: doc.priority,
    ...summaryBaseFields(doc),
  };
}

function serializeProject(doc) {
  return {
    projectId: doc.projectId,
    slug: doc.slug,
    name: doc.name,
    summary: doc.summary ?? null,
    description: doc.description ?? null,
    lifecycleState: doc.lifecycleState,
    repositoryUrl: doc.repositoryUrl ?? null,
    liveUrl: doc.liveUrl ?? null,
    technologyStack: toArray(doc.technologyStack),
    currentFocus: doc.currentFocus ?? null,
    milestones: toArray(doc.milestones).map((milestone) => ({
      key: milestone.key,
      title: milestone.title,
      status: milestone.status,
      targetDate: toIso(milestone.targetDate),
    })),
    architectureSummary: doc.architectureSummary ?? null,
    relatedContextReferences: toArray(doc.relatedContextReferences).map((reference) => ({
      type: reference.type,
      reference: reference.reference,
    })),
    ...baseFields(doc),
  };
}

function serializeProjectSummary(doc) {
  return {
    projectId: doc.projectId,
    slug: doc.slug,
    name: doc.name,
    summary: doc.summary ?? null,
    lifecycleState: doc.lifecycleState,
    repositoryUrl: doc.repositoryUrl ?? null,
    liveUrl: doc.liveUrl ?? null,
    technologyStack: toArray(doc.technologyStack),
    currentFocus: doc.currentFocus ?? null,
    ...summaryBaseFields(doc),
  };
}

function serializeTask(doc) {
  return {
    taskId: doc.taskId,
    title: doc.title,
    description: doc.description ?? null,
    projectId: doc.projectId,
    status: doc.status,
    priority: doc.priority,
    acceptanceCriteria: toArray(doc.acceptanceCriteria),
    dependencies: toArray(doc.dependencies),
    tags: toArray(doc.tags),
    source: serializeSource(doc.source),
    archivedAt: toIso(doc.archivedAt),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

function serializeTaskSummary(doc) {
  return {
    taskId: doc.taskId,
    title: doc.title,
    projectId: doc.projectId,
    status: doc.status,
    priority: doc.priority,
    dependencies: toArray(doc.dependencies),
    tags: toArray(doc.tags),
    source: serializeSource(doc.source),
    updatedAt: toIso(doc.updatedAt),
  };
}

function serializeInstructionSet(doc) {
  return {
    key: doc.key,
    title: doc.title,
    description: doc.description ?? null,
    instructions: toArray(doc.instructions),
    content: doc.content ? { format: doc.content.format, body: doc.content.body } : null,
    workflowStage: doc.workflowStage,
    applicableClients: toArray(doc.applicableClients),
    ...baseFields(doc),
  };
}

function serializeInstructionSetSummary(doc) {
  return {
    key: doc.key,
    title: doc.title,
    description: doc.description ?? null,
    workflowStage: doc.workflowStage,
    applicableClients: toArray(doc.applicableClients),
    ...summaryBaseFields(doc),
  };
}

function serializeIdeasHubContext(doc) {
  return {
    section: doc.section,
    title: doc.title,
    description: doc.description ?? null,
    canonicalFiles: toArray(doc.canonicalFiles).map((file) => ({
      path: file.path,
      responsibility: file.responsibility,
    })),
    repositoryLayout: toArray(doc.repositoryLayout).map((entry) => ({
      path: entry.path,
      description: entry.description,
    })),
    lifecycleDefinitions: toArray(doc.lifecycleDefinitions).map((definition) => ({
      name: definition.name,
      description: definition.description,
    })),
    workflowDefinitions: toArray(doc.workflowDefinitions).map((definition) => ({
      name: definition.name,
      description: definition.description,
    })),
    sourceOfTruthRules: toArray(doc.sourceOfTruthRules),
    recordRelationships: toArray(doc.recordRelationships).map((relationship) => ({
      from: relationship.from,
      to: relationship.to,
      relationship: relationship.relationship,
    })),
    updateRoutingRules: toArray(doc.updateRoutingRules).map((rule) => ({
      change: rule.change,
      destination: rule.destination,
    })),
    ...baseFields(doc),
  };
}

function serializeIdeasHubContextSummary(doc) {
  return {
    section: doc.section,
    title: doc.title,
    description: doc.description ?? null,
    ...summaryBaseFields(doc),
  };
}

function serializeGlossaryEntry(doc) {
  return {
    term: doc.term,
    normalizedKey: doc.normalizedKey,
    definition: doc.definition,
    aliases: toArray(doc.aliases),
    scope: doc.scope,
    relatedTerms: toArray(doc.relatedTerms),
    description: doc.description ?? null,
    ...baseFields(doc),
  };
}

function serializeGlossaryEntrySummary(doc) {
  return {
    term: doc.term,
    normalizedKey: doc.normalizedKey,
    definition: doc.definition,
    scope: doc.scope,
    ...summaryBaseFields(doc),
  };
}

function serializeLearning(doc) {
  return {
    learningId: doc.learningId,
    title: doc.title,
    content: doc.content,
    category: doc.category,
    projectId: doc.projectId ?? null,
    evidence: toArray(doc.evidence).map((entry) => ({
      type: entry.type,
      reference: entry.reference,
      note: entry.note ?? null,
    })),
    reviewStatus: doc.reviewStatus,
    supersedes: doc.supersedes ?? null,
    description: doc.description ?? null,
    ...baseFields(doc),
  };
}

function serializeLearningSummary(doc) {
  return {
    learningId: doc.learningId,
    title: doc.title,
    category: doc.category,
    projectId: doc.projectId ?? null,
    reviewStatus: doc.reviewStatus,
    supersedes: doc.supersedes ?? null,
    description: doc.description ?? null,
    ...summaryBaseFields(doc),
  };
}

function serializeMany(serializer) {
  return (docs) => docs.map((doc) => serializer(doc));
}

module.exports = {
  serializeProfile,
  serializeProfileSummary,
  serializeCodingConvention,
  serializeCodingConventionSummary,
  serializeProject,
  serializeProjectSummary,
  serializeTask,
  serializeTaskSummary,
  serializeInstructionSet,
  serializeInstructionSetSummary,
  serializeIdeasHubContext,
  serializeIdeasHubContextSummary,
  serializeGlossaryEntry,
  serializeGlossaryEntrySummary,
  serializeLearning,
  serializeLearningSummary,
  serializeMany,
  serializeSource,
};
