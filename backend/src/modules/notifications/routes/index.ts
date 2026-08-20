import { Router } from 'express';
import { param, query } from 'express-validator';
import { requireAuth } from '../../../middleware/requireAuth';
import { validate } from '../../../middleware/validate';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { getNotifications, markAsRead, getUnreadCount } from '../controller';
import { getNotificationOwner } from '../notifications.service';
import { requireOwnership } from '../../../middleware/requireOwnership';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  [
    query('cursor').optional().isISO8601().withMessage('Valid cursor required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
  ],
  validate,
  asyncHandler(getNotifications)
);

router.get(
  '/unread-count',
  asyncHandler(getUnreadCount)
);

router.patch(
  '/:id/read',
  [param('id').isNumeric().withMessage('Valid notification ID required')],
  validate,
  requireOwnership('id', getNotificationOwner, 'user_id'),
  asyncHandler(markAsRead)
);

export { router as notificationsRouter };
