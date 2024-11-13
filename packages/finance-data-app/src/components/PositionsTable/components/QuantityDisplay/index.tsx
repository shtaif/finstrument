import React, { memo, type ReactElement } from 'react';
import { Typography } from 'antd';
import { commonDecimalNumCurrencyFormat } from '../../utils/commonDecimalNumCurrencyFormat';
import './style.css';

export { QuantityDisplay };

const QuantityDisplay = memo(
  (props: { quantity?: number; marketValue?: number; currency?: string }): ReactElement => {
    const { quantity, marketValue, currency } = props;

    return (
      <div className="cmp-quantity-display">
        {quantity === undefined && marketValue === undefined ? (
          <> - </>
        ) : (
          <>
            {quantity?.toLocaleString()}
            {marketValue && (
              <Typography.Text className="market-value-part" type="secondary">
                {quantity && <> / </>} {commonDecimalNumCurrencyFormat(marketValue, currency)}
              </Typography.Text>
            )}
          </>
        )}
      </div>
    );
  }
);
