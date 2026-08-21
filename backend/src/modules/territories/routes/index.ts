import { Router } from 'express';
import { query, param, CustomValidator } from 'express-validator';
import { requireAuth } from '../../../middleware/requireAuth';
import { validate } from '../../../middleware/validate';
import { asyncHandler } from '../../../middleware/asyncHandler';
import {
  getTerritories,
  getTerritory,
  getTerritoryHistory,
  getMyTerritories,
} from '../territories.controller';

const router = Router();

// Custom validator to parse 'minLat,minLng,maxLat,maxLng'
const isBbox: CustomValidator = (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('bbox must be a string');
  }
  const parts = value.split(',');
  if (parts.length !== 4) {
    throw new Error('bbox must contain exactly 4 comma-separated values');
  }
  const floats = parts.map(parseFloat);
  if (floats.some(isNaN)) {
    throw new Error('bbox values must be valid numbers');
  }
  const [minLat, minLng, maxLat, maxLng] = floats;
  if (minLat < -90 || maxLat > 90 || minLat > maxLat) {
    throw new Error('Invalid latitude bounds in bbox');
  }
  if (minLng < -180 || maxLng > 180 || minLng > maxLng) {
    throw new Error('Invalid longitude bounds in bbox');
  }
  return true;
};

router.get(
  '/',
  requireAuth,
  [query('bbox').exists().withMessage('bbox is required').custom(isBbox)],
  validate,
  asyncHandler(getTerritories)
);

router.get('/mine', requireAuth, asyncHandler(getMyTerritories));

router.get(
  '/:geohash',
  requireAuth,
  [
    param('geohash')
      .isString()
      .isLength({ min: 1, max: 12 })
      .withMessage('Invalid geohash parameter'),
  ],
  validate,
  asyncHandler(getTerritory)
);

router.get(
  '/history/:geohash',
  requireAuth,
  [
    param('geohash')
      .isString()
      .isLength({ min: 1, max: 12 })
      .withMessage('Invalid geohash parameter'),
  ],
  validate,
  asyncHandler(getTerritoryHistory)
);

export { router as territoriesRouter };
