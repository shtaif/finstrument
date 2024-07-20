import { isEmpty, pick } from 'lodash';
import { z } from 'zod';
import { pipe } from 'shared-utils';
import {
  asyncIterFilter,
  asyncIterMap,
  asyncIterShare,
  myIterableCleanupPatcher,
} from 'iterable-operators';
import { env } from '../../env.js';
import clientJsonSseToAsyncIterable from '../../clientJsonSseToAsyncIterable/index.js';

export { observePricesDataMultiplexed, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

function observePricesDataMultiplexed(params: {
  symbols: string[];
}): AsyncIterable<UpdatedSymbolPriceMap> {
  return pipe(
    sharedPricesSource,
    sharedPricesSource => ({
      [Symbol.asyncIterator]() {
        let iterator: AsyncIterator<UpdatedSymbolPriceMap>;

        return {
          async next() {
            if (!iterator) {
              for (const symbol of params.symbols) {
                let symbolState = requestedSymbols.get(symbol);
                if (!symbolState) {
                  symbolState = {
                    timesRequested: 1,
                    cachedMostRecentValue: undefined,
                  };
                  requestedSymbols.set(symbol, symbolState);
                } else {
                  symbolState.timesRequested++;
                }
              }

              iterator = sharedPricesSource[Symbol.asyncIterator]();
              needsReinitDueToChangedSymbols = true;

              return {
                done: false as const,
                value: params.symbols.reduce((cachedRecents, symbol) => {
                  const { cachedMostRecentValue } = requestedSymbols.get(symbol)!;
                  if (cachedMostRecentValue) {
                    cachedRecents[symbol] = cachedMostRecentValue;
                  }
                  return cachedRecents;
                }, {} as UpdatedSymbolPriceMap),
              } as const;
            }

            return await iterator.next();
          },

          async return() {
            if (!iterator) {
              return {
                done: true as const,
                value: undefined,
              };
            }

            for (const symbol of params.symbols) {
              const symbolState = requestedSymbols.get(symbol)!;
              if (symbolState) {
                if (symbolState.timesRequested === 1) {
                  requestedSymbols.delete(symbol);
                } else {
                  symbolState.timesRequested--;
                }
              }
            }

            needsReinitDueToChangedSymbols = true;

            return await iterator.return!();
          },
        };
      },
    }),
    asyncIterMap(updatesCombined => pick(updatesCombined, params.symbols)),
    asyncIterFilter(updatesFilteredToRequested => !isEmpty(updatesFilteredToRequested))
  );
}

const requestedSymbols = new Map<
  string,
  {
    timesRequested: number;
    cachedMostRecentValue: UpdatedSymbolPrice | undefined;
  }
>();

let needsReinitDueToChangedSymbols = false;

const sharedPricesSource = pipe(
  // (async function* () {
  //   // let iterator: AsyncIterator<UpdatedSymbolPriceMap> | undefined;
  //   const marketDataSource = createModifiableMarketDataSource();
  //   needsReinitDueToChangedSymbols = true;

  //   while (true) {
  //     if (needsReinitDueToChangedSymbols) {
  //       needsReinitDueToChangedSymbols = false;
  //       marketDataSource.setSymbols([...requestedSymbols.keys()]);
  //     }

  //     // const next = await iterator!.next();
  //     const next = await marketDataSource.next();

  //     if (next.done) {
  //       break;
  //     }

  //     const updatedSymbols = next.value;

  //     for (const symbol in updatedSymbols) {
  //       const updatedInfo = updatedSymbols[symbol];
  //       const symbolState = requestedSymbols.get(symbol);
  //       if (symbolState) {
  //         symbolState.cachedMostRecentValue = updatedInfo;
  //       }
  //     }

  //     yield updatedSymbols;
  //   }
  // })(),
  (async function* () {
    // let iterator: AsyncIterator<UpdatedSymbolPriceMap> | undefined;
    const marketDataSource = createModifiableMarketDataSource();
    needsReinitDueToChangedSymbols = true;

    while (true) {
      if (needsReinitDueToChangedSymbols) {
        needsReinitDueToChangedSymbols = false;
        marketDataSource.setSymbols([...requestedSymbols.keys()]);
      }

      // const next = await iterator!.next();
      const next = await marketDataSource.next();

      if (next.done) {
        break;
      }

      const updatedSymbols = next.value;

      for (const symbol in updatedSymbols) {
        const updatedInfo = updatedSymbols[symbol];
        const symbolState = requestedSymbols.get(symbol);
        if (symbolState) {
          symbolState.cachedMostRecentValue = updatedInfo;
        }
      }

      yield updatedSymbols;
    }
  })(),
  asyncIterShare()
);

function createModifiableMarketDataSource(): AsyncIterableIterator<UpdatedSymbolPriceMap> & {
  setSymbols: (symbols: string[]) => void;
} {
  const iteratorsToDispose = new Set<AsyncIterator<unknown>>(); // TODO: Ensure to add to these during reinits and that each that finishes its `.return()` will remove itself out from the array

  let currIterator: AsyncIterator<UpdatedSymbolPriceMap> | undefined;

  let currSymbols: string[] = [];

  function reinitSource() {
    const prevIterator = currIterator;

    const newSse = connectSymbolMarketDataSse(currSymbols);

    currIterator = pipe(
      newSse,
      myIterableCleanupPatcher(async function* (sseIter) {
        for await (const msgData of sseIter) {
          const msgValidated = observePricesDataMessageSchema.parse(msgData);
          if (!msgValidated.success) {
            throw new Error(msgValidated.error?.message || 'Something went wrong...');
          }
          yield msgValidated.data;
        }
      })
    )[Symbol.asyncIterator]();

    if (prevIterator) {
      (async () => {
        iteratorsToDispose.add(prevIterator);
        await Promise.race([
          newSse.openEvents[Symbol.asyncIterator]().next(),
          newSse.closeEvents[Symbol.asyncIterator]().next(),
        ]);
        await prevIterator.return!();
        iteratorsToDispose.delete(prevIterator);
      })();
    }
  }

  return {
    [Symbol.asyncIterator]() {
      return this;
    },

    setSymbols(symbols: string[]) {
      currSymbols = symbols;
      reinitSource();
    },

    async next() {
      if (!currIterator) {
        reinitSource();
      }
      return currIterator!.next();
    },

    async return() {
      if (!currIterator) {
        return { done: true as const, value: undefined };
      }
      await pipe(
        [...iteratorsToDispose].map(it => it.return!()),
        Promise.all
      );
      return currIterator.return!();
    },
  };
}

function connectSymbolMarketDataSse(
  symbols: Iterable<string> | string[]
): ReturnType<typeof clientJsonSseToAsyncIterable> {
  return clientJsonSseToAsyncIterable<unknown>({
    url: `${env.LIVE_MARKET_PRICES_SERVICE_URL}/api/live-symbol-prices?symbols=${Array.from(symbols).join(',')}`,
  });
}

const updatedSymbolPriceMapSchema = z.record(
  z.string().min(1),
  z.object({
    quoteSourceName: z.string().optional(),
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

// (async () => {
//   const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

//   await delay(1000);

//   const it1 = observePricesDataMultiplexed({ symbols: ['ADBE', 'AAPL'] })[Symbol.asyncIterator]();

//   (async () => {
//     for await (const value of { [Symbol.asyncIterator]: () => it1 }) {
//       console.log('ITERATOR 1:', value);
//     }
//   })();

//   await delay(4000);

//   const it2 = observePricesDataMultiplexed({ symbols: ['ADBE'] })[Symbol.asyncIterator]();

//   (async () => {
//     for await (const value of { [Symbol.asyncIterator]: () => it2 }) {
//       console.log('ITERATOR 2:', value);
//     }
//   })();

//   await delay(4000);

//   await it1.return!();
//   await it2.return!();
// })();
