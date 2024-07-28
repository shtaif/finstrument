import { compact } from 'lodash';
import { pipe } from 'shared-utils';

export { calcPnlInTranslateCurrencies };

function calcPnlInTranslateCurrencies<TTranslateCurrencies extends string = string>(
  originCurrency: string | null | undefined,
  translateCurrencies: TTranslateCurrencies[],
  pnlAmountOriginCurrency: number,
  symbolPriceDatas: {
    [symbol: string]: null | { regularMarketPrice: number };
  }
): {
  currency: TTranslateCurrencies;
  exchangeRate: number;
  amount: number;
}[] {
  return pipe(
    translateCurrencies.map(translateCurrency => {
      if (!originCurrency) {
        return;
      }

      const exchangeSymbol = `${originCurrency}${translateCurrency}=X`;
      const exchangeRate = symbolPriceDatas[exchangeSymbol]?.regularMarketPrice;

      if (!exchangeRate) {
        return;
      }

      return {
        currency: translateCurrency,
        exchangeRate: exchangeRate,
        amount: pnlAmountOriginCurrency * exchangeRate,
      };
    }),
    compact
  );
}
