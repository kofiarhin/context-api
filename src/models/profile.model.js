'use strict';

const { Schema, model } = require('mongoose');

const { sharedFields, applyBaseOptions } = require('./shared');

const profileSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, default: 'primary' },
  displayName: { type: String, required: true, trim: true, maxlength: 200 },
  professionalRoles: { type: [String], default: () => [] },
  preferredStack: { type: [String], default: () => [] },
  responsePreferences: { type: [String], default: () => [] },
  testingPreferences: { type: [String], default: () => [] },
  architecturePreferences: { type: [String], default: () => [] },
  communicationPreferences: { type: [String], default: () => [] },
  ...sharedFields(),
});

applyBaseOptions(profileSchema);

profileSchema.index({ status: 1 });

module.exports = model('Profile', profileSchema, 'profiles');
