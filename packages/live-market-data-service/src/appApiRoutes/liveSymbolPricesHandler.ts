import { z, ZodError } from 'zod';
import { execPipe as pipe } from 'iter-tools';
import { type Request, type Response } from 'express';
import streamSseDownToHttpResponse from '../utils/streamSseDownToHttpResponse.js';
import { observeMarketData } from '../utils/observeMarketData/index.js';

export default (
  req: Request<Record<string, string>, any, any, { symbols: string }>,
  res: Response
) => {
  pipe(
    req,
    req => {
      let parsedReq: z.infer<typeof liveSymbolPricesRequestSchema>;

      try {
        parsedReq = parseUsingZodSchema(liveSymbolPricesRequestSchema, req);
      } catch (err) {
        return (async function* () {
          throw err;
        })();
      }

      const symbols = (parsedReq.query.symbols ?? '')
        .split(',')
        .map(sym => sym.trim())
        .filter(sym => sym !== '');

      if (!symbols.length) {
        res.status(400);
        return (async function* () {
          throw new Error(
            'The "symbols" query parameter is required to be present and must be a comma-separated list with at least one value'
          );
        })();
      }

      return observeMarketData({ symbols });
    },
    pricesIterable => streamSseDownToHttpResponse(req, res, pricesIterable, {})
  );
};

const liveSymbolPricesRequestSchema = z.object({
  query: z.object({
    symbols: z.string(),
  }),
});

function parseUsingZodSchema<TZodSchema extends z.Schema>(
  schema: TZodSchema,
  target: unknown
): z.infer<TZodSchema> {
  try {
    const parsedTarget: z.infer<TZodSchema> = schema.parse(target);
    return parsedTarget;
  } catch (e) {
    const err = e as unknown as ZodError;

    const errMessage = err.issues
      .map(issue => {
        const pathWithRoot = ['ROOT', ...issue.path];
        if (issue.code === z.ZodIssueCode.invalid_type) {
          if (issue.received === 'undefined') {
            return `At ${pathWithRoot
              .slice(0, -1)
              .join(' → ')}; missing required property "${pathWithRoot.at(-1)}"`;
          }
          return `At ${pathWithRoot.join(' → ')}; expected ${issue.expected} but received ${
            issue.received
          }`;
        }
        return issue.toString();
      })
      .join(', ');

    throw new Error(errMessage);
  }
}
