'use strict';

const { BlogPost } = require('../models');

const SORT = { publishedAt: -1, createdAt: -1 };

async function listPublishedPosts() {
  return BlogPost.find({ status: 'published' }).sort(SORT).lean();
}

async function getPublishedPostBySlug(slug) {
  return BlogPost.findOne({ slug, status: 'published' }).lean();
}

module.exports = { listPublishedPosts, getPublishedPostBySlug, SORT };
