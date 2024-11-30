import React from 'react';
import { Tag, Typography } from 'antd';
import { pipe } from 'shared-utils';
import { PnlArrowIcon } from '../../PnlArrowIcon/index.tsx';
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
      {unrealizedPnlAmount !== 0 && (
        <PnlArrowIcon
          className="profit-or-loss-indicator-arrow"
          isPositive={unrealizedPnlAmount > 0}
        />
      )}
      <Typography.Text className="pnl-amount-value">
        {unrealizedPnlAmount === undefined || currency === undefined ? (
          <>-</>
        ) : (
          unrealizedPnlAmount.toLocaleString(undefined, {
            style: 'currency',
            currency,
            signDisplay: 'always',
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })
        )}
      </Typography.Text>{' '}
      <Typography.Text
        className={`pnl-percentage-value ${unrealizedPnlAmount > 0 ? 'has-profit' : unrealizedPnlAmount < 0 ? 'has-loss' : ''}`}
      >
        <Typography.Text type="secondary">/</Typography.Text>{' '}
        {unrealizedPnlFraction === undefined ? (
          <>-</>
        ) : (
          unrealizedPnlFraction.toLocaleString(undefined, {
            style: 'percent',
            signDisplay: 'always',
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })
        )}
      </Typography.Text>
    </Tag>
  );
}
