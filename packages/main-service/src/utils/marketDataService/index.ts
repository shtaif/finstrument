import { once } from 'node:events';
import { isEmpty, uniq, pick } from 'lodash';
import { z } from 'zod';
import WebSocket from 'ws';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import {
  itFilter,
  itMap,
  itShare,
  itTakeUntil,
  itTap,
  itSwitchMap,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import { iterified, iterifiedUnwrapped } from 'iterified';
import { env } from '../env.js';
import { isNotEmpty } from '../isNotEmpty.js';

export { marketDataService, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

const marketDataService = {
  observeMarketData: observePricesDataMultiplexed,
};

function observePricesDataMultiplexed<TSymbols extends string = string>(params: {
  symbols: MaybeAsyncIterable<readonly TSymbols[]>;
}): AsyncIterable<UpdatedSymbolPriceMap<TSymbols>> {
  return pipe(
    Symbol.asyncIterator in params.symbols ? params.symbols : of(params.symbols),
    itMap(uniq),
    itSwitchMap(newSymbols =>
      pipe(
        {
          [Symbol.asyncIterator]() {
            let iterator: AsyncIterator<UpdatedSymbolPriceMap>;
            let done = false;

            return {
              async next() {
                if (!iterator) {
                  iterator = sharedPricesSource[Symbol.asyncIterator]();

                  symbolRequestsChannel.next({ add: newSymbols });

                  const possiblyPrecachedSymbolData = newSymbols.reduce((cachedRecents, symbol) => {
                    const symbolState = requestedSymbols.get(symbol)!;
                    if (symbolState?.cachedMostRecentValue) {
                      cachedRecents[symbol] = symbolState.cachedMostRecentValue;
                    }
                    return cachedRecents;
                  }, {} as UpdatedSymbolPriceMap);

                  if (!isEmpty(possiblyPrecachedSymbolData)) {
                    return { done: false, value: possiblyPrecachedSymbolData };
                  }
                }

                if (done) {
                  return { done: true as const, value: undefined };
                }

                const next = await iterator.next();

                if (next.done) {
                  done = true;
                }

                return next;
              },

              async return() {
                if (!iterator || done) {
                  return { done: true as const, value: undefined };
                }
                done = true;
                symbolRequestsChannel.next({ remove: newSymbols });
                return await iterator.return!();
              },
            };
          },
        },
        // (async function* () {
        //   try {
        //     const iterator = sharedPricesSource[Symbol.asyncIterator]();

        //     const firstNextPromise = iterator.next();

        //     symbolRequestsChannel.next({ add: newSymbols });

        //     const possiblyPrecachedSymbolData = newSymbols.reduce((cachedRecents, symbol) => {
        //       const symbolState = requestedSymbols.get(symbol)!;
        //       if (symbolState?.cachedMostRecentValue) {
        //         cachedRecents[symbol] = symbolState.cachedMostRecentValue;
        //       }
        //       return cachedRecents;
        //     }, {} as UpdatedSymbolPriceMap);

        //     yield possiblyPrecachedSymbolData;

        //     const firstNext = await firstNextPromise;

        //     if (firstNext.done) {
        //       return;
        //     }

        //     yield firstNext.value;

        //     yield* { [Symbol.asyncIterator]: () => iterator };
        //   } finally {
        //     symbolRequestsChannel.next({ remove: newSymbols });
        //   }
        // })(),

        itMap(marketDatas => pick(marketDatas, newSymbols))
      )
    ),
    itFilter((updatesFilteredToRequested, i) => {
      return i === 0 || isNotEmpty(updatesFilteredToRequested);
    }),
    itShare()
  );
}

const requestedSymbols = new Map<
  string,
  {
    timesRequested: number;
    cachedMostRecentValue: UpdatedSymbolPrice | undefined;
  }
>();

const symbolRequestsChannel = iterifiedUnwrapped<
  | {
      add: string[];
      remove?: undefined;
    }
  | {
      remove: string[];
      add?: undefined;
    }
>();

const sharedPricesSource = pipe(
  symbolRequestsChannel.iterable[Symbol.asyncIterator](),
  symbolRequestsActivatedIterator => ({
    [Symbol.asyncIterator]: () => ({ next: () => symbolRequestsActivatedIterator.next() }),
  }),
  itTap(request => {
    // console.log('___REQUEST___', request);
    // console.log('___BEFORE___', requestedSymbols);
    if (request.add) {
      for (const symbol of request.add) {
        let symbolState = requestedSymbols.get(symbol);
        if (symbolState) {
          symbolState.timesRequested++;
        } else {
          symbolState = {
            timesRequested: 1,
            cachedMostRecentValue: undefined,
          };
          requestedSymbols.set(symbol, symbolState);
        }
      }
    } else {
      for (const symbol of request.remove) {
        const symbolState = requestedSymbols.get(symbol)!;
        if (symbolState) {
          if (symbolState.timesRequested === 1) {
            requestedSymbols.delete(symbol);
          } else {
            symbolState.timesRequested--;
          }
        }
      }
    }
    // console.log('___AFTER___', requestedSymbols);
  }),
  itMap(() => [...requestedSymbols.keys()]), // TODO: Design this such that only *changes* in observed symbols are communicated rather than the complete set every time
  symbolsRequestsIter => iterateMarketDataServiceWs({ forSymbols: symbolsRequestsIter }),
  itTap(incomingUpdates => {
    for (const symbol in incomingUpdates) {
      const symbolState = requestedSymbols.get(symbol);
      if (symbolState) {
        symbolState.cachedMostRecentValue = incomingUpdates[symbol];
      }
    }
  }),
  itShare()
);

function iterateMarketDataServiceWs(params: {
  forSymbols: AsyncIterable<string[]> | string[];
}): AsyncIterable<UpdatedSymbolPriceMap> {
  return pipe(
    iterified<WebSocket.RawData>((next, done, error) => {
      // TODO: if the url given to the following `new WebSocket(<URL>)` is unreachable - it seemed peculiarly that no `error` event would be thrown and the socket would just hang in a `0` ("CONNECTING") ready state

      const ws = new WebSocket(`${env.LIVE_MARKET_PRICES_SERVICE_WS_URL}/market-data`)
        .on('message', data => next(data))
        .on('close', (_code, _reason) => done())
        .on('error', err => error(err));

      ws.on('open', async () => {
        const outgoingSymbolRequestSets = pipe(
          params.forSymbols,
          syms => (Symbol.asyncIterator in syms ? syms : of(syms)),
          itTakeUntil(once(ws, 'close'))
        );
        for await (const symbols of outgoingSymbolRequestSets) {
          if (ws.readyState !== WebSocket.OPEN) {
            break;
          }
          /* TODO: Review send options here... */
          await wsSendPromisified(ws, JSON.stringify({ symbols }), {});
        }
      });

      ws.on('close', () => console.log('*** CLOSE ***'));
      ws.on('open', () => console.log('*** OPEN ***'));

      return async () => {
        if (ws.readyState !== ws.CLOSED) {
          const closePromise = once(ws, 'close');
          ws.close();
          await closePromise;
        }
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
  z.object({
    quoteSourceName: z.string().optional(),
    currency: z.string().length(3).optional(),
    marketState: z.enum(['REGULAR', 'CLOSED', 'PRE', 'PREPRE', 'POST', 'POSTPOST']),
    regularMarketTime: z.coerce.date(),
    regularMarketPrice: z.number().positive(),
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

type UpdatedSymbolPriceMap<TSymbols extends string = string> = {
  [K in TSymbols]: z.infer<typeof updatedSymbolPriceMapSchema>[TSymbols];
};

type UpdatedSymbolPrice = UpdatedSymbolPriceMap[string];
