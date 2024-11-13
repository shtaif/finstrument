import React, { Fragment, type ReactNode } from 'react';
import { Tooltip } from 'antd';

export { commonDecimalNumCurrencyFormat };

const commonDecimalNumCurrencyFormat = (amount: number, currencyCode?: string): ReactNode => {
  const parts = new Intl.NumberFormat(undefined, {
    ...(currencyCode
      ? {
          style: 'currency',
          currencyDisplay: 'narrowSymbol',
          currency: currencyCode,
        }
      : undefined),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).formatToParts(amount);

  const partValues: ReactNode[] = parts.map(p => p.value);

  if (currencyCode) {
    const currencyPartIdx = parts.findIndex(p => p.type === 'currency');
    const currencySymbolStr = parts[currencyPartIdx].value;
    partValues.splice(
      currencyPartIdx,
      1,
      <Tooltip title={() => currencyCode}>{currencySymbolStr}</Tooltip>
    );
  }

  return (
    <>
      {partValues.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
};
