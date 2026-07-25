'use strict';

module.exports = {
  Profile: require('./profile.model'),
  CodingConvention: require('./codingConvention.model'),
  Project: require('./project.model'),
  Task: require('./task.model'),
  InstructionSet: require('./instructionSet.model'),
  IdeasHubContext: require('./ideasHubContext.model'),
  GlossaryEntry: require('./glossaryEntry.model'),
  Learning: require('./learning.model'),
  // Append-only; deliberately absent from CRUD_DOMAINS so the generic write and
  // soft-delete paths can never reach it.
  DevOpsLogEntry: require('./devopsLogEntry.model'),
};
