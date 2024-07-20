import React, { memo, type ReactElement } from 'react';
import { Typography, Tooltip } from 'antd';
import ReactTimeAgo from 'react-timeago';
import './style.css';

export { SymbolPriceUpdatedAtMemo as SymbolPriceUpdatedAt };

function SymbolPriceUpdatedAt(props: {
  at: Date | string | number;
  className?: string;
}): ReactElement {
  const { at, className } = props;

  return (
    <div className={`symbol-price-updated-at ${className ?? ''}`}>
      <Typography.Text className="updated-x-ago-label" type="secondary">
        Updated{' '}
        <Tooltip title={() => new Date(at).toISOString()}>
          <ReactTimeAgo date={at} minPeriod={5} />
        </Tooltip>
      </Typography.Text>
    </div>
  );
}

const SymbolPriceUpdatedAtMemo = memo(SymbolPriceUpdatedAt);
