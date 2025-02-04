import { useMemo } from 'react';
import { useLocalStorage } from 'react-use';
import { keyBy } from 'lodash-es';
import { print as gqlPrint, type GraphQLError } from 'graphql';
// import { useQuery, useSubscription } from '@apollo/client';
import { useAsyncIterState, It, iterateFormatted } from 'react-async-iterators';
import { pipe } from 'shared-utils';
import {
  itCatch,
  itCombineLatest,
  itLazyDefer,
  itMap,
  itShare,
  itSwitchMap,
  itTap,
  myIterableCleanupPatcher,
} from 'iterable-operators';
import { graphql, type DocumentType } from '../../generated/gql/index.ts';
import { gqlClient, gqlWsClient } from '../../utils/gqlClient/index.ts';
import { PositionsTable } from '../PositionsTable/index.tsx';
import { getCurrentPortfolioCurrencySetting } from './utils/getCurrentPortfolioCurrencySetting.ts';
import { MainStatsStrip } from './components/MainStatsStrip/index.tsx';
import { CurrencySelect } from './components/CurrencySelect/index.tsx';
import { PositionDataErrorPanel } from './components/PositionDataErrorPanel/index.tsx';
import { AccountMainMenu } from './components/AccountMainMenu/index.tsx';
import { PositionDataRealTimeActivityStatus } from './components/PositionDataRealTimeActivityStatus/index.tsx';
import { UploadTrades } from './components/UploadTrades/index.tsx';
import { useServerConnectionErrorNotification } from './notifications/useServerConnectionErrorNotification.tsx';
import './style.css';

export { UserMainScreen };

function UserMainScreen() {
  const serverConnectionErrorNotification = useServerConnectionErrorNotification();

  const [lastFetchedPositionCount, setLastFetchedPositionCount] = useLocalStorage<
    number | undefined
  >('last_fetched_positions_count', undefined);

  const [portfolioCurrencySettingIterBase, setPortfolioCurrencySetting] =
    useAsyncIterState<string>();

  const portfolioCurrencySettingIter = useMemo(() => {
    const initialPortfolioCurrencySetting = getCurrentPortfolioCurrencySetting();

    let currVal =
      initialPortfolioCurrencySetting instanceof Promise
        ? undefined
        : initialPortfolioCurrencySetting;

    return pipe(
      portfolioCurrencySettingIterBase,
      myIterableCleanupPatcher(async function* (source) {
        if (initialPortfolioCurrencySetting instanceof Promise) {
          currVal = await initialPortfolioCurrencySetting;
        }
        yield currVal!;
        for await (const nextCurrency of source) {
          currVal = nextCurrency;
          window.localStorage.setItem('portfolio_currency', JSON.stringify(nextCurrency));
          yield nextCurrency;
        }
      }),
      itShare(),
      $ =>
        Object.assign($, {
          get value() {
            return !currVal ? undefined : { current: currVal };
          },
        })
    );
  }, [portfolioCurrencySettingIterBase, setPortfolioCurrencySetting]);

  const portfolioStatsIters = useMemo(
    () =>
      pipe(
        portfolioCurrencySettingIter,
        itMap(currencyCode => ({
          statsInModifiedCurrency: createPortfolioStatsIter({ currencyCode }),
        })),
        itShare()
      ),
    []
  );

  const positionsIter = useMemo(() => {
    const portfolioStatsIter = pipe(
      portfolioStatsIters,
      itSwitchMap(next => next.statsInModifiedCurrency)
    );
    return pipe(
      itCombineLatest(createCombinedPositionsIter(), portfolioStatsIter),
      itMap(([nextPositionUpdate, nextPortfolioUpdate]) => {
        const compositionBySymbol = keyBy(
          nextPortfolioUpdate.stats?.compositionByHoldings,
          c => c.symbol
        );

        const positionsWithPortfolioPortions = nextPositionUpdate.positions.map(update => ({
          ...update,
          portionOfPortfolioMarketValue: compositionBySymbol[update.symbol]
            ? compositionBySymbol[update.symbol].portionOfPortfolioMarketValue
            : undefined,
        }));

        const errors =
          !nextPositionUpdate.errors?.length && !nextPortfolioUpdate.errors?.length
            ? undefined
            : [...(nextPositionUpdate.errors ?? []), ...(nextPortfolioUpdate.errors ?? [])];

        return {
          errors,
          positions: positionsWithPortfolioPortions,
        };
      }),
      itTap((next, i) => {
        if (i === 0) {
          setLastFetchedPositionCount(next.positions.length);
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

      <header>
        <AccountMainMenu />
      </header>

      <UploadTrades
        className="upload-trades"
        onUploadSuccess={() => {}}
        onUploadFailure={_err => {}}
      />

      <div>
        <PositionDataRealTimeActivityStatus input={positionsIter} />

        <section className="portfolio-top-strip">
          <It value={portfolioStatsIters}>
            {next => (
              <MainStatsStrip
                className="portfolio-stats-area"
                data={iterateFormatted(next.value?.statsInModifiedCurrency, next =>
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
            )}
          </It>

          <div className="portfolio-options-area">
            <It value={portfolioCurrencySettingIter}>
              {next => (
                <CurrencySelect
                  loading={next.pendingFirst}
                  currency={next.value}
                  onCurrencyChange={setPortfolioCurrencySetting}
                />
              )}
            </It>
          </div>
        </section>

        <PositionDataErrorPanel errors={iterateFormatted(positionsIter, p => p.errors)} />

        <PositionsTable
          className="positions-table"
          loadingStatePlaceholderRowsCount={lastFetchedPositionCount}
          positions={iterateFormatted(positionsIter, next =>
            next.positions.map(h => ({
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

function createCombinedPositionsIter(): AsyncIterable<{
  errors: readonly GraphQLError[] | undefined;
  positions: PositionItem[];
}> {
  return pipe(
    itLazyDefer(() =>
      gqlWsClient.iterate<PositionDataSubscriptionResult>({
        query: gqlPrint(positionDataSubscription),
      })
    ),
    $ =>
      itLazyDefer(() => {
        const allCurrPositions = {} as { [symbol: string]: PositionItem };

        return pipe(
          $,
          itTap(next => {
            for (const update of next.data?.positions ?? []) {
              ({
                ['SET']: () => (allCurrPositions[update.data.symbol] = update.data),
                ['REMOVE']: () => delete allCurrPositions[update.data.symbol],
              })[update.type]();
            }
          }),
          itMap(next => ({
            positions: Object.values(allCurrPositions),
            errors: next.errors,
          }))
        );
      }),
    itShare()
  );
}

const positionDataSubscription = graphql(/* GraphQL */ `
  subscription PositionDataSubscription {
    positions {
      type
      data {
        symbol
        totalQuantity
        breakEvenPrice
        marketValue
        priceData {
          marketState
          currency
          regularMarketTime
          regularMarketPrice
        }
        unrealizedPnl {
          amount
          percent
        }
      }
    }
  }
`);

type PositionDataSubscriptionResult = DocumentType<typeof positionDataSubscription>;
type PositionItem = PositionDataSubscriptionResult['positions'][number]['data'];

function createPortfolioStatsIter(params: { currencyCode: string }): AsyncIterable<{
  errors: readonly GraphQLError[] | undefined;
  stats: undefined | PortfolioStatsUpdate;
}> {
  return pipe(
    gqlWsClient.iterate<PortfolioStatsSubscriptionResults>({
      variables: { currencyToCombineIn: params.currencyCode },
      query: gqlPrint(portfolioStatsDataSubscription),
    }),
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

// const renderate: {
//   <TVal>(
//     value: TVal,
//     mapFn: (nextIterationState: IterationResult<TVal>) => React.ReactNode
//   ): React.ReactNode;

//   <TVal, TInitialVal = undefined>(
//     value: TVal,
//     initialValue: TInitialVal,
//     mapFn: (nextIterationState: IterationResult<TVal, TInitialVal>) => React.ReactNode
//   ): React.ReactNode;
// } = <TVal, TInitialVal = undefined>(
//   ...args:
//     | [value: unknown, mapFn?: (nextIterationState: unknown) => React.ReactNode]
//     | [
//         value: unknown,
//         initialValue: unknown,
//         mapFn?: (nextIterationState: unknown) => React.ReactNode,
//       ]
// ): React.ReactNode => {
//   let value: unknown;
//   let initialValue: unknown;
//   let mapFn: (nextIterationState: unknown) => React.ReactNode;

//   value = args[0];

//   if (args.length === 3) {
//     initialValue = args[1];
//   } else if (args.length === 2) {
//     if (typeof args[1] === 'function') {
//       mapFn = args[1] ?? (() => undefined);
//     }
//   }

//   if (typeof args[1] === 'function') {
//     initialValue = undefined;
//     mapFn = (args[1] ?? (() => undefined)) as (nextIterationState: unknown) => React.ReactNode;
//   } else {
//     initialValue = args[1];
//     if (typeof args[2] === 'function') {
//       mapFn = args[2] ?? (() => undefined);
//     }
//   }

//   return (
//     <Iterate value={value} initialValue={initialValue}>
//       {next => mapFn(next)}
//     </Iterate>
//   );
// };

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
