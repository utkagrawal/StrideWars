import { Request, Response, NextFunction } from 'express';
import * as territoriesService from './territories.service';

export async function getTerritories(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const bboxStr = req.query.bbox as string;
    const [minLat, minLng, maxLat, maxLng] = bboxStr.split(',').map(parseFloat);

    const result = await territoriesService.getTerritoriesInBbox(minLat, minLng, maxLat, maxLng);
    
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getTerritory(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const { geohash } = req.params;

    const territory = await territoriesService.getTerritoryByGeohash(geohash);
    if (!territory) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Territory not found or unclaimed' } });
    }

    return res.status(200).json({ territory });
  } catch (err) {
    return next(err);
  }
}

export async function getTerritoryHistory(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const { geohash } = req.params;
    const captures = await territoriesService.getCaptureHistory(geohash);
    return res.status(200).json({ captures });
  } catch (err) {
    return next(err);
  }
}

export async function getMyTerritories(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const territories = await territoriesService.getMyTerritories(userId);
    return res.status(200).json({ territories });
  } catch (err) {
    return next(err);
  }
}
