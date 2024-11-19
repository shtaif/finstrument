import { once } from 'node:events';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import WebSocket, { WebSocketServer } from 'ws';
import { mapValues, pick, isEmpty, sortedUniq, isEqual } from 'lodash-es';
import { pipe } from 'shared-utils';
import {
  itFilter,
  itFinally,
  itLazyDefer,
  itMap,
  itPairwise,
  itShare,
  itStartWith,
  itSwitchMap,
  itTakeUntil,
  myIterableCleanupPatcher,
} from 'iterable-operators';
import { iterifiedUnwrapped } from 'iterified';
import { itOnNodeEvent } from './itOnNodeEvent.js';

export {
  startMockMarketDataService,
  mockMarketDataControl,
  type MockMarketDataInput,
  type MockMarketUpdateItemInput,
  type SymbolMarketData,
};

async function startMockMarketDataService(): Promise<{ close: () => Promise<void> }> {
  const mockMarketDataServiceWsServer = new WebSocketServer({
    port: parseInt(new URL(process.env.LIVE_MARKET_PRICES_SERVICE_WS_URL!).port),
  });

  (async () => {
    for await (const [ws] of itOnNodeEvent<[WebSocket]>(
      mockMarketDataServiceWsServer,
      'connection'
    )) {
      (async () => {
        const askedSymbolsIter = pipe(
          itOnNodeEvent<[WebSocket.RawData]>(ws, 'message'),
          itTakeUntil(itOnNodeEvent(ws, 'close')),
          itMap(([messageData]) =>
            pipe(
              messageData,
              $ => $.toString(),
              $ => JSON.parse($),
              $ => $.symbols as string[],
              $ => $.toSorted(),
              $ => sortedUniq($)
            )
          ),
          itPairwise([] as string[]),
          itFilter(([prev, next], i) => i === 0 || !isEqual(prev, next)),
          itShare()
        );

        let currAskedSymbols: string[] = [];

        (async () => {
          for await ([, currAskedSymbols] of askedSymbolsIter);
        })();

        (async () => {
          for await (const [, nextAskedSymbols] of askedSymbolsIter) {
            mockMarketDataControl.whenNextMarketDataSymbolsRequestedChannel.next(nextAskedSymbols);
          }
        })();

        const outgoingUpdates = pipe(
          askedSymbolsIter,
          itFilter(([prev, next], i) => i === 0 || !!prev.length !== !!next.length),
          itSwitchMap(([, nextSymbols]) => {
            if (nextSymbols.length === 0) {
              return of({});
            }
            return nextIterForMockMarketUpdates;
          }),
          itTakeUntil(itOnNodeEvent(ws, 'close')),
          itMap(nextMockData => {
            return pipe(
              nextMockData,
              $ => pick($, currAskedSymbols),
              $ =>
                mapValues($, symbolData =>
                  symbolData === null
                    ? null
                    : {
                        currency: 'USD',
                        marketState: 'REGULAR',
                        regularMarketTime: '2024-01-01T00:00:00.000Z',
                        quoteSourceName: undefined,
                        ...symbolData,
                      }
                )
            );
          }),
          itFilter((nextMockDataFiltered, i) => i === 0 || !isEmpty(nextMockDataFiltered))
        );

        try {
          for await (const payload of outgoingUpdates) {
            if (ws.readyState !== WebSocket.OPEN) {
              break;
            }
            await wsSendJson(ws, { success: true, data: payload });
            mockMarketDataControl.messageHandleFeedbackChannel.next();
          }
        } catch (err: any) {
          console.error(
            'Mock market service encountered an issue while processing data',
            err.stack
          );
          await wsSendJson(ws, { success: false, data: { message: err.message } });
          throw err;
        }
      })();
    }
  })();

  await once(mockMarketDataServiceWsServer, 'listening');

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        mockMarketDataServiceWsServer.close(err => (err ? reject(err) : resolve()))
      );
    },
  };
}

async function wsSendJson(ws: WebSocket, payload: unknown): Promise<void> {
  const serialized = JSON.stringify(payload);
  await new Promise<void>((resolve, reject) =>
    ws.send(serialized, {}, err => (err ? reject(err) : resolve()))
  );
}

const mockDataFeedChannel = iterifiedUnwrapped<AsyncIterable<MockMarketUpdateItemInput>>();
let mockDataFeedChannelActiveIterator = mockDataFeedChannel.iterable[Symbol.asyncIterator]();

const nextIterForMockMarketUpdates: AsyncIterable<MockMarketUpdateItemInput> = pipe(
  itLazyDefer(() =>
    pipe(
      { [Symbol.asyncIterator]: () => mockDataFeedChannelActiveIterator },
      myIterableCleanupPatcher(async function* (source) {
        const messageHandleFeedbackActiveIterator =
          mockMarketDataControl.messageHandleFeedbackChannel.iterable[Symbol.asyncIterator]();

        try {
          for await (const next of source) {
            for await (const update of next) {
              const whenUpdateConsumed = messageHandleFeedbackActiveIterator.next();
              yield update;
              await whenUpdateConsumed; // TODO: Does this totally make sense to involve at all in this current stream system?
            }
          }
        } finally {
          await messageHandleFeedbackActiveIterator.return();
        }
      })
    )
  ),
  itShare()
);

const mockMarketDataControl = new (class {
  whenNextMarketDataSymbolsRequestedChannel = iterifiedUnwrapped<string[]>();
  messageHandleFeedbackChannel = iterifiedUnwrapped<void>();

  async whenNextMarketDataSymbolsRequested(specificSymbols?: string[]): Promise<void> {
    for await (const nextReqSymbols of this.whenNextMarketDataSymbolsRequestedChannel.iterable) {
      if (!specificSymbols || specificSymbols.every(s => nextReqSymbols.includes(s))) {
        break;
      }
    }
  }

  start(adHocStartWith?: MockMarketDataInput): AsyncDisposable & {
    next: (nextData: MockMarketDataInput) => Promise<void>;
  } {
    const stopInnerItersTrigger = Promise.withResolvers<void>();

    const mockController = {
      async [Symbol.asyncDispose]() {
        const promise = mockDataFeedChannelActiveIterator.return();
        mockDataFeedChannelActiveIterator = mockDataFeedChannel.iterable[Symbol.asyncIterator]();
        await promise;
        stopInnerItersTrigger.resolve();
      },

      async next(nextData: MockMarketDataInput) {
        const whenFullyConsumed = Promise.withResolvers<void>();

        const dataIter = pipe(
          typeof nextData === 'function' ? nextData() : nextData,
          $ =>
            (() => {
              if (Symbol.asyncIterator in $) {
                return $;
              }
              return (async function* () {
                yield* Symbol.iterator in $ ? $ : [$];
              })();
            })(),
          normalizedToItersIter =>
            pipe(
              normalizedToItersIter,
              itTakeUntil(stopInnerItersTrigger.promise),
              itFinally(() => whenFullyConsumed.resolve())
            )
        );

        mockDataFeedChannel.next(dataIter);

        await whenFullyConsumed.promise;
      },
    };

    if (adHocStartWith) {
      mockController.next(adHocStartWith);
    }

    return mockController;
  }
})();

type MockMarketDataInput =
  | MockMarketUpdateItemInput
  | Iterable<MockMarketUpdateItemInput>
  | AsyncIterable<MockMarketUpdateItemInput>
  | (() =>
      | MockMarketUpdateItemInput
      | Iterable<MockMarketUpdateItemInput>
      | AsyncIterable<MockMarketUpdateItemInput>);

type MockMarketUpdateItemInput = {
  [symbol: string]: null | Partial<SymbolMarketData>;
};

type SymbolMarketData = {
  currency: string;
  marketState: string;
  regularMarketTime: string | Date;
  regularMarketPrice: number;
  quoteSourceName?: string;
};
