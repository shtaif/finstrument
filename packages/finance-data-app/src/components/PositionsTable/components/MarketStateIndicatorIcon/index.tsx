import React, { type FC } from 'react';
import { Tooltip, theme } from 'antd';
import './style.css';

export { MarketStateIndicatorIcon };

const MarketStateIndicatorIcon: FC<{
  marketState: string;
  className?: string;
}> = ({ marketState, className = '' }) => {
  const antdThemeToken = theme.useToken();

  return (
    <Tooltip title={() => <>Market state: {marketState}</>}>
      <span
        className={`market-state-indicator-icon ${className}`}
        style={{
          backgroundColor:
            marketState === 'REGULAR'
              ? antdThemeToken.token.colorPrimary
              : antdThemeToken.token.colorTextQuaternary,
        }}
      ></span>
    </Tooltip>
  );
};
