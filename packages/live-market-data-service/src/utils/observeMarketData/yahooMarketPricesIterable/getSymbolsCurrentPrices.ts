import { setTimeout } from 'node:timers/promises';
import { O } from 'ts-toolbelt';
import yahooFinance from 'yahoo-finance2';
import { type Quote as YahooFinanceQuote } from '../../../../node_modules/yahoo-finance2/dist/esm/src/modules/quote.js'; // Importing this in this manual fashion due to `yahoo-finance2` not making its functions' return types exported, which causes issues with TS on any attempt to reference or infer such types
// import { env } from '../env.js';

export { getSymbolsCurrentPrices, type SymbolPrices, type SymbolPriceData };

async function getSymbolsCurrentPrices<T extends string>(params: {
  symbols: readonly T[];
  signal?: AbortSignal;
}): Promise<SymbolPrices<T>> {
  const { symbols, signal } = params;

  // if (env.MOCK_SYMBOLS_MARKET_DATA) {
  //   return await getSymbolsCurrentPricesMock2({ symbols, signal });
  // }

  const fetchedQuotes = await getYahooFinanceQuotesAutoRecoveredFromCookieErrors({
    symbols,
    signal,
  });

  return (() => {
    const res: SymbolPrices = Object.create(null);
    for (const s of symbols) {
      res[s] = null;
    }
    for (const q of fetchedQuotes) {
      res[q.symbol] = {
        quoteSourceName: q.quoteSourceName,
        marketState: q.marketState,
        currency: q.currency,
        regularMarketTime: q.regularMarketTime,
        regularMarketPrice: q.regularMarketPrice,
        regularMarketChange: q.regularMarketChange,
        regularMarketChangeRate:
          !q.regularMarketPrice || !q.regularMarketChange
            ? undefined
            : q.regularMarketChange / (q.regularMarketPrice - q.regularMarketChange),
      };
    }
    return res;
  })();
}

async function getYahooFinanceQuotesAutoRecoveredFromCookieErrors(
  params: { symbols?: readonly string[]; signal?: AbortSignal } = {}
): Promise<YahooFinanceQuotePickedProps[]> {
  const { symbols, signal } = params;

  if (!symbols?.length) {
    return [];
  }

  const quotes = await (async () => {
    let invalidCookieErrorRetriesMade = 0;

    while (true) {
      try {
        return await yahooFinance.quote(
          symbols as string[],
          { fields: yahooFinanceQuotePickedFields, return: 'array' },
          { validateResult: true, fetchOptions: { signal } }
        );
      } catch (err: any) {
        // console.error(err);

        if (err.message === 'Invalid Cookie' && invalidCookieErrorRetriesMade < 2) {
          invalidCookieErrorRetriesMade++;
          await setTimeout(1000, { signal });
          continue;
        }

        if (err.name === 'FailedYahooValidationError') {
          const quotes = err.result as O.Overwrite<
            YahooFinanceQuotePickedProps,
            { regularMarketTime?: number | undefined } // Patching the quote type here because for some reason, when delivered via `err.result` they have their `regularMarketTime` property as number instead of Date
          >[];
          return quotes.map(q => ({
            ...q,
            regularMarketTime: !q.regularMarketTime
              ? undefined
              : new Date(q.regularMarketTime * 1000),
          }));
        }

        throw err;
      }
    }
  })();

  return quotes.map(q => ({
    symbol: q.symbol,
    quoteSourceName: q.quoteSourceName,
    currency: q.currency,
    marketState: q.marketState,
    regularMarketTime: q.regularMarketTime,
    regularMarketPrice: q.regularMarketPrice,
    regularMarketChange: q.regularMarketChange,
  }));
}

const yahooFinanceQuotePickedFields = [
  'symbol' as const,
  'quoteSourceName' as const,
  'currency' as const,
  'marketState' as const,
  'regularMarketTime' as const,
  'regularMarketPrice' as const,
  'regularMarketChange' as const,
];

type YahooFinanceQuotePickedProps = Pick<
  YahooFinanceQuote,
  (typeof yahooFinanceQuotePickedFields)[number]
>;

type SymbolPrices<TSymbols extends string = string> = {
  [K in TSymbols]: SymbolPriceData;
};

type SymbolPriceData = null | {
  quoteSourceName: string | undefined;
  currency: string | undefined;
  marketState: YahooFinanceQuote['marketState'];
  regularMarketTime: Date | undefined;
  regularMarketPrice: number | undefined;
  regularMarketChange: number | undefined;
  regularMarketChangeRate: number | undefined;
};

// async function getSymbolsCurrentPricesMock(
//   params: { symbols?: string[]; signal?: AbortSignal } = {}
// ): Promise<SymbolPrices> {
//   const { symbols, signal: _signal } = params;

//   if (!symbols?.length) {
//     return {};
//   }

//   return pipe(
//     symbols.map<[string, SymbolPriceData]>((symbol, i) => {
//       const regularMarketPrice = (() => {
//         const mockValue = 251.87;
//         const possibleChangeFactorValues = [-0.05, 0, 0.05];
//         const changeFactor =
//           possibleChangeFactorValues[
//             Math.round(Math.random() * (possibleChangeFactorValues.length - 1))
//           ];
//         return mockValue * (1 + changeFactor);
//       })();
//       return [
//         symbol,
//         {
//           quoteSourceName: 'Mock quote source',
//           currency: i % 2 ? 'GBP' : 'USD',
//           marketState: 'REGULAR',
//           regularMarketTime: new Date('2023-06-16T20:00:00.000Z'),
//           regularMarketPrice,
//         },
//       ];
//     }),
//     entries => objectFromEntriesTyped(entries)
//   );
// }

// async function getSymbolsCurrentPricesMock2(
//   params: { symbols?: string[]; signal?: AbortSignal } = {}
// ): Promise<SymbolPrices> {
//   const { symbols, signal: _signal } = params;

//   if (!symbols?.length) {
//     return {};
//   }

//   return pipe(
//     symbols.map<[string, SymbolPriceData]>((symbol, i) => {
//       return [
//         symbol,
//         {
//           quoteSourceName: 'Mock quote source',
//           currency: 'USD',
//           marketState: 'REGULAR',
//           regularMarketTime: lastMockPrice.time,
//           regularMarketPrice: lastMockPrice.value,
//         },
//       ];
//     }),
//     entries => objectFromEntriesTyped(entries)
//   );
// }

// const lastMockPrice = {
//   time: new Date(),
//   value: 10,
// };

// (async () => {
//   for await (const line of process.stdin) {
//     lastMockPrice.time = new Date();
//     lastMockPrice.value = pipe(line, l => l.toString('utf8'), parseFloat);
//   }
// })();
