import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { rateLimit } from '../../middleware/rateLimiter';
import { register, login, refresh, logout } from './auth.controller';

const router = Router();

router.post(
  '/register',
  rateLimit('rl:register', 5, 900), // 5 requests per 15 minutes
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3-30 characters')
      .isAlphanumeric()
      .withMessage('Username must be alphanumeric'),
    body('email').trim().isEmail().withMessage('Must be a valid email').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  asyncHandler(register)
);

router.post(
  '/login',
  rateLimit('rl:login', 5, 900), // 5 requests per 15 minutes
  [
    body('email').trim().isEmail().withMessage('Must be a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(login)
);

router.post('/refresh', asyncHandler(refresh));
router.post('/logout', logout);

export default router;
