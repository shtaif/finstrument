import React, { memo } from 'react';
import { Tag } from 'antd';
import { parseSymbol } from 'shared-utils';
import './style.css';

export { SymbolNameTag };

const SymbolNameTag = memo(
  (props: {
    symbol: string;
    className?: string;
    style?: React.CSSProperties;
  }): React.ReactElement => {
    const { symbol, className = '', style } = props;

    const parsedSymbol = parseSymbol(symbol);

    return (
      <Tag className={`cmp-symbol-name-tag ${className}`} style={style} color="geekblue">
        <span className="base-instrument-symbol">{parsedSymbol.baseInstrumentSymbol}</span>
        {parsedSymbol.currencyOverride && (
          <span className="currency-override-prefix">:{parsedSymbol.currencyOverride}</span>
        )}
      </Tag>
    );
  }
);
