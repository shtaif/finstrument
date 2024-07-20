import React, { memo, useMemo, type ReactElement } from 'react';
import { Table, Tag, Skeleton } from 'antd';
import { LivePriceDisplay } from '../LivePriceDisplay';
import { SymbolPriceUpdatedAt } from './components/SymbolPriceUpdatedAt';
import { MarketStateIndicatorIcon } from './components/MarketStateIndicatorIcon';
import './style.css';

export { PositionsTableMemo as PositionsTable, type PositionRecord };

function PositionsTable(props: {
  positions?: PositionRecord[];
  loading?: boolean;
  loadingStatePlaceholderRowsCount?: number;
}): ReactElement {
  const { positions = [], loading = false, loadingStatePlaceholderRowsCount = 3 } = props;

  // const antdThemeToken = theme.useToken();

  // const dataSource = positions;
  const dataSource = useMemo(
    () =>
      positions.flatMap(position => [
        {
          type: 'AGGREGATE_POS' as const,
          ...position,
        },
        ...(position.rawPositions ?? []).map(rawPosition => ({
          type: 'RAW_POS' as const,
          symbol: position.symbol,
          ...rawPosition,
        })),
      ]),
    [positions]
  );

  return (
    <>
      <Table
        className="positions-table"
        rowKey={pos =>
          `${pos.symbol}${pos.type === 'RAW_POS' ? `${pos.date}_${pos.quantity}_${pos.price}` : ''}`
        } // TODO: Is this necessary?
        size="small"
        pagination={false}
        // loading={loading && { indicator: <Spin size="large" /> }}
        expandable={{
          rowExpandable: ({ rawPositions }) => !!rawPositions?.length,
          expandedRowRender: ({ rawPositions = [], revenue }) => (
            <div className="">
              {/* {rawPositions.map(({ date, quantity, price }) => (
                <div key={`${date}_${quantity}_${price}`} className="">
                  On: {date} bought {quantity} at ${commonDecimalNumCurrencyFormat(price, 'USD')}
                </div>
              ))} */}

              <Table
                className=""
                style={{ margin: 25 }}
                size="small"
                pagination={false}
                // bordered
                dataSource={rawPositions}
                columns={[
                  {
                    title: <>Date</>,
                    dataIndex: 'date',
                    render: (_, { date }) => date.replace('T', ' ').slice(0, -5),
                  },
                  {
                    title: <>Quantity</>,
                    dataIndex: 'quantity',
                    render: (_, { quantity }) =>
                      quantity === undefined ? '-' : quantity.toLocaleString(),
                  },
                  {
                    title: <>Revenue [%]</>,
                    dataIndex: ['revenue', 'percent'],
                    render: _ =>
                      revenue?.percent === undefined ? (
                        '-'
                      ) : (
                        <LivePriceDisplay price={revenue.percent}>
                          {revPercent => (
                            <div style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                              {commonDecimalNumFormat(revPercent)}%
                            </div>
                          )}
                        </LivePriceDisplay>
                      ),
                  },
                  {
                    title: <>Revenue [abs]</>,
                    dataIndex: ['revenue', 'amount'],
                    render: _ =>
                      revenue?.amount === undefined ? (
                        '-'
                      ) : (
                        <LivePriceDisplay price={revenue.amount}>
                          {revAmount => (
                            <div style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                              {commonDecimalNumCurrencyFormat(revAmount, 'USD')}
                            </div>
                          )}
                        </LivePriceDisplay>
                      ),
                  },
                ]}
              ></Table>
            </div>
          ),
          // rowExpandable: record => record.name !== 'Not Expandable',
        }}
        dataSource={
          loading && !dataSource.length
            ? new Array(loadingStatePlaceholderRowsCount)
                .fill(undefined)
                .map((_, i) => ({ symbol: `${i}` }))
            : dataSource
        }
        columns={[
          {
            title: <>Symbol</>,
            // dataIndex: 'symbol',
            className: 'symbol-cell',
            render: (_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : (
                pos.type === 'AGGREGATE_POS' && (
                  <Tag className="symbol-name-tag" color="geekblue">
                    {pos.symbol}
                  </Tag>
                )
              ),
          },
          {
            title: <>Current Price</>,
            // dataIndex: ['marketPrice', 'timeOfPrice', 'marketState'],
            className: 'current-price-cell',
            render: (_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : (
                pos.type === 'AGGREGATE_POS' &&
                (pos.marketPrice === undefined ? (
                  '-'
                ) : (
                  <div className="cell-content">
                    {pos.marketState && (
                      <div>
                        <MarketStateIndicatorIcon
                          className="market-state-indicator"
                          marketState={pos.marketState}
                        />
                      </div>
                    )}
                    <div>
                      <div>
                        <LivePriceDisplay className="" price={pos.marketPrice}>
                          {marketPrice => `${commonDecimalNumCurrencyFormat(marketPrice, 'USD')}`}
                        </LivePriceDisplay>
                      </div>
                      {pos.timeOfPrice && (
                        <SymbolPriceUpdatedAt className="last-updated-at" at={pos.timeOfPrice} />
                      )}
                    </div>
                  </div>
                ))
              ),
          },
          {
            title: <>Quantity of Shares</>,
            // dataIndex: 'quantity',
            className: 'quantity-cell',
            render: (_, { quantity }) =>
              loading ? <CellSkeleton /> : quantity === undefined ? '-' : quantity.toLocaleString(),
          },
          {
            title: <>Break Even Price</>,
            // dataIndex: 'breakEvenPrice',
            className: 'break-even-price-cell',
            // render: (_, { breakEvenPrice, ...rest }) =>
            //   breakEvenPrice === undefined
            //     ? '-'
            //     : `$${commonDecimalNumFormat(breakEvenPrice ?? price)}`,
            render: (_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : pos.type === 'AGGREGATE_POS' ? (
                pos.breakEvenPrice === undefined ? (
                  '-'
                ) : (
                  `${commonDecimalNumCurrencyFormat(pos.breakEvenPrice, 'USD')}`
                )
              ) : (
                `${commonDecimalNumCurrencyFormat(pos.price, 'USD')}`
              ),
          },
          {
            title: <>Revenue [%]</>,
            // dataIndex: ['revenue', 'percent'],
            className: 'unrealized-pnl-percent-cell',
            render: (_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : pos.revenue?.percent === undefined ? (
                '-'
              ) : (
                <LivePriceDisplay price={pos.revenue.percent}>
                  {revPercent => <>{commonDecimalNumCurrencyFormat(revPercent, 'USD')}%</>}
                </LivePriceDisplay>
              ),
          },
          {
            title: <>Revenue [abs]</>,
            // dataIndex: ['revenue', 'amount'],
            className: 'unrealized-pnl-amount-cell',
            render: (_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : pos.revenue?.amount === undefined ? (
                '-'
              ) : (
                <LivePriceDisplay price={pos.revenue.amount}>
                  {revAmount => <>{commonDecimalNumCurrencyFormat(revAmount, 'USD')}</>}
                </LivePriceDisplay>
              ),
          },
        ]}
      />
    </>
  );
}

type PositionRecord = {
  symbol: string;
  marketPrice?: number;
  timeOfPrice?: Date | string | number;
  marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
  quantity?: number;
  breakEvenPrice?: number;
  revenue?: {
    amount?: number;
    percent?: number;
  };
  rawPositions?: {
    date: string;
    quantity: number;
    price: number;
    revenue?: {
      amount?: number;
      percent?: number;
    };
  }[];
};

const CellSkeleton = memo(() => {
  return <Skeleton active title={false} paragraph={{ rows: 1 }} />;
});

const PositionsTableMemo = memo(PositionsTable);

const commonDecimalNumFormat: (num: number) => string = (() => {
  const commonDecimalNumFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num => commonDecimalNumFormatter.format(num);
})();

const commonDecimalNumCurrencyFormat = (num: number, currency: string): string => {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: 'currency',
    currency,
  }).format(num);
};
