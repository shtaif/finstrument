import React from 'react';
import { Tag, Typography } from 'antd';
import { pipe } from 'shared-utils';
import { PnlArrowIcon } from '../../../../../PnlArrowIcon/index.tsx';
import './style.css';

export { UnrealizedPnlDisplay };

function UnrealizedPnlDisplay(props: {
  unrealizedPnlAmount?: number;
  unrealizedPnlFraction?: number;
  currency?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const {
    unrealizedPnlAmount = 0,
    unrealizedPnlFraction = 0,
    currency,
    className = '',
    style,
  } = props;

  return (
    <Tag
      className={`cmp-unrealized-pnl-display ${className}`}
      style={style}
      bordered={false}
      color={pipe(unrealizedPnlAmount, amount => (!amount ? '' : amount > 0 ? 'green' : 'red'))}
    >
      <Typography.Text className="pnl-amount-display">
        {unrealizedPnlAmount === undefined || currency === undefined ? (
          <>-</>
        ) : (
          <>
            {unrealizedPnlAmount !== 0 && <PnlArrowIcon isPositive={unrealizedPnlAmount > 0} />}
            {unrealizedPnlAmount.toLocaleString(undefined, {
              style: 'currency',
              currency,
              signDisplay: 'always',
              minimumFractionDigits: 1,
              maximumFractionDigits: 2,
            })}
          </>
        )}
      </Typography.Text>{' '}
      <Typography.Text type="secondary">/</Typography.Text>{' '}
      {unrealizedPnlFraction === undefined ? (
        <Typography.Text>-</Typography.Text>
      ) : (
        <Typography.Text
          className={`pnl-percentage-value ${unrealizedPnlAmount > 0 ? 'has-profit' : unrealizedPnlAmount < 0 ? 'has-loss' : ''}`}
        >
          {unrealizedPnlFraction.toLocaleString(undefined, {
            style: 'percent',
            signDisplay: 'always',
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })}
        </Typography.Text>
      )}
    </Tag>
  );
}
