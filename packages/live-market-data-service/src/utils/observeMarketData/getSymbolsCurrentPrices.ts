import { setTimeout } from 'node:timers/promises';
import { pipe, objectFromEntriesTyped } from 'shared-utils';
import yahooFinance from 'yahoo-finance2';
// import { env } from '../env.js';

export { getSymbolsCurrentPrices, type SymbolPrices, type SymbolPriceData };

async function getSymbolsCurrentPrices(params: {
  symbols: string[];
  signal?: AbortSignal;
}): Promise<SymbolPrices> {
  const { symbols, signal: abortSignal } = params;

  // if (env.MOCK_SYMBOLS_MARKET_DATA) {
  //   return await getSymbolsCurrentPricesMock2({ symbols, signal: abortSignal });
  // }

  const results = await getYahooFinanceQuotesAutoRecoveredFromCookieErrors({
    symbols,
    signal: abortSignal,
  });

  return pipe(
    results.map<[string, SymbolPriceData]>(quote => [
      quote.symbol,
      {
        quoteSourceName: quote.quoteSourceName,
        marketState: quote.marketState,
        currency: quote.currency,
        regularMarketTime: quote.regularMarketTime,
        regularMarketPrice: quote.regularMarketPrice,
      },
    ]),
    entries => objectFromEntriesTyped(entries)
  );
}

async function getYahooFinanceQuotesAutoRecoveredFromCookieErrors(
  params: { symbols?: string[]; signal?: AbortSignal } = {}
): Promise<
  Pick<
    QuoteDataFromYahooFinanceLib,
    | 'symbol'
    | 'regularMarketPrice'
    | 'currency'
    | 'quoteSourceName'
    | 'marketState'
    | 'regularMarketTime'
  >[]
> {
  const { symbols, signal } = params;

  if (!symbols?.length) {
    return [];
  }

  let invalidCookieErrorRetriesDid = 0;

  while (true) {
    try {
      const quotes = await yahooFinance.quote(
        symbols,
        {
          fields: [
            'symbol',
            'regularMarketPrice',
            'currency',
            'quoteSourceName',
            'marketState',
            'regularMarketTime',
          ],
        },
        { fetchOptions: { signal } }
      );

      invalidCookieErrorRetriesDid = 0;

      return quotes.map(quote => ({
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice,
        currency: quote.currency,
        quoteSourceName: quote.quoteSourceName,
        marketState: quote.marketState,
        regularMarketTime: quote.regularMarketTime,
      }));
    } catch (err: any) {
      // console.error(err);
      if (err.message === 'Invalid Cookie' && invalidCookieErrorRetriesDid < 2) {
        invalidCookieErrorRetriesDid++;
        await setTimeout(1000);
      } else {
        throw err;
      }
    }
  }
}

type SymbolPrices<TSymbols extends string = string> = {
  [K in TSymbols]: SymbolPriceData;
};

type SymbolPriceData = {
  quoteSourceName: string | undefined;
  currency: string | undefined;
  marketState: QuoteDataFromYahooFinanceLib['marketState'];
  regularMarketTime: Date | undefined;
  regularMarketPrice: number | undefined;
};

type QuoteDataFromYahooFinanceLib = Awaited<ReturnType<typeof yahooFinance.quote>>[number];

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
