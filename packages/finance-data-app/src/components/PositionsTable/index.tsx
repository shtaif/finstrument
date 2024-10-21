import React, { memo, type ReactElement, type ReactNode } from 'react';
import { range } from 'lodash-es';
import { Table, Skeleton, Tooltip } from 'antd';
import { type MaybeAsyncIterable } from 'iterable-operators';
import { Iterate } from 'react-async-iterable';
import { LivePriceDisplay } from '../LivePriceDisplay';
import { SymbolNameTag } from './components/SymbolNameTag';
import { SymbolPriceUpdatedAt } from './components/SymbolPriceUpdatedAt';
import { MarketStateIndicatorIcon } from './components/MarketStateIndicatorIcon';
import {
  HoldingExpandedPositions,
  type ExpandedPosition,
  type HoldingExpandedPositionsProps,
} from './components/HoldingExpandedPositions';
import './style.css';

export { PositionsTableMemo as PositionsTable, type HoldingRecord, type ExpandedPosition };

function PositionsTable(props: {
  className?: string;
  style?: React.CSSProperties;
  loading?: boolean;
  loadingStatePlaceholderRowsCount?: number;
  holdings?: MaybeAsyncIterable<HoldingRecord[]>;
}): ReactElement {
  const {
    className,
    style,
    loading = false,
    loadingStatePlaceholderRowsCount = 3,
    holdings = [],
  } = props;

  return (
    <Iterate value={holdings}>
      {next => (
        <Table
          className={`cmp-positions-table ${className ?? ''}`}
          style={style}
          rowKey={h => h.symbol}
          size="small"
          pagination={false}
          expandable={{
            rowExpandable: () => true,
            expandedRowClassName: () => 'expandable-positions-container',
            expandedRowRender: ({ comprisingPositions }, _idx, _indent, expanded) =>
              expanded &&
              comprisingPositions && <HoldingExpandedPositions positions={comprisingPositions} />,
          }}
          dataSource={
            ((loading || next.pendingFirst) && !next.value?.length
              ? range(loadingStatePlaceholderRowsCount).map((_, i) => ({ symbol: `${i}` }))
              : next.value) as typeof next.value
          }
          columns={[
            {
              title: <>Symbol</>,
              className: 'symbol-cell',
              render: (_, pos) =>
                loading ? <CellSkeleton /> : <SymbolNameTag symbol={pos.symbol} />,
            },
            {
              title: <>Current Price</>,
              className: 'current-price-cell',
              render: (_, pos) =>
                loading ? (
                  <CellSkeleton />
                ) : pos.marketPrice === undefined ? (
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
                          {marketPrice => (
                            <>{commonDecimalNumCurrencyFormat(marketPrice, pos.currency)}</>
                          )}
                        </LivePriceDisplay>
                      </div>
                      {pos.timeOfPrice && (
                        <SymbolPriceUpdatedAt className="last-updated-at" at={pos.timeOfPrice} />
                      )}
                    </div>
                  </div>
                ),
            },
            {
              title: <>Quantity of Shares</>,
              className: 'quantity-cell',
              render: (_, { quantity }) =>
                loading ? (
                  <CellSkeleton />
                ) : quantity === undefined ? (
                  '-'
                ) : (
                  <>{quantity.toLocaleString()}</>
                ),
            },
            {
              title: <>Break Even Price</>,
              className: 'break-even-price-cell',
              render: (_, pos) =>
                loading ? (
                  <CellSkeleton />
                ) : pos.breakEvenPrice === undefined ? (
                  '-'
                ) : (
                  <>{commonDecimalNumCurrencyFormat(pos.breakEvenPrice, pos.currency)}</>
                ),
            },
            {
              title: <>Revenue [%]</>,
              className: 'unrealized-pnl-percent-cell',
              render: (_, pos) =>
                loading ? (
                  <CellSkeleton />
                ) : pos.unrealizedPnl?.percent === undefined ? (
                  '-'
                ) : (
                  <LivePriceDisplay price={pos.unrealizedPnl.percent}>
                    {revPercent => commonPercentageFormat(revPercent)}
                  </LivePriceDisplay>
                ),
            },
            {
              title: <>Revenue [abs]</>,
              className: 'unrealized-pnl-amount-cell',
              render: (_, pos) =>
                loading ? (
                  <CellSkeleton />
                ) : pos.unrealizedPnl?.amount === undefined ? (
                  '-'
                ) : (
                  <LivePriceDisplay price={pos.unrealizedPnl.amount}>
                    {revAmount => <>{commonDecimalNumCurrencyFormat(revAmount, pos.currency)}</>}
                  </LivePriceDisplay>
                ),
            },
          ]}
        />
      )}
    </Iterate>
  );
}

type HoldingRecord = {
  symbol: string;
  currency?: string;
  marketPrice?: number;
  timeOfPrice?: Date | string | number;
  marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
  quantity?: number;
  breakEvenPrice?: number;
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

const commonPercentageFormat: (percentage: number) => string = (() => {
  const commonDecimalNumFormatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return percentage => commonDecimalNumFormatter.format(percentage / 100);
})();

const commonDecimalNumCurrencyFormat = (amount: number, currencyCode?: string): ReactNode => {
  const parts = new Intl.NumberFormat(undefined, {
    ...(currencyCode
      ? {
          style: 'currency',
          currencyDisplay: 'narrowSymbol',
          currency: currencyCode,
        }
      : undefined),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(amount);

  const partValues: ReactNode[] = parts.map(p => p.value);

  if (currencyCode) {
    const currencyPartIdx = parts.findIndex(p => p.type === 'currency');
    const currencySymbolStr = parts[currencyPartIdx].value;
    partValues.splice(
      currencyPartIdx,
      1,
      <Tooltip title={() => currencyCode}>{currencySymbolStr}</Tooltip>
    );
  }

  return <>{partValues}</>;
};
