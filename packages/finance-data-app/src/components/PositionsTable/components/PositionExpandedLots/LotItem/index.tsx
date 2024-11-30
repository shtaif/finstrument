import React from 'react';
import { Card, Tooltip } from 'antd';
import ReactTimeago from 'react-timeago';
import { UnrealizedPnlDisplay } from '../../../../common/UnrealizedPnlDisplay/index.tsx';
import './style.css';

export { LotItem, type LotItemProps };

function LotItem(props: LotItemProps): React.ReactNode {
  return (
    <Card className={`cmp-lot-item ${props.className ?? ''}`} style={props.style} size="small">
      <div className="opened-x-ago">
        <Tooltip
          title={() => new Date(props.date!).toLocaleString(undefined, { timeZoneName: 'short' })}
        >
          Opened <ReactTimeago date={props.date} minPeriod={60} />
        </Tooltip>
      </div>

      <div className="quantities">
        {props.remainingQty} of {props.originalQty} remaining
      </div>

      <div className="pnl">
        <UnrealizedPnlDisplay
          className="pnl-display"
          currency={props.currency}
          unrealizedPnlAmount={props.unrealizedPnl?.amount}
          unrealizedPnlFraction={
            props.unrealizedPnl?.percent === undefined
              ? undefined
              : props.unrealizedPnl.percent / 100
          }
        />
      </div>
    </Card>
  );
}

type LotItemProps = {
  date: Date | string | number;
  originalQty: number;
  remainingQty: number;
  currency?: string;
  unrealizedPnl: {
    amount: number;
    percent: number;
  };
  className?: string;
  style?: React.CSSProperties;
};
