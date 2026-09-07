'use strict';

const { Router } = require('express');

const controller = require('../../controllers/blog.controller');
const { validateParam } = require('../../middleware/validate');

const router = Router();

router.get('/', controller.listPublishedPosts);
router.get('/:slug', validateParam('slug'), controller.getPublishedPost);

module.exports = router;
