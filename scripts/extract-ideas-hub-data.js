'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [, , ideasHubRoot = '../ideahub', outputArg = 'src/seeds/data/projects.js'] = process.argv;
const sourcePath = path.resolve(ideasHubRoot, 'PROJECTS.md');
const outputPath = path.resolve(outputArg);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCellLink(cell) {
  const match = cell.match(/^\[([^\]]+)]\(([^)]+)\)$/);
  return match ? { name: match[1], projectFile: match[2] } : { name: cell, projectFile: null };
}

function lifecycleFromNotes(notes) {
  if (/\bactive\b/i.test(notes)) return 'active';
  if (/\bpaused\b/i.test(notes)) return 'paused';
  if (/\b(shipped|completed)\b/i.test(notes)) return 'completed';
  if (/\barchived\b/i.test(notes)) return 'archived';
  return 'ideation';
}

function parseProjects(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('| [') && !line.includes('| ---'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .map(([projectCell, summary, repositoryUrl, liveUrl, notes]) => {
      const { name, projectFile } = parseCellLink(projectCell);
      const slug = slugify(name);
      const sourceReference = projectFile
        ? `kofiarhin/ideahub/${projectFile}`
        : 'kofiarhin/ideahub/PROJECTS.md';

      return {
        projectId: slug,
        slug,
        name,
        summary,
        description: notes || summary,
        lifecycleState: lifecycleFromNotes(notes || ''),
        repositoryUrl: repositoryUrl === '—' ? null : repositoryUrl,
        liveUrl: liveUrl === '—' ? null : liveUrl,
        technologyStack: [],
        currentFocus: notes || null,
        milestones: [],
        architectureSummary: null,
        relatedContextReferences: [{ type: 'ideas-hub', reference: sourceReference }],
        tags: ['ideas-hub'],
        source: { type: 'ideas-hub', reference: sourceReference },
        status: /\bactive\b/i.test(notes || '') ? 'active' : 'draft',
        version: 1,
      };
    });
}

function serialize(projects) {
  return `'use strict';\n\n// Generated from kofiarhin/ideahub PROJECTS.md.\n// Refresh with: npm run data:extract -- /path/to/ideahub\n\nmodule.exports = ${JSON.stringify(projects, null, 2)};\n`;
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Ideas Hub PROJECTS.md not found: ${sourcePath}`);
}

const projects = parseProjects(fs.readFileSync(sourcePath, 'utf8'));
if (projects.length === 0) {
  throw new Error(`No project rows found in ${sourcePath}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serialize(projects));
process.stdout.write(`Extracted ${projects.length} projects to ${outputPath}\n`);
