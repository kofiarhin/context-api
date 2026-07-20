'use strict';

const { Profile } = require('../models');
const { PUBLISHED_STATUSES } = require('../utils/enums');

const DEFAULT_KEY = 'primary';

/**
 * Resolves the active profile, preferring the canonical `primary` record and
 * falling back to the most recently updated published profile.
 */
async function getActiveProfile() {
  const published = { status: { $in: PUBLISHED_STATUSES } };

  const primary = await Profile.findOne({ key: DEFAULT_KEY, ...published }).lean();

  if (primary) {
    return primary;
  }

  return Profile.findOne(published).sort({ updatedAt: -1, key: 1 }).lean();
}

module.exports = { getActiveProfile, DEFAULT_KEY };
