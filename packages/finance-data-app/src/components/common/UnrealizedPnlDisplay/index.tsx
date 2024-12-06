import React, { useMemo } from 'react';
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

  const pnlValueFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        ...(currency && { style: 'currency', currency }),
        signDisplay: 'always',
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      }),
    [currency]
  );

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
          <>{pnlValueFormatter.format(unrealizedPnlAmount)}</>
        )}
      </Typography.Text>{' '}
      <Typography.Text className="slash-divider">/</Typography.Text>{' '}
      <Typography.Text
        className={`pnl-percentage-value ${unrealizedPnlAmount > 0 ? 'has-profit' : unrealizedPnlAmount < 0 ? 'has-loss' : ''}`}
      >
        {unrealizedPnlFraction === undefined ? (
          <>-</>
        ) : (
          <>{percentFormatter.format(unrealizedPnlFraction)}</>
        )}
      </Typography.Text>
    </Tag>
  );
}

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: 'percent',
  signDisplay: 'always',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
