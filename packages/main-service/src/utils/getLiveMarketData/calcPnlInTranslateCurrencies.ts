import { compact } from 'lodash-es';
import { pipe } from 'shared-utils';

export { calcPnlInTranslateCurrencies };

function calcPnlInTranslateCurrencies<TTranslateCurrencies extends string = string>(
  originCurrency: string | null | undefined,
  translateCurrencies: TTranslateCurrencies[],
  pnlAmountInOriginCurrency: number,
  symbolPriceDatas: {
    [symbol: string]: null | { regularMarketPrice: number };
  }
): {
  currency: TTranslateCurrencies;
  exchangeRate: number;
  amount: number;
}[] {
  if (!originCurrency) {
    return [];
  }

  return pipe(
    translateCurrencies.map(translateCurrency => {
      const exchangeRate =
        originCurrency === translateCurrency
          ? 1
          : pipe(
              `${originCurrency}${translateCurrency}=X`,
              $ => symbolPriceDatas[$]?.regularMarketPrice
            );

      return !exchangeRate
        ? undefined
        : {
            currency: translateCurrency,
            exchangeRate,
            amount: pnlAmountInOriginCurrency * exchangeRate,
          };
    }),
    compact
  );
}
