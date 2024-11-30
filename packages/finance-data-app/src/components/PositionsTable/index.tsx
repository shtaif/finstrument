import React, { memo, type ReactElement } from 'react';
import { range } from 'lodash-es';
import { Table, Skeleton, Typography } from 'antd';
import { type MaybeAsyncIterable } from 'iterable-operators';
import { Iterate, iterateFormatted } from 'react-async-iterable';
import { commonDecimalNumCurrencyFormat } from './utils/commonDecimalNumCurrencyFormat';
import { SymbolNameTag } from './components/SymbolNameTag';
import { PositionSizeDisplay } from './components/PositionSizeDisplay/index.tsx';
import { CurrentPriceDisplay } from './components/CurrentPriceDisplay';
import { UnrealizedPnlDisplay } from './components/UnrealizedPnlDisplay';
import {
  PositionExpandedLots,
  type PositionExpandedLotsProps,
} from './components/PositionExpandedLots/index.tsx';
import './style.css';

export { PositionsTableMemo as PositionsTable, type HoldingRecord };

function PositionsTable(props: {
  className?: string;
  style?: React.CSSProperties;
  loading?: boolean;
  loadingStatePlaceholderRowsCount?: number;
  holdings?: MaybeAsyncIterable<HoldingRecord[]>;
}): ReactElement {
  const {
    className = '',
    style,
    loading = false,
    loadingStatePlaceholderRowsCount = 3,
    holdings = [],
  } = props;

  return (
    <Iterate value={holdings}>
      {({ pendingFirst: pendingFirstHoldings, value: nextHoldings }) => {
        const isLoadingFirstData = pendingFirstHoldings && !nextHoldings?.length;

        return (
          <Table
            className={`cmp-positions-table ${className}`}
            style={style}
            size="small"
            rowKey={h => h.symbol}
            pagination={false}
            dataSource={
              (isLoadingFirstData || loading
                ? range(loadingStatePlaceholderRowsCount).map((_, i) => ({ symbol: `${i}` }))
                : nextHoldings) as HoldingRecord[]
            }
            expandable={{
              expandedRowClassName: () => 'comprising-lots-container',
              rowExpandable: () => true,
              expandedRowRender: ({ comprisingLots, currency }, _idx, _indent, expanded) =>
                expanded &&
                comprisingLots && (
                  <PositionExpandedLots
                    lots={(() => {
                      const [iterFn, deps] = comprisingLots;
                      return [
                        () =>
                          iterateFormatted(iterFn(), lots =>
                            lots.map(lot => ({ ...lot, currency }))
                          ),
                        deps,
                      ];
                    })()}
                  />
                ),
            }}
          >
            <Column<HoldingRecord>
              title={<>Symbol</>}
              className="symbol-cell"
              render={(_, pos) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : (
                  <SymbolNameTag symbol={pos.symbol} />
                )
              }
            />

            <Column<HoldingRecord>
              title={<>Current Price</>}
              className="current-price-cell"
              render={(_, { marketPrice, currency, marketState, timeOfPrice }) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : (
                  <CurrentPriceDisplay
                    marketPrice={marketPrice}
                    currency={currency}
                    marketState={marketState}
                    timeOfPrice={timeOfPrice}
                  />
                )
              }
            />

            <Column<HoldingRecord>
              title={<>Break-even Price</>}
              className="break-even-price-cell"
              render={(_, pos) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : pos.breakEvenPrice === undefined ? (
                  '-'
                ) : (
                  <>{commonDecimalNumCurrencyFormat(pos.breakEvenPrice, pos.currency)}</>
                )
              }
            />

            <Column<HoldingRecord>
              title={<>Position</>}
              className="quantity-cell"
              render={(_, { quantity, marketValue, currency }) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : (
                  <PositionSizeDisplay
                    quantity={quantity}
                    marketValue={marketValue}
                    currency={currency}
                  />
                )
              }
            />

            <Column<HoldingRecord>
              title={<>Unrealized P&L</>}
              className="unrealized-pnl-percent-cell"
              render={(_, pos) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : (
                  <UnrealizedPnlDisplay
                    unrealizedPnlPercent={pos.unrealizedPnl?.percent}
                    unrealizedPnlAmount={pos.unrealizedPnl?.amount}
                    currency={pos.currency}
                  />
                )
              }
            />

            <Column<HoldingRecord>
              title={<>Portfolio portion</>}
              className="portfolio-portion-cell"
              render={(_, pos) =>
                isLoadingFirstData || loading ? (
                  <CellSkeleton />
                ) : (
                  <Typography.Text className="portion">
                    {pos.portfolioValuePortion &&
                      pos.portfolioValuePortion.toLocaleString(undefined, {
                        style: 'percent',
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                  </Typography.Text>
                )
              }
            />
          </Table>
        );
      }}
    </Iterate>
  );
}

const { Column } = Table;

type HoldingRecord = {
  symbol: string;
  currency?: string;
  portfolioValuePortion?: number;
  quantity?: number;
  breakEvenPrice?: number;
  marketValue?: number;
  marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
  marketPrice?: number;
  timeOfPrice?: Date | string | number;
  unrealizedPnl?: {
    amount?: number;
    percent?: number;
  };
  rawPositions?: {
    date: string;
    quantity: number;
    price: number;
    unrealizedPnl?: {
      amount?: number;
      percent?: number;
    };
  }[];
  comprisingLots?: PositionExpandedLotsProps['lots'];
};

const CellSkeleton = memo(() => {
  return <Skeleton active title={false} paragraph={{ rows: 1 }} />;
});

const PositionsTableMemo = memo(PositionsTable);
