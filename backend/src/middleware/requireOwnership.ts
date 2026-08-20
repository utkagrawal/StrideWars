import { Request, Response, NextFunction } from 'express';

/**
 * Reusable middleware to verify that the currently authenticated user
 * owns the resource they are trying to access or modify.
 * 
 * @param resourceIdParam The name of the route parameter containing the resource ID (e.g. 'id')
 * @param fetchResource An async function that fetches the resource by ID
 * @param ownerKey The property name on the resource object that stores the owner's user ID
 */
export function requireOwnership<T extends Record<string, any>>(
  resourceIdParam: string,
  fetchResource: (id: string) => Promise<T | null>,
  ownerKey: keyof T = 'userId'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({ 
          error: { code: 'BAD_REQUEST', message: `Missing parameter: ${resourceIdParam}` } 
        });
      }

      const resource = await fetchResource(resourceId);
      if (!resource) {
        return res.status(404).json({ 
          error: { code: 'NOT_FOUND', message: 'Resource not found' } 
        });
      }

      const currentUserId = req.user?.userId;
      if (!currentUserId || resource[ownerKey] !== currentUserId) {
        return res.status(403).json({ 
          error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' } 
        });
      }

      // Attach resource to req for downstream handlers to avoid re-fetching
      (req as any).resource = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}
