import { values, sumBy, groupBy, maxBy } from 'lodash-es';
import { type DeepPartial } from 'utility-types';
import { objectFromEntriesTyped, pipe } from 'shared-utils';
import { itMap, itShare } from 'iterable-operators';
import { ifNanThenZero } from '../../ifNanThenZero.js';
import { type StatsObjects } from '../../observeStatsObjectChanges/index.js';
import { normalizeFloatImprecisions } from '../../normalizeFloatImprecisions.js';
import { calcHoldingRevenue } from '../calcHoldingRevenue.js';
import { observeStatsWithMarketDataHelper } from '../observeStatsWithMarketDataHelper.js';
import { portfolioStatsCalcMarketStats } from '../portfolioStatsCalcMarketStats.js';
import { calcPnlInTranslateCurrencies } from '../calcPnlInTranslateCurrencies.js';
import { deepObjectPickFields, type DeepObjectFieldsPicked } from '../deepObjectPickFields.js';

export { observeCombinedPortfolioStats, type CombinedPortfolioStats };

function observeCombinedPortfolioStats<
  TSelectedFields extends SelectableFields,
  TOwnerIds extends string[] = string[],
  TCurrency extends string = 'USD',
>(params: {
  portfolioOwnerIds: TOwnerIds;
  currencyToCombineIn?: TCurrency;
  fields: TSelectedFields;
}): AsyncIterable<{
  [I in keyof TOwnerIds]: DeepObjectFieldsPicked<
    CombinedPortfolioStats<TOwnerIds[I], TCurrency>,
    TSelectedFields
  >;
}>;

function observeCombinedPortfolioStats(params: {
  portfolioOwnerIds: string[];
  currencyToCombineIn?: string;
  fields: SelectableFields;
}): AsyncIterable<DeepPartial<CombinedPortfolioStats>[]> {
  const paramsNorm = {
    portfolioOwnerIds: params.portfolioOwnerIds,
    currencyToCombineIn: params.currencyToCombineIn ?? 'USD',
    fields: params.fields,
  };

  const askedForFieldsRequiringSymbolMarketData =
    !!paramsNorm.fields.unrealizedPnlAmount ||
    !!paramsNorm.fields.unrealizedPnlFraction ||
    !!paramsNorm.fields.marketValue ||
    !!paramsNorm.fields.compositionByHoldings?.portionOfPortfolioUnrealizedPnl ||
    !!paramsNorm.fields.compositionByHoldings?.portionOfPortfolioMarketValue;

  return pipe(
    observeStatsWithMarketDataHelper({
      forStatsObjects: paramsNorm.portfolioOwnerIds.map(portfolioOwnerId => ({
        type: 'PORTFOLIO',
        portfolioOwnerId,
      })),
      symbolExtractor: obj => {
        const p = obj as StatsObjects['portfolioStatsChanges'][string];
        if (p.totalPresentInvestedAmount === 0 || p.forCurrency === null) {
          return;
        }
        return [
          ...(p.forCurrency === paramsNorm.currencyToCombineIn
            ? []
            : [`${p.forCurrency}${paramsNorm.currencyToCombineIn}=X`]),

          ...(!askedForFieldsRequiringSymbolMarketData ? [] : p.resolvedHoldings).map(
            h => h.symbol
          ),
        ];
      },
    }),
    itMap(({ currentStats, currentMarketData }) => {
      const portfolioCurrencyStatsByOwnerId = pipe(
        currentStats.portfolioStats,
        $ => values($),
        $ =>
          $.filter(
            (p): p is typeof p & { forCurrency: NonNullable<typeof p.forCurrency> } =>
              p.forCurrency !== null
          ),
        $ => groupBy($, p => p.ownerId)
      );

      const combinedPortfolios = paramsNorm.portfolioOwnerIds.map(ownerId => {
        const portfoliosOfOwner = portfolioCurrencyStatsByOwnerId[ownerId] ?? [];

        const mostRecentStatsChange = !portfoliosOfOwner.length
          ? undefined
          : maxBy(portfoliosOfOwner, p => p.lastChangedAt)!;

        const exchangeRatesForCombinationCurrency = pipe(
          portfoliosOfOwner.map((p): [string, number] => {
            portfoliosOfOwner;
            currentMarketData;
            return [
              p.forCurrency,
              p.forCurrency === paramsNorm.currencyToCombineIn
                ? 1
                : pipe(
                    `${p.forCurrency}${paramsNorm.currencyToCombineIn}=X`,
                    $ => currentMarketData[$].regularMarketPrice
                  ),
            ];
          }),
          $ => objectFromEntriesTyped($)
        );

        const portfolioCostBasis = sumBy(portfoliosOfOwner, p =>
          p.totalPresentInvestedAmount === 0
            ? 0
            : p.totalPresentInvestedAmount * exchangeRatesForCombinationCurrency[p.forCurrency]
        );

        const portfolioRealizedAmount = sumBy(
          portfoliosOfOwner,
          p => p.totalRealizedAmount * exchangeRatesForCombinationCurrency[p.forCurrency]
        );

        const portfolioRealizedPnlAmount = sumBy(
          portfoliosOfOwner,
          p =>
            p.totalRealizedProfitOrLossAmount * exchangeRatesForCombinationCurrency[p.forCurrency]
        );

        const portfolioRealizedPnlRate = ifNanThenZero(
          portfolioRealizedPnlAmount / portfolioRealizedAmount
        );

        let portfolioUnrealizedPnlAmount;
        let portfolioUnrealizedPnlFraction;
        let portfolioMarketValue;

        if (!askedForFieldsRequiringSymbolMarketData) {
          portfolioUnrealizedPnlAmount = undefined;
          portfolioUnrealizedPnlFraction = undefined;
          portfolioMarketValue = undefined;
        } else {
          portfolioUnrealizedPnlAmount = sumBy(portfoliosOfOwner, p => {
            if (p.totalPresentInvestedAmount === 0) {
              return 0;
            }
            const pnlAmountInOrigCurrency = portfolioStatsCalcMarketStats(
              p,
              currentMarketData
            ).pnlAmount;
            const pnlAmountInUnifiedCurrency = calcPnlInTranslateCurrencies(
              p.forCurrency,
              [paramsNorm.currencyToCombineIn],
              pnlAmountInOrigCurrency,
              currentMarketData
            )[0].amount;
            return pnlAmountInUnifiedCurrency;
          });

          portfolioUnrealizedPnlFraction = ifNanThenZero(
            portfolioUnrealizedPnlAmount / portfolioCostBasis
          );

          portfolioMarketValue = portfolioCostBasis + portfolioUnrealizedPnlAmount;
        }

        const compositionByHoldings = portfoliosOfOwner
          .flatMap(p => p.resolvedHoldings)
          .filter(h => h.symbolInfo.currency !== null && h.totalPresentInvestedAmount > 0)
          .map(h => {
            const portionOfPortfolioCostBasis = normalizeFloatImprecisions(
              ifNanThenZero(
                (h.totalPresentInvestedAmount *
                  exchangeRatesForCombinationCurrency[h.symbolInfo.currency!]) /
                  portfolioCostBasis
              )
            );
            const [portionOfPortfolioUnrealizedPnl, portionOfPortfolioMarketValue] =
              !askedForFieldsRequiringSymbolMarketData
                ? [undefined, undefined]
                : (() => {
                    const pnl = pipe(
                      calcHoldingRevenue({
                        holding: h,
                        priceInfo: currentMarketData[h.symbol],
                      }),
                      $ => ({
                        amount: normalizeFloatImprecisions($.amount),
                        percent: normalizeFloatImprecisions($.percent),
                      })
                    );

                    return [
                      pipe(
                        (pnl.amount * exchangeRatesForCombinationCurrency[h.symbolInfo.currency!]) /
                          portfolioUnrealizedPnlAmount!,
                        normalizeFloatImprecisions,
                        ifNanThenZero
                      ),
                      pipe(
                        ((h.totalPresentInvestedAmount + pnl.amount) *
                          exchangeRatesForCombinationCurrency[h.symbolInfo.currency!]) /
                          portfolioMarketValue!,
                        ifNanThenZero,
                        normalizeFloatImprecisions
                      ),
                    ];
                  })();

            return {
              symbol: h.symbol,
              portionOfPortfolioCostBasis,
              portionOfPortfolioUnrealizedPnl,
              portionOfPortfolioMarketValue,
            };
          });

        return {
          ownerId,
          currencyCombinedBy: paramsNorm.currencyToCombineIn,
          mostRecentTradeId: mostRecentStatsChange?.relatedTradeId,
          lastChangedAt: mostRecentStatsChange?.lastChangedAt,
          costBasis: portfolioCostBasis,
          realizedAmount: portfolioRealizedAmount,
          realizedPnlAmount: portfolioRealizedPnlAmount,
          realizedPnlRate: portfolioRealizedPnlRate,
          unrealizedPnlAmount: portfolioUnrealizedPnlAmount,
          unrealizedPnlFraction: portfolioUnrealizedPnlFraction,
          marketValue: portfolioMarketValue,
          compositionByHoldings,
        };
      });

      return combinedPortfolios.map(p => deepObjectPickFields(p, paramsNorm.fields));
    }),
    itShare()
  );
}

type SelectableFields = {
  ownerId?: boolean;
  currencyCombinedBy?: boolean;
  mostRecentTradeId?: boolean;
  lastChangedAt?: boolean;
  costBasis?: boolean;
  realizedAmount?: boolean;
  realizedPnlAmount?: boolean;
  realizedPnlRate?: boolean;
  unrealizedPnlAmount?: boolean;
  unrealizedPnlFraction?: boolean;
  marketValue?: boolean;
  compositionByHoldings?: {
    symbol?: boolean;
    portionOfPortfolioCostBasis?: boolean;
    portionOfPortfolioUnrealizedPnl?: boolean;
    portionOfPortfolioMarketValue?: boolean;
  };
};

type CombinedPortfolioStats<TOwnerId extends string = string, TCurrency extends string = string> = {
  ownerId: TOwnerId;
  currencyCombinedBy: TCurrency;
  mostRecentTradeId: string | undefined;
  lastChangedAt: Date | undefined;
  costBasis: number;
  realizedAmount: number;
  realizedPnlAmount: number;
  realizedPnlRate: number;
  unrealizedPnlAmount: number;
  unrealizedPnlFraction: number;
  marketValue: number;
  compositionByHoldings: {
    symbol: string;
    portionOfPortfolioCostBasis: number;
    portionOfPortfolioUnrealizedPnl: number;
    portionOfPortfolioMarketValue: number;
  }[];
};
