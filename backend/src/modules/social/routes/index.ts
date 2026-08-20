import { Router } from 'express';
import { param, query } from 'express-validator';
import { requireAuth } from '../../../middleware/requireAuth';
import { validate } from '../../../middleware/validate';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { followUser, unfollowUser, getFollowers, getFollowing, getFeed } from '../social.controller';

const router = Router();

router.post(
  '/follow/:userId',
  requireAuth,
  [param('userId').isUUID().withMessage('Valid user ID required')],
  validate,
  asyncHandler(followUser)
);

router.delete(
  '/follow/:userId',
  requireAuth,
  [param('userId').isUUID().withMessage('Valid user ID required')],
  validate,
  asyncHandler(unfollowUser)
);

router.get(
  '/followers/:userId',
  [param('userId').isUUID().withMessage('Valid user ID required')],
  validate,
  asyncHandler(getFollowers)
);

router.get(
  '/following/:userId',
  [param('userId').isUUID().withMessage('Valid user ID required')],
  validate,
  asyncHandler(getFollowing)
);

router.get(
  '/feed',
  requireAuth,
  [
    query('cursor').optional().isISO8601().withMessage('Valid cursor (ISO8601) required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
  ],
  validate,
  asyncHandler(getFeed)
);

export { router as socialRouter };
