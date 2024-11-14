import { pick, isEqual, sortedUniq } from 'lodash-es';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import { iterifiedUnwrapped, type IterifiedUnwrapped } from 'iterified';
import { pipe } from 'shared-utils';
import {
  itFilter,
  itMap,
  itShare,
  itTap,
  itStartWith,
  itPairwise,
  itLazyDefer,
  itMerge,
  itFinally,
  myIterableCleanupPatcher,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import { isNotEmpty } from '../isNotEmpty.js';
import {
  iterateMarketDataServiceDataStream,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from './iterateMarketDataServiceDataStream/index.js';

export { marketDataService, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

const marketDataService = {
  observeMarketData: observePricesDataMultiplexed,
};

function observePricesDataMultiplexed<TSymbols extends string = string>(params: {
  symbols: MaybeAsyncIterable<readonly TSymbols[]>;
}): AsyncIterable<UpdatedSymbolPriceMap<TSymbols>> {
  // TODO: Ensure reasonable behavior when given `symbols` is an EMPTY async iterable (and also non-async one?)

  const askedSymbolsIter = pipe(
    Symbol.asyncIterator in params.symbols ? params.symbols : of(params.symbols),
    itMap(symbols => pipe(symbols, $ => $.toSorted(), sortedUniq)),
    source =>
      pipe(
        source,
        itStartWith([] as TSymbols[]),
        itPairwise(),
        itFilter(([prev, next], i) => i === 0 || !isEqual(prev, next)),
        itMap(([, nextDistinctSymbolSet]) => nextDistinctSymbolSet)
      )
  );

  return pipe(
    itLazyDefer(() => {
      let currAskedSymbols: TSymbols[] = [];
      const currAskedSymbolsInited = Promise.withResolvers<void>();

      return pipe(
        itMerge(
          pipe(
            askedSymbolsIter,
            myIterableCleanupPatcher(async function* (source) {
              try {
                for await (const nextAskedSymbols of source) {
                  const remove = currAskedSymbols;
                  const add = nextAskedSymbols;
                  currAskedSymbols = nextAskedSymbols;
                  await outgoingSymbolCtrl.sendNext({ remove, add });
                  currAskedSymbolsInited.resolve();
                }
              } finally {
                currAskedSymbolsInited.resolve();
              }
            })
          ) as AsyncIterable<never>,
          sharedMarketDataUnderlyingSource
        ),
        myIterableCleanupPatcher(async function* (source) {
          const marketDataIterator = source[Symbol.asyncIterator]();

          try {
            yield* (await (async () => {
              const gatheredInitialFullData: UpdatedSymbolPriceMap = {};

              for await (const nextUpdates of {
                [Symbol.asyncIterator]: () => ({ next: () => marketDataIterator.next() }),
              }) {
                await currAskedSymbolsInited.promise;

                let initialFullDataFinishedGathering = true;

                for (const symbol of currAskedSymbols) {
                  if (nextUpdates[symbol] !== undefined) {
                    gatheredInitialFullData[symbol] = nextUpdates[symbol];
                  } else if (gatheredInitialFullData[symbol] === undefined) {
                    initialFullDataFinishedGathering = false;
                  }
                }

                if (initialFullDataFinishedGathering) {
                  return [
                    pick(gatheredInitialFullData, currAskedSymbols) as Pick<
                      UpdatedSymbolPriceMap,
                      TSymbols
                    >,
                  ];
                }
              }
            })()) ?? [];

            yield* pipe(
              { [Symbol.asyncIterator]: () => marketDataIterator },
              itMap(marketDataUpdates => pick(marketDataUpdates, currAskedSymbols)),
              itFilter(marketDataUpdates => isNotEmpty(marketDataUpdates))
            );
          } finally {
            await outgoingSymbolCtrl.sendNext({ remove: currAskedSymbols });
          }
        })
      );
    }),
    itShare()
  );
}

const outgoingSymbolCtrl = {
  channel: iterifiedUnwrapped() as IterifiedUnwrapped<{ add?: string[]; remove?: string[] }, void>,

  readyForNext: Promise.withResolvers() as PromiseWithResolvers<void>,

  async sendNext(request: { add?: string[]; remove?: string[] }): Promise<void> {
    await outgoingSymbolCtrl.readyForNext.promise;
    this.channel.next(request);
  },
};

const sharedMarketDataUnderlyingSource = itLazyDefer(() => {
  const requestedSymbols = new Map<string, { timesRequested: number }>();
  const symbolRecentDataCache: { [symbol: string]: UpdatedSymbolPrice } = Object.create(null);

  return pipe(
    iterateMarketDataServiceDataStream({
      forSymbols: pipe(
        itLazyDefer(() => {
          const symbolRequestsActivatedIterator =
            outgoingSymbolCtrl.channel.iterable[Symbol.asyncIterator]();
          return { [Symbol.asyncIterator]: () => symbolRequestsActivatedIterator };
        }),
        myIterableCleanupPatcher(async function* (source) {
          outgoingSymbolCtrl.readyForNext.resolve();
          try {
            yield* source;
          } finally {
            outgoingSymbolCtrl.readyForNext = Promise.withResolvers();
          }
        }),
        itFinally(() => {
          requestedSymbols.clear(); // TODO: Is this necessary since we the `requestedSymbols` here would be recreated on every resubscription?
          for (const k in symbolRecentDataCache) {
            delete symbolRecentDataCache[k];
          }
        }),
        itMap(request => {
          if (request.add)
            for (const symbol of request.add) {
              let symbolState = requestedSymbols.get(symbol);
              if (symbolState) {
                symbolState.timesRequested++;
              } else {
                symbolState = { timesRequested: 1 };
                requestedSymbols.set(symbol, symbolState);
              }
            }
          if (request.remove)
            for (const symbol of request.remove) {
              const symbolState = requestedSymbols.get(symbol)!;
              if (symbolState) {
                if (symbolState.timesRequested === 1) {
                  requestedSymbols.delete(symbol);
                  delete symbolRecentDataCache[symbol];
                } else {
                  symbolState.timesRequested--;
                }
              }
            }
          return [...requestedSymbols.keys()]; // TODO: Design this such that only *changes* in observed symbols are communicated rather than the complete set every time
        })
      ),
    }),
    itTap(incomingUpdates => {
      for (const symbol in incomingUpdates) {
        if (requestedSymbols.has(symbol)) {
          symbolRecentDataCache[symbol] = incomingUpdates[symbol];
        }
      }
    }),
    itShare(),
    myIterableCleanupPatcher(async function* (source) {
      if (isNotEmpty(symbolRecentDataCache)) {
        yield symbolRecentDataCache;
      }
      yield* source;
    })
  );
});
