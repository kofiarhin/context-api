'use strict';

const { normalizeTerm } = require('../models/glossaryEntry.model');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { REGISTRY, REQUIRED_DOMAINS, identityLabel } = require('./registry');

function collectIdentities(domain) {
  return domain.records.map((record) => identityLabel(domain, record));
}

/**
 * Validates every seed record before any write happens.
 *
 * Returns a list of human-readable problems. An empty list means the seed set is
 * internally consistent and safe to apply.
 */
async function validateSeedData(registry = REGISTRY) {
  const problems = [];
  const byName = new Map(registry.map((domain) => [domain.name, domain]));

  for (const name of REQUIRED_DOMAINS) {
    const domain = byName.get(name);

    if (!domain || domain.records.length === 0) {
      problems.push(`Domain "${name}" has no seed records.`);
    }
  }

  for (const domain of registry) {
    const seen = new Set();

    for (const [index, record] of domain.records.entries()) {
      const label = identityLabel(domain, record);
      const position = `${domain.name}[${index}]`;

      for (const field of domain.identity) {
        if (record[field] === undefined || record[field] === null || record[field] === '') {
          problems.push(`${position} is missing identity field "${field}".`);
        }
      }

      if (seen.has(label)) {
        problems.push(`${position} duplicates identity (${label}).`);
      }
      seen.add(label);

      // Schema-level validation without touching the database.
      const document = new domain.Model(record);

      try {
        await document.validate();
      } catch (error) {
        if (!error || error.name !== 'ValidationError' || !error.errors) {
          throw error;
        }

        for (const [field, detail] of Object.entries(error.errors)) {
          problems.push(`${position} (${label}) field "${field}": ${detail.message}`);
        }
      }
    }
  }

  problems.push(...validateCrossReferences(byName));
  problems.push(...validateGlossary(byName));

  return problems;
}

function validateCrossReferences(byName) {
  const problems = [];

  const projectIds = new Set((byName.get('projects')?.records || []).map((r) => r.projectId));
  const slugs = new Set();

  for (const project of byName.get('projects')?.records || []) {
    if (slugs.has(project.slug)) {
      problems.push(`projects: duplicate slug "${project.slug}".`);
    }
    slugs.add(project.slug);
  }

  for (const convention of byName.get('codingConventions')?.records || []) {
    if (convention.scope === 'project' && !projectIds.has(convention.projectId)) {
      problems.push(
        `codingConventions "${convention.key}" references unknown projectId "${convention.projectId}".`
      );
    }
  }

  const taskIds = new Set((byName.get('tasks')?.records || []).map((r) => r.taskId));

  for (const task of byName.get('tasks')?.records || []) {
    if (!projectIds.has(task.projectId)) {
      problems.push(`tasks "${task.taskId}" references unknown projectId "${task.projectId}".`);
    }

    for (const dependency of task.dependencies || []) {
      if (!taskIds.has(dependency)) {
        problems.push(`tasks "${task.taskId}" depends on unknown taskId "${dependency}".`);
      }
    }
  }

  const learningIds = new Set((byName.get('learnings')?.records || []).map((r) => r.learningId));

  for (const learning of byName.get('learnings')?.records || []) {
    if (learning.projectId && !projectIds.has(learning.projectId)) {
      problems.push(
        `learnings "${learning.learningId}" references unknown projectId "${learning.projectId}".`
      );
    }

    if (learning.supersedes && !learningIds.has(learning.supersedes)) {
      problems.push(
        `learnings "${learning.learningId}" supersedes unknown learningId "${learning.supersedes}".`
      );
    }

    if (learning.supersedes === learning.learningId) {
      problems.push(`learnings "${learning.learningId}" supersedes itself.`);
    }
  }

  return problems;
}

/**
 * Glossary lookups resolve by normalized key first and alias second, so an alias
 * shared by two published entries (or one that shadows a key) would make a term
 * unresolvable. Both cases are rejected here (SPEC §8.7).
 */
function validateGlossary(byName) {
  const problems = [];
  const entries = byName.get('glossaryEntries')?.records || [];

  const keys = new Set(entries.map((entry) => entry.normalizedKey));
  const aliasOwners = new Map();

  for (const entry of entries) {
    if (entry.normalizedKey !== normalizeTerm(entry.term)) {
      problems.push(
        `glossaryEntries "${entry.term}" has normalizedKey "${entry.normalizedKey}" but normalizes to "${normalizeTerm(entry.term)}".`
      );
    }

    const published = PUBLISHED_STATUSES.includes(entry.status);

    for (const alias of entry.aliases || []) {
      if (alias !== normalizeTerm(alias)) {
        problems.push(`glossaryEntries "${entry.term}" alias "${alias}" is not normalized.`);
      }

      if (keys.has(alias)) {
        problems.push(
          `glossaryEntries "${entry.term}" alias "${alias}" collides with an existing normalizedKey.`
        );
      }

      if (!published) {
        continue;
      }

      if (aliasOwners.has(alias)) {
        problems.push(
          `glossaryEntries alias "${alias}" is claimed by both "${aliasOwners.get(alias)}" and "${entry.normalizedKey}".`
        );
      }

      aliasOwners.set(alias, entry.normalizedKey);
    }
  }

  return problems;
}

module.exports = { validateSeedData, validateCrossReferences, validateGlossary, collectIdentities };
