import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execPipe as pipe, asyncMap } from 'iter-tools';
import express, { Request, RequestHandler, ErrorRequestHandler } from 'express';
// import { json as expressJson } from 'body-parser';
import { z } from 'zod';
import { UserModel } from '../db/index.js';
import streamSseDownToHttpResponse from '../utils/streamSseDownToHttpResponse.js';
// import observePricesData from '../utils/observePricesData';
import { marketDataService } from '../utils/marketDataService/index.js';
import liveRevenueData from '../utils/liveRevenueData/index.js';
import positionsService from '../utils/positionsService/index.js';

const appApiRoutes: RequestHandler = express()
  // .use(expressCors(), expressJson({ limit: '100kb' }))
  .use(
    express()
      .get('/', async (req, res, next) => {
        try {
          const htmlPageStream = createReadStream(new URL('./public/index.html', import.meta.url));
          await pipeline(htmlPageStream, res);
        } catch (err) {
          next(err);
        }
      })

      .get('/test', async (req, res) => {
        res.send({ lol: 'lol' });
      })

      .get(
        '/live-symbol-prices',
        (req: Request<Record<string, string>, any, any, { symbols: string }>, res) => {
          const symbols = (req.query.symbols ?? '')
            .split(',')
            .map(sym => sym.trim())
            .filter(sym => sym !== '');

          if (!symbols.length) {
            res
              .status(400)
              .send(
                'The "symbols" query parameter is required to be present and must be a comma-separated list with at least one value'
              );
            return;
          }

          pipe(
            symbols,
            // symbols => observePricesData({ symbols }),
            symbols => marketDataService.observeMarketData({ symbols }),
            pricesIterable => streamSseDownToHttpResponse(req, res, pricesIterable, {})
          );
        }
      )

      .get(
        '/live-revenue-data/:userAlias',
        (
          req: Request<{ userAlias: string }, any, void, { detailedPositionsFor?: string }>,
          res
        ) => {
          pipe(
            liveRevenueData({
              userAlias: req.params.userAlias,
              includeDetailedPositionsFor: req.query.detailedPositionsFor
                ?.split(',')
                .map(sym => sym.trim()),
            }),
            revenueDataIter => streamSseDownToHttpResponse(req, res, revenueDataIter)
          );
        }
      )

      .get('/live-position-data/:userAlias', async (req, res) => {
        const ownerId = (await UserModel.findOne({ where: { alias: req.params.userAlias } }))!.id;
        pipe(
          positionsService.observeHoldingChanges([{ ownerId }]),
          asyncMap(changedHoldings => ({ positions: changedHoldings })),
          positionDataIter => streamSseDownToHttpResponse(req, res, positionDataIter)
        );
      })

      .get('/positions/:userAlias', async (req, res, next) => {
        try {
          const positionsData = await positionsService.retrievePositions({
            filters: {
              ownerAliases: [req.params.userAlias],
            },
          });
          res.send(positionsData);
        } catch (err) {
          next(err);
        }
      })

      .post('/positions/:userAlias', async (req, res, next) => {
        try {
          const { csvData } = importLedgerRequestBodySchema.parse(req.body);
          const { tradesAddedCount, tradesModifiedCount, tradesRemovedCount } =
            await positionsService.setPositions({
              mode: 'REPLACE',
              ownerAlias: req.params.userAlias,
              csvData,
            });
          res.send({
            tradesAddedCount,
            tradesModifiedCount,
            tradesRemovedCount,
          });
        } catch (err) {
          next(err);
        }
      })

      .use(((err, _req, res, _next) => {
        console.error(err);
        res.status(500).send({
          error: 'An unknown internal error occurred',
        });
      }) satisfies ErrorRequestHandler)
  );

// setTimeout(async () => {
//   await positionsService.setPositions({
//     userAlias: 'dorshtaif',
//     csvData: await require('fs/promises').readFile(`${__dirname}/../example-ledger.csv`, 'utf-8'),
//   });
// }, 2000);

const importLedgerRequestBodySchema = z.object({
  csvData: z.string(),
});

// const liveRevenueDataRequestSchema = z.object({
//   query: z.object({
//     detailedPositionsFor: z.array(z.string().trim().min(1)).optional(),
//   }),
// });

export default appApiRoutes;
