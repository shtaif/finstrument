import React, { useMemo } from 'react';
import { useLocalStorage } from 'react-use';
import { notification } from 'antd';
import { print as gqlPrint, type GraphQLError } from 'graphql';
// import { useQuery, useSubscription } from '@apollo/client';
import { Iterate } from 'react-async-iterable';
import { pipe } from 'shared-utils';
import { itCatch, itLazyDefer, itMap, itShare, itTap } from 'iterable-operators';
import { graphql, type DocumentType } from '../../generated/gql/index.ts';
import { gqlClient, gqlWsClient } from '../../utils/gqlClient/index.ts';
import { documentVisibilityChanges } from '../../utils/documentVisibilityChanges.ts';
import { PositionsTable } from '../PositionsTable/index.tsx';
import { HoldingDataErrorPanel } from './components/HoldingDataErrorPanel';
import { AccountMainMenu } from './components/AccountMainMenu/index.tsx';
import { HoldingStatsRealTimeActivityStatus } from './components/HoldingStatsRealTimeActivityStatus/index.tsx';
import { UploadTrades } from './components/UploadTrades/index.tsx';
import './style.css';

export { UserMainScreen };

function UserMainScreen() {
  const tradeImportSuccessNotification = useTradeImportSuccessNotification();
  const serverConnectionErrorNotification = useServerConnectionErrorNotification();

  const [lastFetchedHoldingsCount, setLastFetchedHoldingsCount] = useLocalStorage<
    number | undefined
  >('last_fetched_holdings_count', undefined);

  const holdingStatsIter = useMemo(
    () =>
      pipe(
        combinedHoldingStatsIter(),
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
      ),
    []
  );

  const visibilityConditionedHoldingStatsIters = useMemo(
    () =>
      pipe(
        documentVisibilityChanges,
        itMap(docVisible => (docVisible ? holdingStatsIter : (async function* () {})()))
      ),
    [holdingStatsIter]
  );

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

      <Iterate
        value={visibilityConditionedHoldingStatsIters}
        initialValue={!document.hidden ? holdingStatsIter : (async function* () {})()}
      >
        {({ value: holdingStatsIter }) => (
          <>
            <HoldingStatsRealTimeActivityStatus input={holdingStatsIter} />

            <Iterate value={holdingStatsIter}>
              {next => (
                <>
                  <HoldingDataErrorPanel
                    className=""
                    errors={next.error ? [next.error] : next.value?.errors}
                  />

                  <PositionsTable
                    className="positions-table"
                    loading={next.pendingFirst}
                    loadingStatePlaceholderRowsCount={lastFetchedHoldingsCount}
                    holdings={next.value?.holdingStats?.map(
                      ({ symbol, totalQuantity, breakEvenPrice, priceData, unrealizedPnl }) => ({
                        symbol,
                        quantity: totalQuantity,
                        breakEvenPrice: breakEvenPrice ?? undefined,
                        marketPrice: priceData.regularMarketPrice,
                        timeOfPrice: priceData.regularMarketTime,
                        marketState: priceData.marketState,
                        unrealizedPnl: {
                          amount: unrealizedPnl.amount,
                          percent: unrealizedPnl.percent,
                        },
                        comprisingPositions: {
                          iter: [
                            () =>
                              pipe(
                                createPositionDataIter({ symbol }),
                                itMap(({ positions }) => positions)
                              ),
                            [symbol],
                          ],
                        },
                      })
                    )}
                  />
                </>
              )}
            </Iterate>
          </>
        )}
      </Iterate>
    </div>
  );
}

function useTradeImportSuccessNotification() {
  const [notif, notifPlacement] = notification.useNotification();

  const show = () =>
    notif.success({
      key: 'trade_import_success_notification',
      message: <>Trades imported successfully</>,
    });

  return {
    show: show,
    placement: notifPlacement,
  };
}

function useServerConnectionErrorNotification() {
  const [notif, notifPlacement] = notification.useNotification();

  const show = () =>
    notif.error({
      key: 'server_data_connection_error_notification',
      message: <>Error</>,
      description: <>Couldn't connect to server data stream</>,
    });

  return {
    show: show,
    placement: notifPlacement,
  };
}

function combinedHoldingStatsIter(): AsyncIterable<{
  holdingStats: HoldingStatsItem[];
  errors: readonly GraphQLError[] | undefined;
}> {
  return pipe(
    itLazyDefer(() => {
      const allCurrHoldingStats = {} as { [symbol: string]: HoldingStatsItem };

      return pipe(
        gqlWsClient.iterate<HoldingStatsDataSubscriptionResult>({
          query: gqlPrint(holdingStatsDataSubscription),
        }),
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

function createPositionDataIter({ symbol }: { symbol: string }): AsyncIterable<{
  positions: PositionItem[];
  errors: readonly GraphQLError[] | undefined;
}> {
  return pipe(
    itLazyDefer(async () => {
      const queriedPositions = await gqlClient.query({
        variables: { symbol },
        query: positionQuery,
      });

      const posIds = queriedPositions.data.positions.map(({ id }) => id);

      const allCurPositions = {} as { [symbol: string]: PositionItem };

      return pipe(
        gqlWsClient.iterate<PositionDataSubscriptionResult>({
          variables: { ids: posIds },
          query: gqlPrint(positionDataSubscription),
        }),
        itTap(next => {
          for (const update of next.data?.positions ?? []) {
            ({
              ['SET']: () => (allCurPositions[update.data.id] = update.data),
              ['REMOVE']: () => delete allCurPositions[update.data.id],
            })[update.type]();
          }
        }),
        itMap(next => ({
          positions: Object.values(allCurPositions),
          errors: next.errors,
        }))
      );
    }),
    itShare()
  );
}

const positionQuery = graphql(/* GraphQL */ `
  query PositionsQuery($symbol: ID!) {
    positions(filters: { symbols: [$symbol] }) {
      id
    }
  }
`);

const positionDataSubscription = graphql(/* GraphQL */ `
  subscription PositionDataSubscription($ids: [ID!]!) {
    positions(filters: { ids: $ids }) {
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

type PositionDataSubscriptionResult = DocumentType<typeof positionDataSubscription>;
type PositionItem = PositionDataSubscriptionResult['positions'][number]['data'];
