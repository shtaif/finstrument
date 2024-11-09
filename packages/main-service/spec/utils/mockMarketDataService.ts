import { once } from 'node:events';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import WebSocket, { WebSocketServer } from 'ws';
import { mapValues, pick, isEmpty } from 'lodash-es';
import { pipe } from 'shared-utils';
import {
  itFilter,
  itFinally,
  itLazyDefer,
  itMap,
  itSwitchMap,
  itTakeUntil,
} from 'iterable-operators';
import { iterifiedUnwrapped } from 'iterified';
import { itOnNodeEvent } from './itOnNodeEvent.js';

export { startMockMarketDataService, mockMarketDataControl, type SymbolMarketData };

async function startMockMarketDataService(): Promise<{ close: () => Promise<void> }> {
  const mockMarketDataServiceWsServer = new WebSocketServer({
    port: parseInt(new URL(process.env.LIVE_MARKET_PRICES_SERVICE_WS_URL!).port),
  });

  // mockMarketDataServiceWsServer.on('close', () => {});

  // let debugId = 0;

  // const mockMarketDataFnsAlreadyUsed = new Set<any>();

  (async () => {
    for await (const [ws] of itOnNodeEvent<[WebSocket]>(
      mockMarketDataServiceWsServer,
      'connection'
    )) {
      await (async () => {
        // let currAskedSymbols: string[] = [];

        // setTimeout(() => console.log('___currAskedSymbols___', currAskedSymbols), 1000);

        // ws.on('error', err => {
        //   console.error(err);
        // });

        // const currDebugId = ++debugId;

        // ws.on('close', () => {
        //   console.log('END', currDebugId);
        // });

        // console.log('START', currDebugId);

        const outgoingUpdates = pipe(
          itOnNodeEvent<[WebSocket.RawData]>(ws, 'message'),
          itTakeUntil(once(ws, 'close')),
          itFinally(() => {
            mockMarketDataControl.whenMarketDataRequestedPWithResolvers = Promise.withResolvers();
            // mockMarketDataControl.whenNextMarketDataSymbolsRequestedChannel.next(false);
          }),
          itSwitchMap(([messageData]) => {
            const currAskedSymbols: string[] = pipe(
              messageData,
              $ => $.toString(),
              $ => JSON.parse($),
              $ => $.symbols
            );

            return pipe(
              currAskedSymbols.length === 0
                ? of({})
                : itLazyDefer(() => {
                    mockMarketDataControl.whenMarketDataRequestedPWithResolvers.resolve(
                      currAskedSymbols
                    );
                    mockMarketDataControl.whenNextMarketDataSymbolsRequestedChannel.next(
                      currAskedSymbols
                    );
                    return mockMarketDataControl.data;
                  }),
              itMap(nextMockMarketData => {
                return pick(nextMockMarketData, currAskedSymbols);
              }),
              itFilter(
                (nextMockMarketDataFiltered, i) => i === 0 || !isEmpty(nextMockMarketDataFiltered)
              )
            );
          }),
          itMap(nextMockMarketData => ({
            success: true as const,
            data: mapValues(nextMockMarketData, symbolData =>
              symbolData === null
                ? null
                : {
                    currency: 'USD',
                    marketState: 'REGULAR',
                    regularMarketTime: '2024-01-01T00:00:00.000Z',
                    quoteSourceName: undefined,
                    ...symbolData,
                  }
            ),
          }))
        );

        for await (const payload of outgoingUpdates) {
          const serialized = JSON.stringify(payload);
          await new Promise<void>((resolve, reject) =>
            ws.send(serialized, {}, err => (err ? reject(err) : resolve()))
          );
          mockMarketDataControl!.messageHandleFeedbackChannel.next();
        }
      })();
    }
  })();

  await once(mockMarketDataServiceWsServer, 'listening');

  return {
    close: async () => {
      return new Promise<void>((resolve, reject) => {
        mockMarketDataServiceWsServer.close(err => (err ? reject(err) : resolve()));
      });
    },
  };
}

const mockMarketDataControl = new (class {
  #mockMarketDataChannel = iterifiedUnwrapped<{
    [symbol: string]: null | Partial<SymbolMarketData>;
  }>();

  whenMarketDataRequestedPWithResolvers = Promise.withResolvers<string[]>();
  whenNextMarketDataSymbolsRequestedChannel = iterifiedUnwrapped<string[]>();
  // whenNextMarketDataSymbolsRequestedActiveIterator =
  //   this.whenNextMarketDataSymbolsRequestedChannel.iterable[Symbol.asyncIterator]();
  messageHandleFeedbackChannel = iterifiedUnwrapped<void>();
  messageHandleFeedbackActiveIterator =
    this.messageHandleFeedbackChannel.iterable[Symbol.asyncIterator]();

  get data(): AsyncIterable<{ [symbol: string]: null | Partial<SymbolMarketData> }> {
    return this.#mockMarketDataChannel.iterable;
  }

  async waitUntilRequestingNewSymbols(): Promise<string[]> {
    return await this.whenMarketDataRequested();
  }
  async whenMarketDataRequested(): Promise<string[]> {
    return this.whenMarketDataRequestedPWithResolvers.promise;
  }

  async whenNextMarketDataSymbolsRequested(specificSymbols?: string[]): Promise<void> {
    // await pipe(
    //   { [Symbol.asyncIterator]: () => this.whenNextMarketDataSymbolsRequestedActiveIterator },
    //   itFilter(Boolean),
    //   itTakeFirst()
    // );

    for await (const nextReqSymbols of this.whenNextMarketDataSymbolsRequestedChannel.iterable) {
      // console.log('nextReqSymbols_______________', nextReqSymbols);
      if (!specificSymbols || specificSymbols.every(s => nextReqSymbols.includes(s))) {
        break;
      }
    }

    // await pipe(this.whenNextMarketDataSymbolsRequestedChannel.iterable, itTakeFirst());

    // ('');

    // if (hasCurrentlyRequestedSymbols) {
    //   await pipe(
    //     { [Symbol.asyncIterator]: () => this.whenNextMarketDataSymbolsRequestedActiveIterator },
    //     itFilter(hasCurrentlyRequestedSymbols => !hasCurrentlyRequestedSymbols),
    //     itTakeFirst()
    //   );
    // }
    // return this.whenMarketDataRequestedPWithResolvers.promise;
  }

  async onConnectionSend(
    marketUpdatesIter:
      | AsyncIterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>
      | Iterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>
      | (() => AsyncIterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>)
      | (() => Iterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>)
  ): Promise<void> {
    // console.log('HERE 1', '^'.repeat(200));
    await this.whenMarketDataRequestedPWithResolvers.promise;
    // await Promise.race([
    //   this.whenMarketDataRequestedPWithResolvers.promise,
    //   this.whenNextMarketDataSymbolsRequested(),
    // ]);
    // console.log('HERE 2', '^'.repeat(200));
    const iter = typeof marketUpdatesIter === 'function' ? marketUpdatesIter() : marketUpdatesIter;
    for await (const nextMarketUpdate of iter) {
      (this.#mockMarketDataChannel.iterable as any).lastSent = nextMarketUpdate;
      this.#mockMarketDataChannel.next(nextMarketUpdate);
      await this.messageHandleFeedbackActiveIterator.next();
    }
  }

  reset(): void {
    this.#mockMarketDataChannel.done();
    this.messageHandleFeedbackChannel.done();
    this.whenNextMarketDataSymbolsRequestedChannel.done();

    this.#mockMarketDataChannel = iterifiedUnwrapped();
    this.whenMarketDataRequestedPWithResolvers = Promise.withResolvers();

    this.messageHandleFeedbackChannel = iterifiedUnwrapped();
    this.messageHandleFeedbackActiveIterator =
      this.messageHandleFeedbackChannel.iterable[Symbol.asyncIterator]();

    this.whenNextMarketDataSymbolsRequestedChannel = iterifiedUnwrapped();
    // this.whenNextMarketDataSymbolsRequestedActiveIterator =
    //   this.whenNextMarketDataSymbolsRequestedChannel.iterable[Symbol.asyncIterator]();
  }
})();

mockMarketDataControl.reset();

type SymbolMarketData = {
  currency: string;
  marketState: string;
  regularMarketTime: string | Date;
  regularMarketPrice: number;
  quoteSourceName?: string;
};
