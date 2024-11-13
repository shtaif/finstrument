import React, { memo, type ReactElement } from 'react';
import { range } from 'lodash-es';
import { Table, Skeleton } from 'antd';
import { type MaybeAsyncIterable } from 'iterable-operators';
import { Iterate } from 'react-async-iterable';
import { commonDecimalNumCurrencyFormat } from './utils/commonDecimalNumCurrencyFormat';
import { SymbolNameTag } from './components/SymbolNameTag';
import { QuantityDisplay } from './components/QuantityDisplay';
import { CurrentPriceDisplay } from './components/CurrentPriceDisplay';
import { RevenueDisplay } from './components/RevenueDisplay';
import {
  HoldingExpandedPositions,
  type ExpandedPosition,
  type HoldingExpandedPositionsProps,
} from './components/HoldingExpandedPositions';
import './style.css';
import { commonPercentageFormat } from './utils/commonPercentageFormat.ts';

export { PositionsTableMemo as PositionsTable, type HoldingRecord, type ExpandedPosition };

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
      {({ pendingFirst: pendingFirstHoldings, value: nextHoldings }) => (
        <Table
          className={`cmp-positions-table ${className}`}
          style={style}
          size="small"
          rowKey={h => h.symbol}
          pagination={false}
          dataSource={
            ((loading || pendingFirstHoldings) && !nextHoldings?.length
              ? range(loadingStatePlaceholderRowsCount).map((_, i) => ({ symbol: `${i}` }))
              : nextHoldings) as typeof nextHoldings
          }
          expandable={{
            rowExpandable: () => true,
            expandedRowClassName: () => 'expandable-positions-container',
            expandedRowRender: ({ comprisingPositions }, _idx, _indent, expanded) =>
              expanded &&
              comprisingPositions && <HoldingExpandedPositions positions={comprisingPositions} />,
          }}
        >
          <Column<HoldingRecord>
            title={<>Symbol</>}
            className="symbol-cell"
            render={(_, pos) =>
              loading ? <CellSkeleton /> : <SymbolNameTag symbol={pos.symbol} />
            }
          />

          <Column<HoldingRecord>
            title={<>Current Price</>}
            className="current-price-cell"
            render={(_, { marketPrice, currency, marketState, timeOfPrice }) =>
              loading ? (
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
            title={<>Break Even Price</>}
            className="break-even-price-cell"
            render={(_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : pos.breakEvenPrice === undefined ? (
                '-'
              ) : (
                <>{commonDecimalNumCurrencyFormat(pos.breakEvenPrice, pos.currency)}</>
              )
            }
          />

          <Column<HoldingRecord>
            title={<>Quantity of Shares</>}
            className="quantity-cell"
            render={(_, { quantity, marketValue, currency }) =>
              loading ? (
                <CellSkeleton />
              ) : (
                <QuantityDisplay
                  quantity={quantity}
                  marketValue={marketValue}
                  currency={currency}
                />
              )
            }
          />

          <Column<HoldingRecord>
            title={<>Revenue</>}
            className="unrealized-pnl-percent-cell"
            render={(_, pos) =>
              loading ? (
                <CellSkeleton />
              ) : (
                <RevenueDisplay
                  unrealizedPnlPercent={pos.unrealizedPnl?.percent}
                  unrealizedPnlAmount={pos.unrealizedPnl?.amount}
                  currency={pos.currency}
                />
              )
            }
          />
        </Table>
      )}
    </Iterate>
  );
}

const { Column } = Table;

type HoldingRecord = {
  symbol: string;
  currency?: string;
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
  comprisingPositions?: HoldingExpandedPositionsProps['positions'];
};

const CellSkeleton = memo(() => {
  return <Skeleton active title={false} paragraph={{ rows: 1 }} />;
});

const PositionsTableMemo = memo(PositionsTable);
