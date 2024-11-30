import React, { useMemo } from 'react';
import { useLocalStorage } from 'react-use';
import { keyBy } from 'lodash-es';
import { print as gqlPrint, type GraphQLError } from 'graphql';
// import { useQuery, useSubscription } from '@apollo/client';
import { Iterate, iterateFormatted } from 'react-async-iterable';
import { pipe } from 'shared-utils';
import { itCatch, itCombineLatest, itLazyDefer, itMap, itShare, itTap } from 'iterable-operators';
import { graphql, type DocumentType } from '../../generated/gql/index.ts';
import { gqlClient, gqlWsClient } from '../../utils/gqlClient/index.ts';
import { MainStatsStrip } from './components/MainStatsStrip/index.tsx';
import { PositionsTable } from '../PositionsTable/index.tsx';
import { HoldingDataErrorPanel } from './components/HoldingDataErrorPanel';
import { AccountMainMenu } from './components/AccountMainMenu/index.tsx';
import { HoldingStatsRealTimeActivityStatus } from './components/HoldingStatsRealTimeActivityStatus/index.tsx';
import { UploadTrades } from './components/UploadTrades/index.tsx';
import { useServerConnectionErrorNotification } from './notifications/useServerConnectionErrorNotification.tsx';
import './style.css';

export { UserMainScreen };

function UserMainScreen() {
  const serverConnectionErrorNotification = useServerConnectionErrorNotification();

  const [lastFetchedHoldingsCount, setLastFetchedHoldingsCount] = useLocalStorage<
    number | undefined
  >('last_fetched_holdings_count', undefined);

  const portfolioStatsIter = useMemo(() => createPortfolioStatsIter(), []);

  const holdingStatsIter = useMemo(() => {
    return pipe(
      itCombineLatest(createCombinedHoldingStatsIter(), portfolioStatsIter),
      itMap(([nextHoldingUpdate, nextPortfolioUpdate]) => {
        const compositionBySymbol = pipe(nextPortfolioUpdate.stats?.compositionByHoldings, $ =>
          keyBy($, comp => comp.symbol)
        );

        const holdingStatsWithPortfolioPortions = nextHoldingUpdate.holdingStats.map(update => ({
          ...update,
          portionOfPortfolioMarketValue: compositionBySymbol[update.symbol]
            ? compositionBySymbol[update.symbol].portionOfPortfolioMarketValue
            : undefined,
        }));

        const errors =
          !nextHoldingUpdate.errors?.length && !nextPortfolioUpdate.errors?.length
            ? undefined
            : [...(nextHoldingUpdate.errors ?? []), ...(nextPortfolioUpdate.errors ?? [])];

        return {
          errors,
          holdingStats: holdingStatsWithPortfolioPortions,
        };
      }),
      itTap((next, i) => {
        if (i === 0) {
          setLastFetchedHoldingsCount(next.holdingStats.length);
        }
      }),
      itCatch(err => {
        serverConnectionErrorNotification.show();
        throw err;
      }),
      itShare()
    );
  }, []);

  return (
    <div className="cmp-user-main-screen">
      <>{serverConnectionErrorNotification.placement}</>

      <div>
        <AccountMainMenu />
      </div>

      <UploadTrades
        className="upload-trades"
        onUploadSuccess={() => {}}
        onUploadFailure={_err => {}}
      />

      <div>
        <HoldingStatsRealTimeActivityStatus input={holdingStatsIter} />

        <MainStatsStrip
          data={iterateFormatted(portfolioStatsIter, next =>
            !next?.stats
              ? undefined
              : {
                  currencyShownIn: next.stats.currencyCombinedBy,
                  marketValue: next.stats.marketValue,
                  unrealizedPnl: {
                    amount: next.stats.unrealizedPnl.amount,
                    fraction: next.stats.unrealizedPnl.fraction,
                  },
                }
          )}
        />

        <Iterate value={holdingStatsIter}>
          {next =>
            (next.error || next.value?.errors) && (
              <HoldingDataErrorPanel errors={next.error ? [next.error] : next.value?.errors} />
            )
          }
        </Iterate>

        <PositionsTable
          className="positions-table"
          loadingStatePlaceholderRowsCount={lastFetchedHoldingsCount}
          holdings={iterateFormatted(holdingStatsIter, next =>
            next.holdingStats.map(h => ({
              symbol: h.symbol,
              currency: h.priceData.currency ?? undefined,
              portfolioValuePortion: h.portionOfPortfolioMarketValue,
              quantity: h.totalQuantity,
              breakEvenPrice: h.breakEvenPrice ?? undefined,
              marketPrice: h.priceData.regularMarketPrice,
              timeOfPrice: h.priceData.regularMarketTime,
              marketState: h.priceData.marketState,
              marketValue: h.marketValue,
              unrealizedPnl: {
                amount: h.unrealizedPnl.amount,
                percent: h.unrealizedPnl.percent,
              },
              comprisingLots: [
                () =>
                  pipe(
                    createLotDataIter({ symbol: h.symbol }),
                    itMap(({ lots }) =>
                      lots.map(l => ({
                        ...l,
                        date: l.openedAt,
                        originalQty: l.originalQuantity,
                        remainingQty: l.remainingQuantity,
                      }))
                    )
                  ),
                [h.symbol],
              ],
            }))
          )}
        />
      </div>
    </div>
  );
}

function createCombinedHoldingStatsIter(): AsyncIterable<{
  errors: readonly GraphQLError[] | undefined;
  holdingStats: HoldingStatsItem[];
}> {
  return pipe(
    itLazyDefer(() =>
      gqlWsClient.iterate<HoldingStatsDataSubscriptionResult>({
        query: gqlPrint(holdingStatsDataSubscription),
      })
    ),
    $ =>
      itLazyDefer(() => {
        const allCurrHoldingStats = {} as { [symbol: string]: HoldingStatsItem };

        return pipe(
          $,
          itTap(next => {
            for (const update of next.data?.holdingStats ?? []) {
              ({
                ['SET']: () => (allCurrHoldingStats[update.data.symbol] = update.data),
                ['REMOVE']: () => delete allCurrHoldingStats[update.data.symbol],
              })[update.type]();
            }
          }),
          itMap(next => ({
            holdingStats: Object.values(allCurrHoldingStats),
            errors: next.errors,
          }))
        );
      }),
    itShare()
  );
}

const holdingStatsDataSubscription = graphql(/* GraphQL */ `
  subscription HoldingStatsDataSubscription {
    holdingStats {
      type
      data {
        symbol
        totalQuantity
        breakEvenPrice
        marketValue
        priceData {
          marketState
          regularMarketTime
          regularMarketPrice
          currency
        }
        unrealizedPnl {
          amount
          percent
        }
      }
    }
  }
`);

type HoldingStatsDataSubscriptionResult = DocumentType<typeof holdingStatsDataSubscription>;
type HoldingStatsItem = HoldingStatsDataSubscriptionResult['holdingStats'][number]['data'];

function createPortfolioStatsIter(): AsyncIterable<{
  errors: readonly GraphQLError[] | undefined;
  stats: undefined | PortfolioStatsUpdate;
}> {
  return pipe(
    itLazyDefer(() =>
      gqlWsClient.iterate<PortfolioStatsSubscriptionResults>({
        query: gqlPrint(portfolioStatsDataSubscription),
        variables: { currencyToCombineIn: 'USD' },
      })
    ),
    itMap(next => ({
      stats: next.data?.combinedPortfolioStats,
      errors: next.errors,
    })),
    itShare()
  );
}

const portfolioStatsDataSubscription = graphql(/* GraphQL */ `
  subscription PortfolioStatsDataSubscription($currencyToCombineIn: String!) {
    combinedPortfolioStats(currencyToCombineIn: $currencyToCombineIn) {
      currencyCombinedBy
      costBasis
      marketValue
      unrealizedPnl {
        amount
        fraction
      }
      compositionByHoldings {
        symbol
        portionOfPortfolioMarketValue
      }
    }
  }
`);

type PortfolioStatsSubscriptionResults = DocumentType<typeof portfolioStatsDataSubscription>;
type PortfolioStatsUpdate = PortfolioStatsSubscriptionResults['combinedPortfolioStats'];

function createLotDataIter({ symbol }: { symbol: string }): AsyncIterable<{
  errors: readonly GraphQLError[] | undefined;
  lots: {
    id: string;
    openedAt: Date;
    originalQuantity: number;
    remainingQuantity: number;
    unrealizedPnl: {
      amount: number;
      percent: number;
    };
  }[];
}> {
  return pipe(
    itLazyDefer(async () => {
      await gqlClient.clearStore();

      const queriedLots = await gqlClient.query({
        variables: { symbol },
        query: lotQuery,
      });

      const queriedLotsById = keyBy(queriedLots.data.lots, l => l.id);

      const lotIds = queriedLots.data.lots.map(({ id }) => id);

      const allCurrLots = {} as {
        [lotId: string]: {
          id: string;
          openedAt: Date;
          originalQuantity: number;
          remainingQuantity: number;
          unrealizedPnl: { amount: number; percent: number };
        };
      };

      return pipe(
        gqlWsClient.iterate<LotDataSubscriptionResult>({
          variables: { ids: lotIds },
          query: gqlPrint(lotDataSubscription),
        }),
        itTap(next => {
          for (const update of next.data?.lots ?? []) {
            ({
              ['SET']: () =>
                (allCurrLots[update.data.id] = {
                  ...queriedLotsById[update.data.id],
                  originalQuantity: update.data.originalQuantity,
                  remainingQuantity: update.data.remainingQuantity,
                  unrealizedPnl: {
                    amount: update.data.unrealizedPnl.amount,
                    percent: update.data.unrealizedPnl.percent,
                  },
                }),
              ['REMOVE']: () => delete allCurrLots[update.data.id],
            })[update.type]();
          }
        }),
        itMap(next => ({
          lots: Object.values(allCurrLots),
          errors: next.errors,
        }))
      );
    }),
    itShare()
  );
}

const lotQuery = graphql(/* GraphQL */ `
  query LotsQuery($symbol: ID!) {
    lots(filters: { symbols: [$symbol] }) {
      id
      openedAt
    }
  }
`);

const lotDataSubscription = graphql(/* GraphQL */ `
  subscription LotDataSubscription($ids: [ID!]!) {
    lots(filters: { ids: $ids }) {
      type
      data {
        id
        originalQuantity
        remainingQuantity
        unrealizedPnl {
          amount
          percent
        }
      }
    }
  }
`);

type LotDataSubscriptionResult = DocumentType<typeof lotDataSubscription>;

// function useIterSourceExperiment() {
//   type Item = {
//     symbol: string;
//     value: number;
//   };

//   const iterSource = useMemo(() => {
//     const iter = (async function* () {
//       const items = [
//         { symbol: 'BTC-USD:ILS', value: +Math.random().toFixed(3) },
//         { symbol: 'ADBE', value: +Math.random().toFixed(3) },
//         { symbol: 'AAPL', value: +Math.random().toFixed(3) },
//         { symbol: 'BTC-USD', value: +Math.random().toFixed(3) },
//         { symbol: 'VUAA.L', value: +Math.random().toFixed(3) },
//       ];

//       let lastYieldedItem: Item | undefined;

//       yield [...items];

//       while (true) {
//         await new Promise(resolve => setTimeout(resolve, 500));
//         let nextItemIdx;
//         do {
//           nextItemIdx = Math.floor(Math.random() * items.length);
//         } while (items[nextItemIdx].symbol === lastYieldedItem?.symbol);
//         items[nextItemIdx] = {
//           ...items[nextItemIdx],
//           value: +Math.random().toFixed(3),
//         };
//         lastYieldedItem = items[nextItemIdx];
//         yield [...items];
//       }
//     })();

//     return iter;
//   }, []);

//   const iterSource2 = useMemo(() => {
//     return (async function* () {
//       const keyGetter: (item: Item) => string = item => item.symbol;

//       const subItersMappedByKeys = new Map<string, IterifiedUnwrapped<Item, void | undefined>>();
//       let itemIters: {
//         key: string;
//         iter: AsyncIterable<Item>;
//       }[] = [];
//       let itemItersLengthChanged = false;

//       for await (const items of iterSource) {
//         for (let i = 0; i < items.length; i++) {
//           const item = items[i];
//           const key = keyGetter(item);
//           let itemIter: AsyncIterable<Item>;

//           if (!subItersMappedByKeys.has(key)) {
//             const sink = iterifiedUnwrapped<Item>();
//             itemIter = sink.iterable;
//             itemItersLengthChanged = true;
//             subItersMappedByKeys.set(key, sink);
//             sink.next(item);
//           } else {
//             const unwrappedIterable = subItersMappedByKeys.get(key)!;
//             unwrappedIterable.next(item);
//             itemIter = unwrappedIterable?.iterable;
//           }

//           itemIters[i] = {
//             key,
//             iter: itemIter,
//           };
//         }
//         if (itemItersLengthChanged) {
//           itemItersLengthChanged = false;
//           yield itemIters;
//         }
//       }
//     })();
//   }, []);

//   return [iterSource, iterSource2];
// }

{
  /* <div>
        <pre>
          <Iterate initialValue={[]} value={iterSource}>
            {next => JSON.stringify(next.value, undefined, 2)}
          </Iterate>
        </pre>
      </div> */
}
{
  /* <div>
        <pre>
          <Iterate initialValue={[]} value={iterSource2}>
            {next =>
              next.value.map(value => (
                <div key={value.key}>
                  <Iterate value={value.iter}>
                    {next =>
                      next.value && (
                        <span>
                          {next.value.symbol} - {next.value.value}
                        </span>
                      )
                    }
                  </Iterate>
                </div>
              ))
            }
          </Iterate>
        </pre>
      </div> */
}
