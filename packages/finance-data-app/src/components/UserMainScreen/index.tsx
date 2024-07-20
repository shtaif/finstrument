import React from 'react';
import axios from 'axios';
import { useEffect, useMemo } from 'react';
import { useLocalStorage, useAsyncFn, useKey, useFirstMountState } from 'react-use';
import { itFilter, itLazyDefer, itMap, itShare, itTake, itTap } from 'iterable-operators';
import { useVisibilityChange } from '@uidotdev/usehooks';
import { useParams } from 'react-router-dom';
import { Upload, UploadFile, Switch, Spin, notification } from 'antd';
import { LoadingOutlined, UploadOutlined } from '@ant-design/icons';
import { print as gqlPrint, type ExecutionResult, type GraphQLError } from 'graphql';
// import { useQuery, useSubscription } from '@apollo/client';
import { empty } from 'ix/asynciterable/empty';
import { useAsyncIterable, Iterate } from '../../utils/react-async-iterable/index.ts';
import { pipe } from 'shared-utils';
import { graphql, type DocumentType } from '../../generated/gql/index.ts';
import { gqlWsClient } from '../../utils/gqlClient/index.ts';
import { PositionsTable } from '../PositionsTable/index.tsx';
import './style.css';

export { UserMainScreen };

// (async function () {
//   const iter = observePositionAndRevenueData({ userAlias: 'dorshtaif' });
//   for await (const item of iter) {
//     console.log('ITEM', item);
//     break;
//   }
//   console.log('DONE');
// })();

const gen = (async function* () {
  for (const item of ['a', 'b', 'c', '🏁'] as const) {
    yield item;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
})();

const concreteVal = 'a' as const;

function UserMainScreen() {
  // const { data: myHoldingStatsQueryData, loading: myHoldingStatsQueryLoading } =
  //   useQuery(myHoldingStatsQuery);

  // const { data: holdingStatsSubsData, loading: holdingStatsSubsLoading } = useSubscription(
  //   holdingStatsDataSubscription
  // );

  // console.log({
  //   myHoldingStatsQueryLoading,
  //   myHoldingStatsQueryData,
  //   holdingStatsSubsLoading,
  //   holdingStatsSubsData,
  // });

  // return (
  //   <div>
  //     <div
  //       style={{
  //         whiteSpace: 'break-spaces',
  //         textAlign: 'left',
  //       }}
  //     >
  //       {JSON.stringify(myHoldingStatsQueryData, undefined, 2)}
  //     </div>
  //     <br />
  //     <br />
  //     <div
  //       style={{
  //         whiteSpace: 'break-spaces',
  //         textAlign: 'left',
  //       }}
  //     >
  //       {JSON.stringify(holdingStatsSubsData, undefined, 2)}
  //     </div>
  //   </div>
  // );

  // const ___1 = useAsyncIterable(gen, 'init_value' as const);
  // const [value1, isPendingFirstIteration1, isDone1, error1] = ___1;
  // if (!isDone1) {
  //   error1;
  // }
  // if (isPendingFirstIteration1) {
  //   isDone1;
  //   error1;
  // } else {
  //   isDone1;
  //   error1;
  // }

  // const ___2 = useAsyncIterable(concreteVal, 'init_value' as const);
  // const [value2, isPendingFirstIteration2, isDone2, error2] = ___2;

  const isFirstMount = useFirstMountState();
  const userAlias = useParams<'alias'>().alias!;
  // const isBrowserTabVisible = useVisibilityChange();
  const isBrowserTabVisible = true;
  const [notificationInstance, notificationPlacement] = notification.useNotification();
  const [
    [liveRevenueDataOn, setLiveRevenueDataOn],
    [lastFetchedHoldingsCount, setLastFetchedHoldingsCount],
  ] = [
    useLocalStorage('live-revenue-data-on', false),
    useLocalStorage<number | undefined>('last-fetched-holdings-count', undefined),
  ];

  useKey(
    'Enter',
    ({ shiftKey }) => {
      if (shiftKey) {
        setLiveRevenueDataOn(!liveRevenueDataOn);
      }
    },
    {},
    [liveRevenueDataOn, setLiveRevenueDataOn]
  );

  const holdingStatsDataIter = useMemo(() => {
    return pipe(combinedHoldingStatsIter(), holdingStatsDataSubs => {
      console.log({
        isFirstMount,
        liveRevenueDataOn,
        isBrowserTabVisible,
      });
      if (isFirstMount && !liveRevenueDataOn) {
        console.log('!!! isFirstMount && !liveRevenueDataOn');
        return pipe(holdingStatsDataSubs, itTake(1));
      }
      if (liveRevenueDataOn && isBrowserTabVisible) {
        return holdingStatsDataSubs;
      }
      console.log('!!! empty...');
      return empty();
    }) satisfies ReturnType<typeof combinedHoldingStatsIter>;
  }, [liveRevenueDataOn, isBrowserTabVisible, isFirstMount]);

  useEffect(() => {
    const it = holdingStatsDataIter[Symbol.asyncIterator]();
    (async () => {
      try {
        for await (const _ of { [Symbol.asyncIterator]: () => it });
      } catch (err: any) {
        notificationInstance.error({
          key: 'server_data_connection_error_notification',
          message: <>Error</>,
          description: <>Couldn't connect to server data stream</>,
        });
        setLiveRevenueDataOn(false);
        console.log('ERROR!!!!!!', err);
      }
    })();
    return () => void it.return!();
  }, [holdingStatsDataIter, notificationInstance, setLiveRevenueDataOn]);

  useEffect(() => {
    const it = holdingStatsDataIter[Symbol.asyncIterator]();
    (async () => {
      try {
        const countOfRecentlyFetchedHoldings = pipe(
          { [Symbol.asyncIterator]: () => it },
          itMap(next => next?.holdingStats.length),
          itFilter(fetchedHoldingsCount => fetchedHoldingsCount !== undefined)
        );
        for await (const count of countOfRecentlyFetchedHoldings) {
          setLastFetchedHoldingsCount(count);
        }
      } catch {
        /* ... */
      }
    })();
    return () => void it.return!();
  }, [holdingStatsDataIter, setLastFetchedHoldingsCount]);

  const [{ loading: isUploadingLedger }, uploadLedger] = useAsyncFn(
    async (file: UploadFile<any>) => {
      const fileContents: string = await (file as any).text();

      return await axios({
        url: `http://localhost:3001/api/positions/${userAlias}`,
        method: 'post',
        data: {
          csvData: fileContents,
        },
      });
    },
    [userAlias]
  );

  return (
    <div className="user-main-screen">
      {notificationPlacement}

      <Upload.Dragger
        className="csv-ledger-upload-area"
        accept="text/csv"
        maxCount={1}
        showUploadList={false}
        beforeUpload={() => false}
        onChange={info => uploadLedger(info.file)}
        // onDragEnter={() => console.log('onDragEnter')}
        // onDragLeave={() => console.log('onDragLeave')}
        // onDragOver={() => console.log('onDragOver')}
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

      <br />
      <br />

      <div className="live-revenue-data-control">
        <label className="label">
          <span>Live revenue data: </span>

          <Switch
            checked={liveRevenueDataOn}
            onChange={isOn => setLiveRevenueDataOn(isOn)}
            unCheckedChildren={<>OFF</>}
            checkedChildren={
              <Iterate value={holdingStatsDataIter}>
                {(_, pendingFirstData, __, ___) =>
                  liveRevenueDataOn && !pendingFirstData ? (
                    <>ON</>
                  ) : (
                    <Spin
                      indicator={
                        <LoadingOutlined
                          style={{ marginTop: -2, fontSize: 16, color: '#ffffff' }}
                        />
                      }
                    />
                  )
                }
              </Iterate>
            }
          />
        </label>
      </div>

      <br />
      <br />

      {/* <div>
        <Iterate initialValue={undefined} value={liveRevenueDataNotifications___2}>
          {(value: any, isDone, isPendingFirstValue) => (
            <>
              <div>
                {value?.eventType === 'open' || value?.eventType === 'message'
                  ? 'Connected'
                  : 'Connecting...'}
              </div>

              <PositionsTable
                loading={isPendingFirstValue}
                positions={Object.entries(value?.data ?? {}).map(
                  ([symbol, { priceStatus, totalQuantity, breakEvenPrice, revenue }]) => ({
                    symbol,
                    marketPrice: priceStatus.regularMarketPrice,
                    quantity: totalQuantity,
                    breakEvenPrice,
                    revenue,
                  })
                )}
              />
            </>
          )}
        </Iterate>
      </div> */}

      <>
        <Iterate
          // <Iterate<UpdatedPositionAndRevenueData, UpdatedPositionAndRevenueData>
          value={holdingStatsDataIter}
          // initialValue={{ latestPositions: {}, latestRevenue: {} } as UpdatedPositionAndRevenueData}
        >
          {(next, pendingFirstData, isDone, error) =>
            error ? (
              <div>
                <h3>Oh no! {(error as any)?.message}</h3>
              </div>
            ) : next?.errors?.length ? (
              <>{JSON.stringify(next, undefined, 2)}</>
            ) : (
              <PositionsTable
                {...(() => {
                  console.log('NEXT', { isDone, next });
                  return {};
                })()}
                loading={pendingFirstData}
                loadingStatePlaceholderRowsCount={lastFetchedHoldingsCount}
                positions={next?.holdingStats?.map(
                  ({ symbol, totalQuantity, breakEvenPrice, priceData, unrealizedPnl }) => {
                    return {
                      symbol,
                      quantity: totalQuantity,
                      breakEvenPrice: breakEvenPrice ?? undefined,
                      marketPrice: priceData.regularMarketPrice,
                      timeOfPrice: priceData.regularMarketTime,
                      marketState: priceData.marketState,
                      revenue: {
                        amount: unrealizedPnl.amount,
                        percent: unrealizedPnl.percent,
                      },
                      rawPositions: [],
                    };
                  }
                )}
              />
            )
          }
        </Iterate>
      </>

      <br />
      <br />

      {/* <div>
        <Iterate initialValue={0}>
          {(async function* () {
            let count = 0;
            while (true) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              yield <span>{count++}</span>;
              // yield {};
            }
          })()}
        </Iterate>
      </div> */}
    </div>
  );
}

// const myHoldingStatsQuery = graphql(/* GraphQL */ `
//   query myHoldingStatsQuery {
//     holdingStats {
//       symbol
//     }
//   }
// `);

function combinedHoldingStatsIter(): AsyncIterable<{
  holdingStats: readonly HoldingStatsItem[];
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
          for (const { type, data: hStats } of next.data?.holdingStats ?? []) {
            if (type === 'REMOVE') {
              delete allCurrHoldingStats[hStats.symbol];
            } else {
              allCurrHoldingStats[hStats.symbol] = hStats;
            }
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
  subscription holdingStatsDataSubscription {
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
