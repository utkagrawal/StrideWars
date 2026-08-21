import { Request, Response, NextFunction } from 'express';
import * as leaderboardsService from './leaderboards.service';

export async function getGlobalLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const entries = await leaderboardsService.getGlobalLeaderboard(limit);
    return res.status(200).json({ entries });
  } catch (err) {
    return next(err);
  }
}

export async function getUserGlobalRank(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const userId = req.user!.userId; // requires Auth
    const result = await leaderboardsService.getUserGlobalRank(userId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getRegionalLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    let prefix = req.query.geohashPrefix as string;
    let regionName = 'Unknown Region';

    if (req.query.lat && req.query.lng) {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const ngeohash = require('ngeohash');
      prefix = ngeohash.encode(lat, lng, 3);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          {
            headers: { 'User-Agent': 'StrideWars/1.0' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (response.ok) {
          const data = (await response.json()) as any;
          const address = data?.address;
          if (address) {
            regionName =
              address.city ||
              address.town ||
              address.village ||
              address.county ||
              address.state ||
              'Unknown Region';
          }
        }
      } catch (e) {
        console.warn('Reverse geocoding failed:', (e as Error).message);
      }
    }

    if (!prefix) {
      return res.status(400).json({ error: 'Missing geohashPrefix or lat/lng' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const entries = await leaderboardsService.getRegionalLeaderboard(prefix, limit);
    return res.status(200).json({ entries, regionName, prefix });
  } catch (err) {
    return next(err);
  }
}
