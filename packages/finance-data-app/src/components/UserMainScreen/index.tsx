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
import { documentVisibilityChanges } from '../../utils/documentVisibilityChanges.ts';
import { MainStatsStrip } from './components/MainStatsStrip/index.tsx';
import { PositionsTable } from '../PositionsTable/index.tsx';
import { HoldingDataErrorPanel } from './components/HoldingDataErrorPanel';
import { AccountMainMenu } from './components/AccountMainMenu/index.tsx';
import { HoldingStatsRealTimeActivityStatus } from './components/HoldingStatsRealTimeActivityStatus/index.tsx';
import { UploadTrades } from './components/UploadTrades/index.tsx';
import { useTradeImportSuccessNotification } from './notifications/useTradeImportSuccessNotification.tsx';
import { useServerConnectionErrorNotification } from './notifications/useServerConnectionErrorNotification.tsx';
import './style.css';

export { UserMainScreen };

function UserMainScreen() {
  const tradeImportSuccessNotification = useTradeImportSuccessNotification();
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
      <>{tradeImportSuccessNotification.placement}</>
      <>{serverConnectionErrorNotification.placement}</>

      <div>
        <AccountMainMenu />
      </div>

      <UploadTrades
        className="upload-trades"
        onUploadSuccess={() => tradeImportSuccessNotification.show()}
        onUploadFailure={_err => {}}
      />

      <div>
        <Iterate initialValue={!document.hidden} value={documentVisibilityChanges}>
          {({ value: docVisible }) => {
            const [holdingStatsOrEmptyIter, portfolioStatsIterOrEmptyIter] = [
              docVisible ? holdingStatsIter : (async function* () {})(),
              docVisible ? portfolioStatsIter : (async function* () {})(),
            ];
            return (
              <>
                <HoldingStatsRealTimeActivityStatus input={holdingStatsOrEmptyIter} />

                <MainStatsStrip
                  data={iterateFormatted(portfolioStatsIterOrEmptyIter, next =>
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

                <Iterate value={holdingStatsOrEmptyIter}>
                  {next =>
                    (next.error || next.value?.errors) && (
                      <HoldingDataErrorPanel
                        errors={next.error ? [next.error] : next.value?.errors}
                      />
                    )
                  }
                </Iterate>

                <PositionsTable
                  className="positions-table"
                  loadingStatePlaceholderRowsCount={lastFetchedHoldingsCount}
                  holdings={iterateFormatted(holdingStatsOrEmptyIter, next =>
                    next.holdingStats.map(
                      ({
                        symbol,
                        totalQuantity,
                        portionOfPortfolioMarketValue,
                        breakEvenPrice,
                        marketValue,
                        priceData,
                        unrealizedPnl,
                      }) => ({
                        symbol,
                        currency: priceData.currency ?? undefined,
                        portfolioValuePortion: portionOfPortfolioMarketValue,
                        quantity: totalQuantity,
                        breakEvenPrice: breakEvenPrice ?? undefined,
                        marketPrice: priceData.regularMarketPrice,
                        timeOfPrice: priceData.regularMarketTime,
                        marketState: priceData.marketState,
                        marketValue,
                        unrealizedPnl: {
                          amount: unrealizedPnl.amount,
                          percent: unrealizedPnl.percent,
                        },
                        comprisingPositions: {
                          iter: [
                            () =>
                              pipe(
                                createLotDataIter({ symbol }),
                                itMap(({ lots }) => lots)
                              ),
                            [symbol],
                          ],
                        },
                      })
                    )
                  )}
                />
              </>
            );
          }}
        </Iterate>
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
  lots: LotItem[];
}> {
  return pipe(
    itLazyDefer(async () => {
      const queriedLots = await gqlClient.query({
        variables: { symbol },
        query: lotQuery,
      });

      const lotIds = queriedLots.data.lots.map(({ id }) => id);

      const allCurrLots = {} as { [symbol: string]: LotItem };

      return pipe(
        gqlWsClient.iterate<LotDataSubscriptionResult>({
          variables: { ids: lotIds },
          query: gqlPrint(lotDataSubscription),
        }),
        itTap(next => {
          for (const update of next.data?.lots ?? []) {
            ({
              ['SET']: () => (allCurrLots[update.data.id] = update.data),
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
    }
  }
`);

const lotDataSubscription = graphql(/* GraphQL */ `
  subscription LotDataSubscription($ids: [ID!]!) {
    lots(filters: { ids: $ids }) {
      type
      data {
        id
        openedAt
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
type LotItem = LotDataSubscriptionResult['lots'][number]['data'];
