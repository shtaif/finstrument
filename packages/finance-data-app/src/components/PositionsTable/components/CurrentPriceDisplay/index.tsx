import React, { memo, type ReactElement } from 'react';
import { commonDecimalNumCurrencyFormat } from '../../utils/commonDecimalNumCurrencyFormat';
import { LivePriceDisplay } from '../../../LivePriceDisplay';
import { SymbolPriceUpdatedAt } from './components/SymbolPriceUpdatedAt';
import { MarketStateIndicatorIcon } from './components/MarketStateIndicatorIcon';
import './style.css';

export { CurrentPriceDisplay };

const CurrentPriceDisplay = memo(
  (props: {
    marketPrice?: number;
    currency?: string;
    marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
    timeOfPrice?: number | string | Date;
  }): ReactElement => {
    return (
      <div className="cmp-current-price-display">
        {props.marketPrice === undefined ? (
          <> - </>
        ) : (
          <div className="price-display">
            {props.marketState && (
              <div>
                <MarketStateIndicatorIcon marketState={props.marketState} />
              </div>
            )}
            <div>
              <div>
                <LivePriceDisplay className="" price={props.marketPrice}>
                  {marketPrice => (
                    <>{commonDecimalNumCurrencyFormat(marketPrice, props.currency)}</>
                  )}
                </LivePriceDisplay>
              </div>
              {props.timeOfPrice && (
                <SymbolPriceUpdatedAt className="last-updated-at" at={props.timeOfPrice} />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
