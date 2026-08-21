import { Request, Response } from 'express';
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getTopTokensByVolume,
} from '../services/analytics.services.js';
import { AppError } from '../utils/errors.js';

const handleError = (error: unknown, req: Request, res: Response, action: string): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(`Failed to ${action}`, {
    path: req.path,
    method: req.method,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  res.status(500).json({ error: 'Internal Server Error' });
};

export const getAnalyticsSummaryController = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await getAnalyticsSummary());
  } catch (error) {
    handleError(error, req, res, 'load the analytics summary');
  }
};

export const getAnalyticsTimeseriesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await getAnalyticsTimeseries(req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    handleError(error, req, res, 'load the analytics timeseries');
  }
};

export const getAnalyticsTokensController = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getTopTokensByVolume(req.query as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    handleError(error, req, res, 'load the token analytics');
  }
};
