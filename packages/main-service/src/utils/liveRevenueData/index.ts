import { mapValues, pickBy, uniq } from 'lodash';
import { pipe } from 'shared-utils';
// import { from, AsyncSink } from '@reactivex/ix-esnext-esm/asynciterable';
// import { switchMap } from '@reactivex/ix-esnext-esm/asynciterable/operators/switchmap';
import { itMap, itLazyDefer, itSwitchMap } from 'iterable-operators';
import { UserModel } from '../../db/index.js';
import positionsService from '../positionsService/index.js';
import { marketDataService } from '../marketDataService/index.js';

export { liveRevenueData as default, type LiveRevenueDataUpdate, type ProfitOrLossInfo };

// (async () => {
//   const iter = pipe(
//     from({
//       [Symbol.asyncIterator]() {
//         const sink = new AsyncSink<undefined>();
//         const intervalId = setInterval(() => sink.write(undefined), 3000);

//         return {
//           next: async () => sink.next(),
//           return: async () => {
//             console.log('SOURCE GOT CLOSED OFF');
//             clearInterval(intervalId);
//             return { done: true, value: undefined };
//           },
//         };
//       },
//     }),
//     // from(
//     //   (async function* () {
//     //     try {
//     //       yield 'a';
//     //       await new Promise(resolve => setTimeout(resolve, 5000));
//     //       yield 'b';
//     //     } finally {
//     //       console.log('SOURCE FINALLY');
//     //     }
//     //   })()
//     // ),
//     iter => ({
//       [Symbol.asyncIterator]() {
//         const iterator = iter[Symbol.asyncIterator]();
//         return {
//           next: () => {
//             return iterator.next();
//           },
//           return: () => {
//             return iterator.return!();
//           },
//         };
//       },
//     }),
//     switchMap(async function* (item) {
//       // throw new Error('LOL');
//       yield* [item, item, item];
//     })
//   );

//   try {
//     for await (const item of iter) {
//       console.log('ITEM', item);
//       // break;
//     }
//     console.log('DONE');
//   } catch (err) {
//     console.error('ERROR', err);
//   }
// })();

function liveRevenueData(params: {
  userAlias: string;
  includeDetailedPositionsFor?: string[];
}): AsyncIterable<LiveRevenueDataUpdate> {
  const { userAlias: ownerAlias /*, includeDetailedPositionsFor = []*/ } = params;

  // const detailedPositionsToInclude = new Set(
  //   includeDetailedPositionsFor.map(sym => sym.toUpperCase())
  // );

  /* ================================================================ */
  // detailedPositionsToInclude.add('SPLG');
  /* ================================================================ */

  return pipe(
    itLazyDefer(async () => {
      const ownerId = (await UserModel.findOne({
        where: { alias: ownerAlias },
      }))!.id;
      return positionsService.observeHoldingChanges([{ ownerId }]);
    }),
    itSwitchMap(changedHoldings =>
      pipe(
        marketDataService.observeMarketData({
          symbols: uniq(changedHoldings.map(({ symbol }) => symbol)),
        }),
        itMap(pricesData => ({
          pricesData,
          changedHoldings: changedHoldings,
        }))
      )
    ),
    itMap(({ pricesData, changedHoldings }) => ({
      updatesBySymbol: pipe(
        pricesData,
        pricesData => pickBy(pricesData, (price): price is NonNullable<typeof price> => !!price),
        priceData =>
          mapValues(priceData, (priceUpdateForSymbol, symbol) => {
            const { breakEvenPrice, totalQuantity } = changedHoldings.find(
              h => h.symbol === symbol
            )!;
            return {
              price: {
                regularMarketPrice: priceUpdateForSymbol?.regularMarketPrice ?? 0,
                regularMarketTime: priceUpdateForSymbol?.regularMarketTime,
                marketState: priceUpdateForSymbol?.marketState,
              },
              profitOrLoss: calcRevenueForPosition({
                startPrice: breakEvenPrice,
                changedPrice: priceUpdateForSymbol?.regularMarketPrice ?? 0,
                quantity: totalQuantity,
              }),
              // individualPositionRevenues: !detailedPositionsToInclude.has(symbol)
              //   ? undefined
              //   : positions.map(({ date, remainingQuantity, price }) => ({
              //       position: {
              //         date,
              //         remainingQuantity,
              //         price,
              //       },
              //       revenue: calcRevenueForPosition({
              //         startPrice: price,
              //         changedPrice: priceUpdateForSymbol.regularMarketPrice,
              //         quantity: remainingQuantity,
              //       }),
              //     })),
            };
          })
      ),
    }))
  );
}

function calcRevenueForPosition(input: {
  startPrice: number | null | undefined;
  changedPrice: number;
  quantity: number;
}): ProfitOrLossInfo {
  const { changedPrice, startPrice, quantity } = input;
  if (typeof startPrice !== 'number') {
    return { amount: 0, percent: 0 };
  }
  const amount = (changedPrice - startPrice) * quantity;
  const percent = (changedPrice / startPrice - 1) * 100;
  return { amount, percent };
}

type LiveRevenueDataUpdate = {
  updatesBySymbol: {
    [symbol: string]: {
      price: {
        regularMarketPrice: number;
        regularMarketTime: Date;
        marketState: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
      };
      profitOrLoss: ProfitOrLossInfo;
      // individualHoldingProfitOrLosss:
      //   | undefined
      //   | {
      //       position: {
      //         date: Date;
      //         remainingQuantity: number;
      //         price: number;
      //       };
      //       revenue: ProfitOrLossInfo;
      //     }[];
    };
  };
};

type ProfitOrLossInfo = {
  percent: number;
  amount: number;
};

// (async () => {
//   await require('node:timers/promises').setTimeout(1000);

//   // for (let i = 0; i < 3; ++i) {
//   //   for await (const item of liveRevenueData({ userAlias: 'dorshtaif' })) {
//   //     console.log(`item ${i + 1}`, item);
//   //     break;
//   //   }
//   // }

//   const iterable = liveRevenueData({ userAlias: 'dorshtaif' });
//   {
//     const it = iterable[Symbol.asyncIterator]();
//     console.log('STARTING');
//     const item = await it.next();
//     console.log(`ITEM ${1}`, item);
//     await it.return!();
//     console.log('DONE');
//   }
//   {
//     const it = iterable[Symbol.asyncIterator]();
//     console.log('STARTING');
//     const item = await it.next();
//     console.log(`ITEM ${2}`, item);
//     await it.return!();
//     console.log('DONE');
//   }
//   {
//     const it = iterable[Symbol.asyncIterator]();
//     console.log('STARTING');
//     const item = await it.next();
//     console.log(`ITEM ${3}`, item);
//     await it.return!();
//     console.log('DONE');
//   }
// })();
