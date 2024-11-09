import { once } from 'node:events';
import { z } from 'zod';
import WebSocket from 'ws';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import { itMap, itTakeUntil } from 'iterable-operators';
import { iterified } from 'iterified';
import { env } from '../../env.js';

export { iterateMarketDataServiceDataStream, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

function iterateMarketDataServiceDataStream(params: {
  forSymbols: AsyncIterable<string[]> | string[];
}): AsyncIterable<UpdatedSymbolPriceMap> {
  return pipe(
    iterified<WebSocket.RawData>((next, done, error) => {
      // TODO: if the url given to the following `new WebSocket(<URL>)` is unreachable - it seemed peculiarly that no `error` event would be thrown and the socket would just hang in a `0` ("CONNECTING") ready state

      const ws = new WebSocket(`${env.LIVE_MARKET_PRICES_SERVICE_WS_URL}/market-data`)
        .on('message', data => next(data))
        .on('close', (_code, _reason) => done())
        .on('error', err => error(err))
        .on('close', () => console.log('*** CLOSE ***'))
        .on('open', () => console.log('*** OPEN ***'));

      // pipe(((global as any).wsArr ??= []), wsArr => !wsArr.includes(ws) && wsArr.push(ws));

      const outgoingAskedSymbolsIterator = pipe(
        Symbol.asyncIterator in params.forSymbols ? params.forSymbols : of(params.forSymbols),
        itTakeUntil(once(ws, 'close')),
        $ => $[Symbol.asyncIterator]()
      );

      (async () => {
        await once(ws, 'open');

        for await (const symbols of {
          [Symbol.asyncIterator]: () => outgoingAskedSymbolsIterator,
        }) {
          if (ws.readyState !== WebSocket.OPEN) {
            break;
          }
          /* TODO: Review send options here... */
          await wsSendPromisified(ws, JSON.stringify({ symbols }), {});
        }
      })();

      return async () => {
        await Promise.all([
          (async () => {
            await outgoingAskedSymbolsIterator.return!();
          })(),

          (async () => {
            // TODO: decide how and adapt this code as necessary so it can handle casual disconnections from the upstream's end (i.e. in cases like redeployments of the upstream service)
            if (ws.readyState === ws.CLOSED) {
              return;
            }
            if (process.versions.bun) {
              ws.close(); // At time of writing Bun's WS implementation was seen to have some weird/inconsistent behavior regarding immediately closing an initiated websocket connection before it was fully established (seemed to remain stuck on readyState = 2, never switcing to 3 and never consequently firing the 'closed' event), so this here is an optimistic less-sophisticated implementation for it
              return;
            }
            const readyStateBeforeClose = ws.readyState;
            const whenClosed = once(ws, 'close');
            try {
              ws.close();
              await whenClosed;
            } catch (err: any) {
              if (
                readyStateBeforeClose === ws.CONNECTING &&
                err.message === 'WebSocket was closed before the connection was established'
              ) {
                return;
              }
              throw err;
            }
          })(),
        ]);
      };
    }),
    itMap(msgData => {
      const msgValidated = pipe(
        msgData.toString('utf-8'),
        JSON.parse,
        observePricesDataMessageSchema.parse
      );
      if (msgValidated.success) {
        return msgValidated.data;
      }
      throw new Error(msgValidated.error?.message || 'Something went wrong...');
    })
  );
}

async function wsSendPromisified(
  ws: WebSocket,
  data: Parameters<WebSocket['send']>[0],
  options: Parameters<WebSocket['send']>[1] = {}
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.send(data, options, err => (err ? reject(err) : resolve()));
  });
}

const updatedSymbolPriceMapSchema = z.record(
  z.string().min(1),
  z
    .object({
      quoteSourceName: z.string().optional(),
      currency: z.string().length(3).optional(),
      marketState: z.enum(['REGULAR', 'CLOSED', 'PRE', 'PREPRE', 'POST', 'POSTPOST']),
      regularMarketTime: z.coerce.date(),
      regularMarketPrice: z.number().positive(),
    })
    .nullable()
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

type UpdatedSymbolPriceMap<TSymbols extends string = string> = {
  [K in TSymbols]: z.infer<typeof updatedSymbolPriceMapSchema>[TSymbols];
};

type UpdatedSymbolPrice = UpdatedSymbolPriceMap[string];
