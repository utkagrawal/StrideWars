import { Request, Response, NextFunction } from 'express';
import * as notificationsService from './notifications.service';

export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    
    const result = await notificationsService.getNotifications(userId, cursor, limit);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    
    const notification = await notificationsService.markAsRead(id, userId);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }
    
    return res.status(200).json({ notification });
  } catch (err) {
    return next(err);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const count = await notificationsService.getUnreadCount(userId);
    return res.status(200).json({ count });
  } catch (err) {
    return next(err);
  }
}
