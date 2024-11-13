import React, { type FC } from 'react';
import { Tooltip } from 'antd';
import { BlippingIndicator } from '../../../../../common/BlippingIndicator';
import './style.css';

export { MarketStateIndicatorIcon };

const MarketStateIndicatorIcon: FC<{
  marketState: string;
  className?: string;
}> = ({ marketState, className = '' }) => {
  return (
    <Tooltip title={() => <>Market state: {marketState}</>}>
      <BlippingIndicator
        className={`cmp-market-state-indicator-icon indicator-${marketState === 'REGULAR' ? 'active' : 'inactive'} ${className}`}
        blipping={marketState === 'REGULAR'}
      />
    </Tooltip>
  );
};
