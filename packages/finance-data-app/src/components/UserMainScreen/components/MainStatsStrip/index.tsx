import React from 'react';
import { Divider, Skeleton, Typography } from 'antd';
import { Iterate } from 'react-async-iterable';
import { type MaybeAsyncIterable } from 'iterable-operators';
import './style.css';

export { MainStatsStrip };

function MainStatsStrip(props: {
  className?: string;
  style?: React.CSSProperties;
  loading?: boolean;
  data?: MaybeAsyncIterable<{
    currencyShownIn: string;
    marketValue?: number;
    unrealizedPnl?: {
      amount: number;
      fraction: number;
    };
  }>;
}) {
  return (
    <div className={`cmp-main-stats-strip ${props.className ?? ''}`} style={props.style}>
      <div className="part mkt-value-part">
        <div className="part-label-line">
          <Typography.Text type="secondary">Market value</Typography.Text>
        </div>

        <div className="mkt-value-content-line">
          <Iterate value={props.data}>
            {next =>
              next.pendingFirst || props.loading ? (
                <>
                  <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
                </>
              ) : (
                <Typography.Text className="mkt-value-amount-display">
                  {next.value?.marketValue === undefined ? (
                    <>-</>
                  ) : (
                    next.value.marketValue.toLocaleString(locale, {
                      style: 'currency',
                      currency: next.value.currencyShownIn,
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 2,
                    })
                  )}
                </Typography.Text>
              )
            }
          </Iterate>
        </div>
      </div>

      <Divider className="part-divider" type="vertical" />

      <div className="part unrealized-pnl-part">
        <div className="part-label-line">
          <Typography.Text type="secondary">Unrealized P&L</Typography.Text>
        </div>

        <div className="unrealized-pnl-content-line">
          <Iterate value={props.data}>
            {next =>
              next.pendingFirst || props.loading ? (
                <>
                  <Skeleton active title={false} paragraph={{ rows: 1, width: '100%' }} />
                </>
              ) : (
                <>
                  <Typography.Text className="pnl-amount-display">
                    {!next.value?.unrealizedPnl ? (
                      <>-</>
                    ) : (
                      <>
                        <NumSign num={next.value.unrealizedPnl.amount} />
                        {next.value.unrealizedPnl.amount.toLocaleString(locale, {
                          style: 'currency',
                          currency: next.value.currencyShownIn,
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}
                      </>
                    )}
                  </Typography.Text>{' '}
                  <Typography.Text type="secondary">/</Typography.Text>{' '}
                  {!next.value?.unrealizedPnl ? (
                    <Typography.Text>-</Typography.Text>
                  ) : (
                    <>
                      <Typography.Text
                        className={`pnl-percentage-value ${next.value.unrealizedPnl.amount > 0 ? 'has-profit' : next.value.unrealizedPnl.amount < 0 ? 'has-loss' : ''}`}
                      >
                        <NumSign num={next.value.unrealizedPnl.fraction} />
                        {next.value.unrealizedPnl.fraction.toLocaleString(locale, {
                          style: 'percent',
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}
                      </Typography.Text>
                    </>
                  )}
                </>
              )
            }
          </Iterate>
        </div>
      </div>
    </div>
  );
}

function NumSign(props: { num?: number }): React.ReactNode {
  if (props.num === undefined) {
    return;
  }
  return props.num >= 0 ? '+' : '-';
}

const locale = undefined;
