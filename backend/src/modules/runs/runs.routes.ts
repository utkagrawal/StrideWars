import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { rateLimit } from '../../middleware/rateLimiter';
import { createRun, getRuns, getRun } from './runs.controller';
import { getRunOwner } from './runs.service';
import { requireOwnership } from '../../middleware/requireOwnership';

const router = Router();

router.post(
  '/',
  requireAuth,
  rateLimit('rl:runs', 10, 60), // 10 requests per minute
  [
    body('clientRunId').isUUID().withMessage('clientRunId must be a valid UUID'),
    body('startedAt').isISO8601().withMessage('startedAt must be an ISO8601 date'),
    body('points')
      .isArray({ min: 1, max: 20000 })
      .withMessage('points must be an array of length 1 to 20,000'),
    body('points.*.lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('points.*.lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('points.*.recordedAt').isISO8601().withMessage('Point recordedAt must be an ISO8601 date'),
  ],
  validate,
  asyncHandler(createRun)
);

router.get(
  '/',
  requireAuth,
  [
    query('cursor').optional().isISO8601().withMessage('cursor must be a valid ISO date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100'),
  ],
  validate,
  asyncHandler(getRuns)
);

import { generateLoop } from './runs.controller';

router.get(
  '/generate-loop',
  requireAuth,
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  ],
  validate,
  asyncHandler(generateLoop)
);

router.get(
  '/:id',
  requireAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    query('simplify').optional().isBoolean().withMessage('simplify must be boolean'),
    query('tolerance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('tolerance must be a positive number'),
  ],
  validate,
  requireOwnership('id', getRunOwner, 'user_id'),
  asyncHandler(getRun)
);

export default router;
