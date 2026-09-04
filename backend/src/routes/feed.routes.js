const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feed.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
router.get('/for-you', optionalAuth, feedController.getForYouFeed);
router.get('/following', authenticate, feedController.getFollowingFeed);
module.exports = router;