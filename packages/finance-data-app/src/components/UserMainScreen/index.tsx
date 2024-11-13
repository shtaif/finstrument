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
        initialValue={!document.hidden ? holdingStatsIter : (async function* () {})()}
        value={visibilityConditionedHoldingStatsIters}
      >
        {({ value: holdingStatsIter }) => (
          <>
            <HoldingStatsRealTimeActivityStatus input={holdingStatsIter} />

            <Iterate value={holdingStatsIter}>
              {next => (
                <>
                  {(next.error || next.value?.errors) && (
                    <HoldingDataErrorPanel
                      errors={next.error ? [next.error] : next.value?.errors}
                    />
                  )}

                  <PositionsTable
                    className="positions-table"
                    loading={next.pendingFirst}
                    loadingStatePlaceholderRowsCount={lastFetchedHoldingsCount}
                    holdings={next.value?.holdingStats?.map(
                      ({
                        symbol,
                        totalQuantity,
                        breakEvenPrice,
                        marketValue,
                        priceData,
                        unrealizedPnl,
                      }) => ({
                        symbol,
                        currency: priceData.currency ?? undefined,
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

function createLotDataIter({ symbol }: { symbol: string }): AsyncIterable<{
  lots: LotItem[];
  errors: readonly GraphQLError[] | undefined;
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
