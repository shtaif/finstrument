import React, { ReactElement } from 'react';
import { Typography } from 'antd';
import { commonPercentageFormat } from '../../utils/commonPercentageFormat';
import { commonDecimalNumCurrencyFormat } from '../../utils/commonDecimalNumCurrencyFormat';
import { LivePriceDisplay } from '../../../LivePriceDisplay';
import './style.css';

export { UnrealizedPnlDisplay };

function UnrealizedPnlDisplay(props: {
  className?: string;
  style?: React.CSSProperties;
  unrealizedPnlPercent?: number;
  unrealizedPnlAmount?: number;
  currency?: string;
}): ReactElement {
  return (
    <div className={`cmp-revenue-display ${props.className ?? ''}`} style={props.style}>
      {props.unrealizedPnlPercent !== undefined ? (
        <LivePriceDisplay price={props.unrealizedPnlPercent}>
          {revPercent => commonPercentageFormat(revPercent)}
        </LivePriceDisplay>
      ) : (
        <>-</>
      )}{' '}
      {props.unrealizedPnlAmount !== undefined && (
        <Typography.Text className="pnl-amount-part" type="secondary">
          <> / </>
          <LivePriceDisplay price={props.unrealizedPnlAmount}>
            {revAmount => <>{commonDecimalNumCurrencyFormat(revAmount, props.currency)}</>}
          </LivePriceDisplay>
        </Typography.Text>
      )}
    </div>
  );
}
