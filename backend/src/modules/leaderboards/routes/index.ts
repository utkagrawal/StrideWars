import { Router } from 'express';
import { query } from 'express-validator';
import { requireAuth } from '../../../middleware/requireAuth';
import { validate } from '../../../middleware/validate';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { getGlobalLeaderboard, getUserGlobalRank, getRegionalLeaderboard } from '../controller';

const router = Router();

router.get(
  '/global',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validate,
  asyncHandler(getGlobalLeaderboard)
);

router.get('/global/me', requireAuth, asyncHandler(getUserGlobalRank));

router.get(
  '/region',
  [
    query('geohashPrefix')
      .optional()
      .isString()
      .isLength({ min: 1, max: 12 })
      .withMessage('Valid geohashPrefix is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validate,
  asyncHandler(getRegionalLeaderboard)
);

export { router as leaderboardsRouter };
