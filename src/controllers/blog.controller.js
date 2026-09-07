'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ResourceNotFoundError } = require('../utils/errors');
const { sendCollection, sendResource } = require('../utils/responses');
const { serializeBlogPost } = require('../serializers');
const blogService = require('../services/blog.service');

const listPublishedPosts = asyncHandler(async (req, res) => {
  const posts = await blogService.listPublishedPosts();
  sendCollection(res, posts.map(serializeBlogPost));
});

const getPublishedPost = asyncHandler(async (req, res) => {
  const slug = req.validated.params.slug;
  const post = await blogService.getPublishedPostBySlug(slug);

  if (!post) {
    throw new ResourceNotFoundError('Article not found');
  }

  sendResource(res, serializeBlogPost(post));
});

module.exports = { listPublishedPosts, getPublishedPost };
