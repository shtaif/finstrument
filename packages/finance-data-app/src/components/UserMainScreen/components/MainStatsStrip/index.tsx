import React from 'react';
import { Divider, Skeleton, Typography } from 'antd';
import { Iterate as It } from 'react-async-iterable';
import { type MaybeAsyncIterable } from 'iterable-operators';
import { UnrealizedPnlDisplay } from '../../../common/UnrealizedPnlDisplay/index.tsx';
import './style.css';

export { MainStatsStrip };

function MainStatsStrip(props: {
  className?: string;
  style?: React.CSSProperties;
  loading?: boolean;
  data?: MaybeAsyncIterable<
    | undefined
    | {
        currencyShownIn: string;
        marketValue?: number;
        unrealizedPnl?: {
          amount: number;
          fraction: number;
        };
        loading?: boolean;
      }
  >;
}) {
  return (
    <div className={`cmp-main-stats-strip ${props.className ?? ''}`} style={props.style}>
      <div className="part mkt-value-part">
        <div className="part-label-line">
          <Typography.Text type="secondary">Market value</Typography.Text>
        </div>

        <div className="mkt-value-content-line">
          <It value={props.data}>
            {next =>
              next.pendingFirst || next.value?.loading || props.loading ? (
                <>
                  <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
                </>
              ) : (
                <Typography.Text className="mkt-value-amount-display">
                  {next.value?.marketValue === undefined || !next.value?.currencyShownIn ? (
                    <>-</>
                  ) : (
                    next.value.marketValue.toLocaleString(undefined, {
                      style: 'currency',
                      currency: next.value.currencyShownIn,
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 2,
                    })
                  )}
                </Typography.Text>
              )
            }
          </It>
        </div>
      </div>

      <Divider className="part-divider" type="vertical" />

      <div className="part unrealized-pnl-part">
        <div className="part-label-line">
          <Typography.Text type="secondary">Unrealized P&L</Typography.Text>
        </div>

        <div className="unrealized-pnl-content-line">
          <It value={props.data}>
            {next =>
              next.pendingFirst || props.loading ? (
                <>
                  <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
                </>
              ) : (
                <UnrealizedPnlDisplay
                  className="unrealized-pnl"
                  unrealizedPnlAmount={next.value?.unrealizedPnl?.amount}
                  unrealizedPnlFraction={next.value?.unrealizedPnl?.fraction}
                  currency={next.value?.currencyShownIn}
                />
              )
            }
          </It>
        </div>
      </div>
    </div>
  );
}
