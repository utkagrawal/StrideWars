import { Request, Response, NextFunction } from 'express';
import * as runsService from './runs.service';

export async function createRun(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const { clientRunId, startedAt, points } = req.body;

    const { run, capturedTerritories } = await runsService.createRun(userId, clientRunId, startedAt, points);
    
    return res.status(201).json({ run, capturedTerritories });
  } catch (err) {
    return next(err);
  }
}

export async function getRuns(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await runsService.getRuns(userId, limit, cursor);
    
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getRun(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Parse simplify and tolerance
    const simplify = req.query.simplify !== 'false'; // default true
    const tolerance = req.query.tolerance ? parseFloat(req.query.tolerance as string) : 5;

    const result = await runsService.getRunById(userId, id, simplify, tolerance);
    if (!result) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
