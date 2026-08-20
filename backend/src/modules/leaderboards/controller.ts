import { Request, Response, NextFunction } from 'express';
import * as leaderboardsService from './leaderboards.service';

export async function getGlobalLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const entries = await leaderboardsService.getGlobalLeaderboard(limit);
    return res.status(200).json({ entries });
  } catch (err) {
    return next(err);
  }
}

export async function getUserGlobalRank(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId; // requires Auth
    const result = await leaderboardsService.getUserGlobalRank(userId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getRegionalLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const prefix = req.query.geohashPrefix as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const entries = await leaderboardsService.getRegionalLeaderboard(prefix, limit);
    return res.status(200).json({ entries });
  } catch (err) {
    return next(err);
  }
}
