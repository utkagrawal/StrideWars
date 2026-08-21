import { Request, Response, NextFunction } from 'express';
import * as usersService from './users.service';

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const user = await usersService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const { displayName } = req.body as { displayName: string };

    const user = await usersService.updateDisplayName(userId, displayName);
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function getUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { id } = req.params;
    const user = await usersService.getPublicUserById(id);

    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      },
    });
  } catch (err) {
    return next(err);
  }
}
