import { Request, Response, NextFunction } from 'express';
import * as socialService from './social.service';

export async function followUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const followerId = req.user!.userId;
    const { userId: followeeId } = req.params;

    await socialService.followUser(followerId, followeeId);
    return res.status(200).json({ following: true });
  } catch (err) {
    return next(err);
  }
}

export async function unfollowUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const followerId = req.user!.userId;
    const { userId: followeeId } = req.params;

    await socialService.unfollowUser(followerId, followeeId);
    return res.status(200).json({ following: false });
  } catch (err) {
    return next(err);
  }
}

export async function getFollowers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { userId } = req.params;
    const users = await socialService.getFollowers(userId);
    return res.status(200).json({ users });
  } catch (err) {
    return next(err);
  }
}

export async function getFollowing(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { userId } = req.params;
    const users = await socialService.getFollowing(userId);
    return res.status(200).json({ users });
  } catch (err) {
    return next(err);
  }
}

export async function getFeed(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await socialService.getFeed(userId, cursor, limit);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
