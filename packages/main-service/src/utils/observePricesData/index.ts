import { z } from 'zod';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import { myIterableCleanupPatcher } from 'iterable-operators';
import { env } from '../env.js';
import clientJsonSseToAsyncIterable from '../clientJsonSseToAsyncIterable/index.js';

export { observePricesData as default, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

function observePricesData(params: { symbols: [] }): AsyncIterable<{ [symbol: string]: never }>;
function observePricesData(params: { symbols: string[] }): AsyncIterable<UpdatedSymbolPriceMap>;
function observePricesData(params: { symbols: string[] }): AsyncIterable<UpdatedSymbolPriceMap> {
  const { symbols } = params;

  if (!symbols.length) {
    return of({});
  }

  return pipe(
    clientJsonSseToAsyncIterable<unknown>({
      url: `${env.LIVE_MARKET_PRICES_SERVICE_URL}/api/live-symbol-prices?symbols=${symbols.join(',')}`,
    }),
    myIterableCleanupPatcher(async function* (sseIter) {
      for await (const msgData of sseIter) {
        const msgValidated = observePricesDataMessageSchema.parse(msgData);
        if (!msgValidated.success) {
          throw new Error(msgValidated.error?.message || 'Something went wrong...');
        }
        yield msgValidated.data;
      }
    })
  );
}

// (async () => {
//   await new Promise(resolve => setTimeout(resolve, 1000));

//   (async () => {
//     for await (const value of observePricesDataMultiplexed({ symbols: ['ADBE', 'AAPL'] })) {
//       console.log('ITERATOR 1:', value);
//     }
//   })();

//   await new Promise(resolve => setTimeout(resolve, 4000));

//   (async () => {
//     for await (const value of observePricesDataMultiplexed({ symbols: ['ADBE'] })) {
//       console.log('ITERATOR 2:', value);
//     }
//   })();
// })();

const updatedSymbolPriceMapSchema = z.record(
  z.string().min(1),
  z.object({
    quoteSourceName: z.string().nullable().optional(),
    regularMarketPrice: z.number().positive(),
    regularMarketTime: z.coerce.date(),
    marketState: z.enum(['REGULAR', 'CLOSED', 'PRE', 'PREPRE', 'POST', 'POSTPOST']),
  })
);

const observePricesDataMessageSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: updatedSymbolPriceMapSchema,
  }),
  z.object({
    success: z.literal(false),
    error: z.object({ message: z.string().optional() }).optional(),
  }),
]);

type UpdatedSymbolPriceMap = z.infer<typeof updatedSymbolPriceMapSchema>;

type UpdatedSymbolPrice = UpdatedSymbolPriceMap[string];
