import express, { Request, RequestHandler, ErrorRequestHandler } from 'express';
import { getInstrumentInfos } from '../utils/getInstrumentInfos';

const appApiRoutes: RequestHandler = express().use(
  express()
    .get(
      '/instrument-info',
      async (req: Request<Record<string, string>, any, any, { symbols: string[] }>, res, next) => {
        const symbols = req.query.symbols.map(sym => sym.trim()).filter(sym => sym !== '');

        if (!symbols.length) {
          res
            .status(400)
            .send(
              'The "symbols" query parameter is required to be present and must be a comma-separated list with at least one value'
            );
          return;
        }

        try {
          const instrumentInfos = await getInstrumentInfos({ symbols });
          res.send({ instrumentInfos });
        } catch (err) {
          next(err);
        }
      }
    )

    .use(((_err, _req, res, _next) => {
      res.status(500).send({
        error: 'Unknown internal error',
      });
    }) satisfies ErrorRequestHandler)
);

export default appApiRoutes;
