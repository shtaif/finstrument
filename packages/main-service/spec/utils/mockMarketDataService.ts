import { once } from 'node:events';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import WebSocket, { WebSocketServer } from 'ws';
import { mapValues, pick, isEmpty } from 'lodash';
import { pipe } from 'shared-utils';
import {
  itFilter,
  itFinally,
  itLazyDefer,
  itMap,
  itSwitchMap,
  itTakeFirst,
  itTakeUntil,
} from 'iterable-operators';
import { iterifiedUnwrapped } from 'iterified';
import { itOnNodeEvent } from './itOnNodeEvent.js';

export { mockMarketDataService, mockMarketDataControl, type SymbolMarketData };

const mockMarketDataService = new WebSocketServer({
  port: parseInt(new URL(process.env.LIVE_MARKET_PRICES_SERVICE_WS_URL!).port),
});

// let debugId = 0;

// const mockMarketDataFnsAlreadyUsed = new Set<any>();

mockMarketDataService.on('connection', async ws => {
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
    itSwitchMap(([messageData]) => {
      const parsed = JSON.parse(messageData.toString());
      const currAskedSymbols: string[] = parsed.symbols;

      return pipe(
        currAskedSymbols.length === 0
          ? of({})
          : pipe(
              itLazyDefer(() => {
                mockMarketDataControl.newSymbolsRequestedIterified.next(currAskedSymbols);
                whenSymbolsAreRequested.resolve();
                return mockMarketDataActivatedIterable;
              }),
              itFinally(() => {
                whenSymbolsAreRequested = Promise.withResolvers<void>();
              }),
              itMap(nextMockMarketData => pick(nextMockMarketData, currAskedSymbols)),
              itFilter(nextMockMarketDataFiltered => !isEmpty(nextMockMarketDataFiltered))
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
    })),
    itTakeUntil(once(ws, 'close'))
  );

  for await (const payload of outgoingUpdates) {
    const serialized = JSON.stringify(payload);
    await new Promise<void>((resolve, reject) =>
      ws.send(serialized, {}, err => (err ? reject(err) : resolve()))
    );
    mockMarketDataControl.messageHandleFeedbackChannel.next();
  }

  // return;

  // ws.on('message', async data => {
  //   const parsed = JSON.parse(data.toString());

  //   // currAskedSymbols = parsed.symbols;
  //   const currAskedSymbols: string[] = parsed.symbols;
  //   // currAskedSymbols.splice(0);
  //   // currAskedSymbols.push(...parsed.symbols);

  //   console.log('STARTED NEW!', { currAskedSymbols, currDebugId });

  //   const currAskedSymbols2 = parsed.symbols;

  //   // mockMarketDataControl.newSymbolsRequestedIterified.next(currAskedSymbols);

  //   // console.log('MESSAGE IN', currDebugId, parsed);

  //   const outgoingUpdates = pipe(
  //     currAskedSymbols.length === 0
  //       ? of({})
  //       : pipe(
  //           mockMarketDataActivatedIterable,
  //           source => {
  //             return {
  //               [Symbol.asyncIterator]: () => {
  //                 let iterator: AsyncIterator<ExtractAsyncIterableValue<typeof source>>;
  //                 return {
  //                   next: async () => {
  //                     if (!iterator) {
  //                       iterator = source[Symbol.asyncIterator]();
  //                       mockMarketDataControl.newSymbolsRequestedIterified.next(currAskedSymbols);
  //                     }
  //                     console.log('NEXT CALLED!', { currDebugId });
  //                     return iterator.next().then(value => {
  //                       console.log('NEXT CALLED - VALUE:', value, { currDebugId });
  //                       return value;
  //                     });
  //                   },
  //                   return: async () => {
  //                     const returnResult = iterator.return?.() ?? {
  //                       done: true as const,
  //                       value: undefined,
  //                     };
  //                     // mockMarketDataControl.reset();
  //                     console.log('TERMINATED!', { currDebugId });
  //                     return returnResult;
  //                   },
  //                 };
  //               },
  //             };
  //           },
  //           itMap(nextMockMarketDataBeforePick => {
  //             console.log({
  //               nextMockMarketDataBeforePick,
  //               currAskedSymbols,
  //               ___: currAskedSymbols2 === currAskedSymbols,
  //               currDebugId,
  //             });
  //             setTimeout(() => console.log('parsed.symbols', parsed.symbols), 200);
  //             return nextMockMarketDataBeforePick;
  //           }),
  //           itMap(nextMockMarketData => pick(nextMockMarketData, currAskedSymbols)),
  //           itMap(nextMockMarketDataAfterPick => {
  //             console.log({
  //               nextMockMarketDataAfterPick,
  //               currAskedSymbols,
  //               ___: currAskedSymbols2 === currAskedSymbols,
  //               currDebugId,
  //             });
  //             return nextMockMarketDataAfterPick;
  //           }),
  //           itFilter(nextMockMarketDataFiltered => !isEmpty(nextMockMarketDataFiltered))
  //         ),
  //     itTakeUntil(
  //       Promise.race([
  //         once(ws, 'close').then(() => console.log('GOT "close" EVENT')),
  //         once(ws, 'message').then(() => console.log('GOT "message" EVENT')),
  //       ])
  //     ),
  //     // itFinally(() => {
  //     //   console.log('TERMINATED!');
  //     // }),
  //     itMap(nextMockMarketData3 => {
  //       console.log('nextMockMarketData3', nextMockMarketData3);
  //       return nextMockMarketData3;
  //     }),
  //     itMap(nextMockMarketData => ({
  //       success: true as const,
  //       data: mapValues(nextMockMarketData, symbolData => ({
  //         currency: 'USD',
  //         marketState: 'REGULAR',
  //         regularMarketTime: '2024-01-01T00:00:00.000Z',
  //         quoteSourceName: undefined,
  //         ...symbolData,
  //       })),
  //     }))
  //   );

  //   for await (const payload of outgoingUpdates) {
  //     // console.log('MESSAGE OUT', currDebugId, payload);
  //     const serialized = JSON.stringify(payload);
  //     await new Promise<void>((resolve, reject) =>
  //       ws.send(serialized, err => (err ? reject(err) : resolve()))
  //     );
  //     mockMarketDataControl.messageHandleFeedbackChannel.next();
  //   }
  // });
});

// await new Promise<void>((resolve, reject) =>
//   mockMarketDataService.close(err => (err ? reject(err) : resolve()))
// );

// let mockMarketDataActivatedIterable: AsyncIterable<{
//   nextData: { [symbol: string]: null | Partial<SymbolMarketData> };
//   notifyMessageHandledCb: () => void;
// }>;
let mockMarketDataActivatedIterable: AsyncIterable<{
  [symbol: string]: null | Partial<SymbolMarketData>;
}>;

let messageHandleFeedbackActivatedIterator: AsyncIterator<void>;

let whenSymbolsAreRequested = Promise.withResolvers<void>();

const mockMarketDataControl = new (class {
  #mockMarketDataChannel = iterifiedUnwrapped<{
    [symbol: string]: null | Partial<SymbolMarketData>;
  }>();
  messageHandleFeedbackChannel = iterifiedUnwrapped<void>();
  newSymbolsRequestedIterified = iterifiedUnwrapped<string[]>();

  async waitUntilRequestingNewSymbols(): Promise<string[]> {
    return (await pipe(this.newSymbolsRequestedIterified.iterable, itTakeFirst()))!;
  }

  onNewSymbolsRequested() {
    return this.newSymbolsRequestedIterified.iterable;
  }

  async next(nextMarketUpdate: {
    [symbol: string]: null | Partial<SymbolMarketData>;
  }): Promise<void> {
    this.#mockMarketDataChannel.next(nextMarketUpdate);
    await messageHandleFeedbackActivatedIterator.next();
  }

  async onConnectionSend(
    marketUpdatesIter:
      | AsyncIterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>
      | Iterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>
      | (() => AsyncIterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>)
      | (() => Iterable<{ [symbol: string]: null | Partial<SymbolMarketData> }>)
  ): Promise<void> {
    await whenSymbolsAreRequested.promise;
    const iter = typeof marketUpdatesIter === 'function' ? marketUpdatesIter() : marketUpdatesIter;
    for await (const nextMarketUpdate of iter) {
      this.#mockMarketDataChannel.next(nextMarketUpdate);
      await messageHandleFeedbackActivatedIterator.next();
    }
  }

  reset(): void {
    this.#mockMarketDataChannel.done();
    this.messageHandleFeedbackChannel.done();

    this.#mockMarketDataChannel = iterifiedUnwrapped();
    this.messageHandleFeedbackChannel = iterifiedUnwrapped();
    this.newSymbolsRequestedIterified = iterifiedUnwrapped();

    // mockMarketDataActivatedIterable = pipe(
    //   this.#mockMarketDataChannel.iterable[Symbol.asyncIterator](),
    //   iterator => ({
    //     [Symbol.asyncIterator]: () => ({
    //       next: () => iterator.next(),
    //       return: () => {
    //         // this.reset();
    //         return iterator.return();
    //       },
    //     }),
    //   })
    // );
    mockMarketDataActivatedIterable = pipe(this.#mockMarketDataChannel.iterable);

    messageHandleFeedbackActivatedIterator =
      this.messageHandleFeedbackChannel.iterable[Symbol.asyncIterator]();
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
