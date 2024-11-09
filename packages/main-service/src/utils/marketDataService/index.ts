import { uniq, pick, isEqual } from 'lodash-es';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
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
import { iterifiedUnwrapped, type IterifiedUnwrapped } from 'iterified';
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
  const askedSymbolsIter = pipe(
    Symbol.asyncIterator in params.symbols ? params.symbols : of(params.symbols),
    itMap(uniq),
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

      return pipe(
        itMerge(
          sharedMarketDataUnderlyingSource,
          pipe(
            askedSymbolsIter,
            itTap(async nextAskedSymbols => {
              await outgoingSymbolCtrl.sendNext({
                remove: currAskedSymbols,
                add: nextAskedSymbols,
              });
              currAskedSymbols = nextAskedSymbols;
            }),
            itFilter(() => false)
          ) as AsyncIterable<never>
        ),
        myIterableCleanupPatcher(async function* (source) {
          const it = source[Symbol.asyncIterator]();
          const gatheredInitialFullData: UpdatedSymbolPriceMap = {};

          for await (const nextUpdates of {
            [Symbol.asyncIterator]: () => ({ next: () => it.next() }),
          }) {
            let initialFullDataFinishedGathering = true;

            for (const symbol of currAskedSymbols) {
              if (nextUpdates[symbol] !== undefined) {
                gatheredInitialFullData[symbol] = nextUpdates[symbol];
              } else if (gatheredInitialFullData[symbol] === undefined) {
                initialFullDataFinishedGathering = false;
              }
            }

            if (initialFullDataFinishedGathering) {
              break;
            }
          }

          yield pick(
            gatheredInitialFullData as Pick<UpdatedSymbolPriceMap, TSymbols>,
            currAskedSymbols
          );
          yield* pipe(
            { [Symbol.asyncIterator]: () => it },
            itMap(marketDataUpdates => pick(marketDataUpdates, currAskedSymbols)),
            itFilter(marketDataUpdates => isNotEmpty(marketDataUpdates))
          );
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

  (global as any).globalRequestedSymbols = requestedSymbols;

  return pipe(
    iterateMarketDataServiceDataStream({
      forSymbols: pipe(
        itLazyDefer(() => {
          // return outgoingSymbolCtrl.channel.iterable;
          const symbolRequestsActivatedIterator =
            outgoingSymbolCtrl.channel.iterable[Symbol.asyncIterator]();
          return { [Symbol.asyncIterator]: () => symbolRequestsActivatedIterator };
        }),
        myIterableCleanupPatcher(async function* (source) {
          outgoingSymbolCtrl.readyForNext.resolve();
          try {
            for await (const request of source) {
              outgoingSymbolCtrl.readyForNext = Promise.withResolvers(); // TODO: Is this absolutely necessary?
              yield request;
              outgoingSymbolCtrl.readyForNext.resolve(); // TODO: Is this absolutely necessary?
            }
          } finally {
            outgoingSymbolCtrl.readyForNext = Promise.withResolvers();
          }
        }),
        itFinally(() => {
          // (global as any).globalRequestedSymbols = undefined;
          requestedSymbols.clear(); // TODO: Is this necessary since we the `requestedSymbols` here would be recreated on every resubscription?
        }),
        itMap(request => {
          if (request.add) {
            for (const symbol of request.add) {
              let symbolState = requestedSymbols.get(symbol);
              if (symbolState) {
                symbolState.timesRequested++;
              } else {
                symbolState = { timesRequested: 1 };
                requestedSymbols.set(symbol, symbolState);
              }
            }
          }
          if (request.remove) {
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
