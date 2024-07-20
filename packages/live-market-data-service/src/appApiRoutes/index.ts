import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import liveSymbolPricesHandler from './liveSymbolPricesHandler.js';

const appApiRoutes: RequestHandler = express().use(
  express()
    .get('/live-symbol-prices', liveSymbolPricesHandler)
    .use(((_err, _req, res, _next) => {
      res.status(500).send({
        error: 'Unknown internal error',
      });
    }) satisfies ErrorRequestHandler)
);

export { appApiRoutes };
