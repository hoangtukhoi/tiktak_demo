const express = require('express');

const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, optionalAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { updateProfileSchema } = require('../validators/auth.validator');

router.get('/search', userController.searchUsers);
router.patch('/me', authenticate, validate(updateProfileSchema), userController.updateProfile);
router.delete('/me', authenticate, userController.deleteAccount);

router.get('/:username', optionalAuth, userController.getProfile);
router.get('/:username/videos', optionalAuth, userController.getUserVideos);
router.get('/:username/followers', userController.getFollowers);
router.get('/:username/following', userController.getFollowing);
router.post('/:username/follow', authenticate, userController.toggleFollow);

module.exports = router;
