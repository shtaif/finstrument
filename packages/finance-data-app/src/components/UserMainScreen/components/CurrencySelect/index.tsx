import React from 'react';
import { Select } from 'antd';
import { once } from 'lodash-es';
import './style.css';

export { CurrencySelect };

function CurrencySelect(props: {
  currency?: string;
  onCurrencyChange?: (newCurrency: string) => void;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}): React.ReactNode {
  return (
    <Select
      className={`cmp-currency-select ${props.className ?? ''}`}
      style={props.style}
      placeholder={<>Portfolio Currency</>}
      value={props.currency}
      loading={props.loading}
      onChange={value => props.onCurrencyChange?.(value)}
      options={getLazyConstructedCurrencyOptions()}
      showSearch
      filterOption={(input, opt) => {
        const lcInput = input.toLowerCase();
        return !!(
          opt?.details.code.toLowerCase().includes(lcInput) ||
          opt?.details.symbol.toLowerCase().includes(lcInput) ||
          opt?.details.name.toLowerCase().includes(lcInput)
        );
      }}
    />
  );
}

const getLazyConstructedCurrencyOptions: () => {
  value: string;
  label: string;
  details: {
    code: string;
    symbol: string;
    name: string;
  };
}[] = once(() => {
  return availableCurrencyCodes.map(code => {
    const symbol = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find(p => p.type === 'currency')!.value;

    const name = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'name',
    })
      .formatToParts(0)
      .find(p => p.type === 'currency')!.value;

    return {
      value: code,
      label: `${code} (${symbol})`,
      details: { code, symbol, name },
    };
  });
});

const availableCurrencyCodes = [
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'CNY',
  'AUD',
  'CAD',
  'CHF',
  'HKD',
  'SGD',
  'SEK',
  'KRW',
  'NOK',
  'NZD',
  'INR',
  'MXN',
  'TWD',
  'ZAR',
  'BRL',
  'DKK',
  'PLN',
  'THB',
  'ILS',
  'IDR',
  'CZK',
  'AED',
  'TRY',
  'HUF',
  'CLP',
  'SAR',
  'PHP',
  'MYR',
  'COP',
  'RUB',
  'RON',
  'PEN',
  'BHD',
  'BGN',
  'ARS',
] as const;
