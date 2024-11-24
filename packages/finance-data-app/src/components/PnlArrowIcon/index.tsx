import React, { memo } from 'react';
import './style.css';

export { PnlArrowIcon };

const PnlArrowIcon = memo(function PnlArrowIcon(props: {
  className?: string;
  style?: React.CSSProperties;
  isPositive?: boolean;
}): React.ReactNode {
  const { className = '', style, isPositive = true } = props;

  return (
    <span className={`cmp-pnl-arrow-icon ${className}`} style={style}>
      <svg
        className={`svg-elem ${isPositive ? 'is-positive' : ''}`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20.6 20.6"
      >
        <path d="M18.1,8l-7.3-7.3c-0.3-0.3-0.7-0.4-1.1-0.4c-0.4,0-0.8,0.1-1.1,0.4L1.3,8c-0.6,0.6-0.6,1.5,0,2.1v0 c0.6,0.6,1.5,0.6,2.1,0l4.8-4.8v4.6v1v7.5c0,0.8,0.7,1.5,1.5,1.5c0.8,0,1.5-0.7,1.5-1.5v-13l4.8,4.8c0.6,0.6,1.5,0.6,2.1,0v0 C18.6,9.5,18.6,8.6,18.1,8z " />
      </svg>
    </span>
  );
});
