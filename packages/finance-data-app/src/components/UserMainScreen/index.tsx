import React, { useEffect, useMemo } from 'react';
import { useLocalStorage, useAsyncFn } from 'react-use';
import { useVisibilityChange } from '@uidotdev/usehooks';
import { Upload, UploadFile, Spin, notification } from 'antd';
import { LoadingOutlined, UploadOutlined, DisconnectOutlined } from '@ant-design/icons';
import { print as gqlPrint, type GraphQLError } from 'graphql';
// import { useQuery, useSubscription } from '@apollo/client';
import { Iterate } from 'react-async-iterable';
import { pipe } from 'shared-utils';
import { itLazyDefer, itMap, itShare, itTap } from 'iterable-operators';
import { graphql, type DocumentType } from '../../generated/gql/index.ts';
import { SetTradesInputMode } from '../../generated/gql/graphql.ts';
import { gqlClient, gqlWsClient } from '../../utils/gqlClient/index.ts';
import { PositionsTable } from '../PositionsTable/index.tsx';
import { AccountMainMenu } from './components/AccountMainMenu/index.tsx';
import './style.css';

export { UserMainScreen };

function UserMainScreen() {
  const isBrowserTabVisible = useVisibilityChange();
  const [notificationInstance, notificationPlacement] = notification.useNotification();

  const [lastFetchedHoldingsCount, setLastFetchedHoldingsCount] = useLocalStorage<
    number | undefined
  >('last-fetched-holdings-count', undefined);

  const holdingStatsDataIter = useMemo(
    () => (!isBrowserTabVisible ? (async function* () {})() : combinedHoldingStatsIter()),
    [isBrowserTabVisible]
  );

  useEffect(() => {
    const it = holdingStatsDataIter[Symbol.asyncIterator]();
    (async () => {
      try {
        for await (const _ of {
          [Symbol.asyncIterator]: () => it,
        });
      } catch (err: any) {
        notificationInstance.error({
          key: 'server_data_connection_error_notification',
          message: <>Error</>,
          description: <>Couldn't connect to server data stream</>,
        });
      }
    })();
    return () => void it.return!();
  }, [holdingStatsDataIter, notificationInstance]);

  useEffect(() => {
    const nextFetchedHoldingCount = pipe(
      holdingStatsDataIter,
      itMap(next => next.holdingStats.length),
      iter => iter[Symbol.asyncIterator]()
    );
    (async () => {
      try {
        for await (const count of {
          [Symbol.asyncIterator]: () => nextFetchedHoldingCount,
        })
          setLastFetchedHoldingsCount(count);
      } catch {}
    })();
    return () => void nextFetchedHoldingCount.return!();
  }, [holdingStatsDataIter, setLastFetchedHoldingsCount]);

  const [{ loading: isUploadingLedger }, uploadLedger] = useAsyncFn(
    async (file: UploadFile<any>) => {
      const fileContents: string = await (file as any).text();

      return await gqlClient.mutate({
        variables: {
          input: {
            mode: SetTradesInputMode.Replace,
            data: { csv: fileContents },
          },
        },
        mutation: setTradesMutation,
      });
    },
    []
  );

  return (
    <div className="cmp-user-main-screen">
      {notificationPlacement}

      <div>
        <AccountMainMenu />
      </div>

      <Upload.Dragger
        className="csv-ledger-upload-area"
        accept="text/csv"
        maxCount={1}
        showUploadList={false}
        beforeUpload={() => false}
        onChange={info => uploadLedger(info.file)}
      >
        {isUploadingLedger ? (
          <Spin indicator={<LoadingOutlined className="loading-spinner" spin />} />
        ) : (
          <>
            <div className="upload-icon-container">
              <UploadOutlined className="upload-icon" />
            </div>
            <div className="text-line">Import CSV Ledger</div>
          </>
        )}
      </Upload.Dragger>

      <Iterate value={holdingStatsDataIter}>
        {next =>
          next.pendingFirst || (next.done && !next.error) ? (
            <>⚪️ Pending...</>
          ) : next.error ? (
            <>
              <DisconnectOutlined /> Issue connecting
            </>
          ) : (
            <>🟢 Connected</>
          )
        }
      </Iterate>

      <Iterate value={holdingStatsDataIter}>
        {next =>
          next.error ? (
            <div>Oh no! {(next.error as any)?.message}</div>
          ) : next.value?.errors?.length ? (
            <div>{JSON.stringify(next, undefined, 2)}</div>
          ) : null
        }
      </Iterate>

      <Iterate value={holdingStatsDataIter}>
        {next => (
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
        )}
      </Iterate>
    </div>
  );
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

const setTradesMutation = graphql(/* GraphQL */ `
  mutation SetTradesMutation($input: SetTradesInput!) {
    setTrades(input: $input) {
      tradesAddedCount
      tradesModifiedCount
      tradesRemovedCount
    }
  }
`);

// const sampleLedgerCsv = `
// Trades,Header,Platform,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,Units,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code,Term
// Trades,Data,IBKR,Order,Stocks,USD,QQQ,2023-05-09 09:30:02,5,Stocks,321.98,321.64,-1609.9,-1.0,1610.9,0.0,-1.7,O,
// Trades,Data,IBKR,Order,Stocks,USD,RSP,2023-04-25 13:49:53,15,Stocks,142.975,142.72,-2144.625,-1.0,2145.625,0.0,-3.825,O,
// Trades,Data,IBKR,Order,Stocks,USD,RSP,2023-05-25 12:17:53,-15,Stocks,139.582,139.92,2093.73,-1.01892484,-2145.625,-52.913925,-5.07,C,
// Trades,Data,IBKR,Order,Stocks,USD,SPLG,2023-02-03 13:09:39,42,Stocks,48.585,48.5,-2040.57,-1.0,2041.57,0.0,-3.57,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPLG,2023-02-07 09:30:00,62,Stocks,48.09,48.84,-2981.58,-1.0,2982.58,0.0,46.5,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPLG,2023-02-15 09:30:00,41,Stocks,48.26,48.69,-1978.66,-1.0,1979.66,0.0,17.63,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPLG,2023-04-18 10:04:26,41,Stocks,48.67,48.7,-1995.47,-1.0,1996.47,0.0,1.23,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPLG,2023-05-02 09:30:00,41,Stocks,48.75,48.31,-1998.75,-1.0,1999.75,0.0,-18.04,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPYG,2023-05-09 09:30:00,10,Stocks,55.9,55.83,-559.0,-1.0,560.0,0.0,-0.7,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPYG,2023-05-17 13:13:36,8,Stocks,56.5773,56.66,-452.6184,-1.0,453.6184,0.0,0.6616,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPYG,2023-05-18 10:34:57,7,Stocks,56.97,57.25,-398.79,-1.0,399.79,0.0,1.96,O,
// Trades,Data,IBKR,Order,Stocks,USD,SPYG,2023-05-26 12:25:30,18,Stocks,57.81,57.87,-1040.58,-1.0,1041.58,0.0,1.08,O,
// Trades,Data,IBKR,Order,Stocks,USD,VGT,2023-05-17 13:13:40,1,Stocks,393.3073,394.23,-393.3073,-1.0,394.3073,0.0,0.9227,O,
// Trades,Data,IBKR,Order,Stocks,USD,VGT,2023-05-18 10:29:15,3,Stocks,398.55,401.97,-1195.65,-1.0,1196.65,0.0,10.26,O,
// Trades,Data,IBKR,Order,Stocks,USD,VGT,2023-05-25 12:22:16,5,Stocks,406.99,407.71,-2034.95,-1.0,2035.95,0.0,3.6,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-02-03 13:09:56,5,Stocks,379.53,378.85,-1897.65,-1.0,1898.65,0.0,-3.4,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-02-07 09:30:00,8,Stocks,375.79,381.52,-3006.32,-1.0,3007.32,0.0,45.84,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-02-15 09:30:00,5,Stocks,377.15,380.48,-1885.75,-1.0,1886.75,0.0,16.65,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-04-18 10:04:26,5,Stocks,380.22,380.54,-1901.1,-1.0,1902.1,0.0,1.6,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-04-25 13:58:56,6,Stocks,373.96,373.1,-2243.76,-1.0,2244.76,0.0,-5.16,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOO,2023-05-02 09:30:00,5,Stocks,381.06,377.51,-1905.3,-1.0,1906.3,0.0,-17.75,O,
// Trades,Data,IBKR,Order,Stocks,USD,VOOG,2023-05-08 09:31:03,5,Stocks,233.26,233.64,-1166.3,-1.0,1167.3,0.0,1.9,O,
// `;
