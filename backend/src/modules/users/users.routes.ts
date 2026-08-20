import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getMe, updateMe, getUser } from './users.controller';

const router = Router();

// Protected routes
router.get('/me', requireAuth, asyncHandler(getMe));
router.patch(
  '/me',
  requireAuth,
  [
    body('displayName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be 1-50 characters'),
  ],
  validate,
  asyncHandler(updateMe)
);

// Public routes
router.get('/:id', asyncHandler(getUser));

export default router;
