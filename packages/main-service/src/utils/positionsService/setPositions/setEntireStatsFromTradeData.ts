import { Op, Transaction } from 'sequelize';
import { groupBy, uniq, uniqBy, values, flatMap, map, findIndex } from 'lodash-es';
import { pipe } from 'shared-utils';
import {
  PositionChangeModel,
  PortfolioCompositionChangeModel,
  CurrencyStatsChangeModel,
  type TradeRecordModelAttributes,
} from '../../../db/index.js';
import { getInstrumentInfos } from '../../getInstrumentInfos/index.js';

export { setEntireStatsFromTradeData };

async function setEntireStatsFromTradeData(params: {
  ownerId: string;
  trades: TradeRecordModelAttributes[];
  transaction?: Transaction;
}): Promise<{
  holdingChangesCreated: PositionChangeModel[];
  portfolioStatsChangesCreated: CurrencyStatsChangeModel[];
  portfolioCompositionChangesCreated: PortfolioCompositionChangeModel[];
}> {
  // TODO: Need to refactor all calculations that follow to be decimal-accurate (with `pnpm add decimal.js-light`)

  if (params.trades.length === 0) {
    return {
      holdingChangesCreated: [],
      portfolioStatsChangesCreated: [],
      portfolioCompositionChangesCreated: [],
    };
  }

  const sortedHoldingStatsData = params.trades
    .toSorted((tradeA, tradeB) => +tradeA.performedAt - +tradeB.performedAt)
    .map(trade => ({
      trade,
      holdingStats: {
        totalLotCount: 0,
        totalQuantity: 0,
        totalPresentInvestedAmount: 0,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
        helperStats: {
          totalOriginalInvestedAmountRealized: 0,
        },
      },
    }));

  pipe(
    sortedHoldingStatsData,
    v => groupBy(v, ({ trade }) => trade.symbol),
    v => {
      for (const items of values(v)) {
        let totalQuantity = 0;
        let totalPresentInvestedAmount = 0;
        let totalLotCount = 0;
        let totalRealizedAmount = 0;
        let totalRealizedProfitOrLossAmount = 0;
        let totalRealizedProfitOrLossRate = 0;

        const helperStats = {
          totalOriginalInvestedAmountRealized: 0,
        };

        let earliestOpenPosIdx = 0;
        let earliestOpenPosRemainingQuant = items[0].trade.quantity;

        for (const item of items) {
          totalQuantity += item.trade.quantity;

          if (item.trade.quantity > 0) {
            totalLotCount++;
            totalPresentInvestedAmount += item.trade.quantity * item.trade.price;
          } else {
            let sellQuantRemaining = -item.trade.quantity;
            totalRealizedAmount += -item.trade.quantity * item.trade.price;

            while (sellQuantRemaining >= earliestOpenPosRemainingQuant) {
              totalLotCount--;

              helperStats.totalOriginalInvestedAmountRealized +=
                earliestOpenPosRemainingQuant * items[earliestOpenPosIdx].trade.price;

              totalPresentInvestedAmount -=
                items[earliestOpenPosIdx].trade.quantity * items[earliestOpenPosIdx].trade.price;

              totalRealizedProfitOrLossAmount +=
                items[earliestOpenPosIdx].trade.quantity *
                (item.trade.price - items[earliestOpenPosIdx].trade.price);

              sellQuantRemaining -= earliestOpenPosRemainingQuant;

              earliestOpenPosIdx = pipe(
                findIndex(items, ({ trade }) => trade.quantity > 0, earliestOpenPosIdx + 1),
                idx => (idx === -1 ? 0 : idx)
              );

              earliestOpenPosRemainingQuant = items[earliestOpenPosIdx].trade.quantity;
            }

            helperStats.totalOriginalInvestedAmountRealized +=
              sellQuantRemaining * items[earliestOpenPosIdx].trade.price;

            totalPresentInvestedAmount -=
              sellQuantRemaining * items[earliestOpenPosIdx].trade.price;

            totalRealizedProfitOrLossAmount +=
              sellQuantRemaining * (item.trade.price - items[earliestOpenPosIdx].trade.price);

            earliestOpenPosRemainingQuant -= sellQuantRemaining;

            totalRealizedProfitOrLossRate =
              totalRealizedAmount / helperStats.totalOriginalInvestedAmountRealized - 1;

            // totalRealizedProfitOrLossAmount +=
            //   (sellQuantRemaining < earliestOpenPosRemainingQuant
            //     ? sellQuantRemaining
            //     : items[earliestOpenPosIdx].trade.quantity) *
            //   (item.trade.price - items[earliestOpenPosIdx].trade.price);
          }

          item.holdingStats = {
            totalLotCount,
            totalQuantity,
            totalPresentInvestedAmount,
            totalRealizedAmount,
            totalRealizedProfitOrLossAmount,
            totalRealizedProfitOrLossRate,
            helperStats: {
              totalOriginalInvestedAmountRealized: helperStats.totalOriginalInvestedAmountRealized,
            },
          };
        }
      }
    }
  );

  const allApearingSymbolsInfos = await pipe(
    params.trades,
    v => uniqBy(v, t => t.symbol),
    v => v.map(t => t.symbol),
    allAppearingSymbols => getInstrumentInfos({ symbols: allAppearingSymbols })
  );

  const allApearingDistinctCurrencies = pipe(
    map(allApearingSymbolsInfos, ({ currency }) => currency),
    uniq
  );

  const sortedPortfolioStatsData = pipe(
    flatMap(allApearingDistinctCurrencies, distinctCurrency => {
      let portfolioTotalInvested = 0;
      let portfolioTotalRealizedAmount = 0;
      let portfolioTotalRealizedProfitOrLossAmount = 0;
      let portfolioTotalRealizedProfitOrLossRate = 0;

      const lastestCurrHoldingStats = pipe(
        sortedHoldingStatsData,
        v => v.map(({ trade }) => trade.symbol),
        v => uniq(v),
        v =>
          Object.fromEntries(
            v.map(symbol => [
              symbol,
              undefined as (typeof sortedHoldingStatsData)[number]['holdingStats'] | undefined,
            ])
          )
      );

      const portfolioCurrencyStatsData = sortedHoldingStatsData
        .filter(h => allApearingSymbolsInfos[h.trade.symbol].currency === distinctCurrency)
        .map(({ trade, holdingStats }) => {
          portfolioTotalInvested +=
            -(lastestCurrHoldingStats[trade.symbol]?.totalPresentInvestedAmount ?? 0) +
            holdingStats.totalPresentInvestedAmount;

          if (trade.quantity < 0) {
            portfolioTotalRealizedAmount +=
              -(lastestCurrHoldingStats[trade.symbol]?.totalRealizedAmount ?? 0) +
              holdingStats.totalRealizedAmount;

            const theseStatsRealizedPnlAmount =
              -(lastestCurrHoldingStats[trade.symbol]?.totalRealizedProfitOrLossAmount ?? 0) +
              holdingStats.totalRealizedProfitOrLossAmount;

            portfolioTotalRealizedProfitOrLossAmount += theseStatsRealizedPnlAmount;

            portfolioTotalRealizedProfitOrLossRate =
              portfolioTotalRealizedAmount /
                holdingStats.helperStats.totalOriginalInvestedAmountRealized -
              1;
          }

          lastestCurrHoldingStats[trade.symbol] = holdingStats;

          const portfolioComposition = pipe(
            Object.entries(lastestCurrHoldingStats),
            v =>
              v.map(([symbol, stats]) => ({
                symbol,
                portion:
                  portfolioTotalInvested === 0
                    ? 0
                    : (stats?.totalPresentInvestedAmount ?? 0) / portfolioTotalInvested,
              })),
            v => v.filter(({ portion }) => portion > 0)
          );

          return {
            trade,
            portfolioStats: {
              forCurrency: distinctCurrency,
              totalPresentInvestedAmount: portfolioTotalInvested,
              totalRealizedAmount: portfolioTotalRealizedAmount,
              totalRealizedProfitOrLossAmount: portfolioTotalRealizedProfitOrLossAmount,
              totalRealizedProfitOrLossRate: portfolioTotalRealizedProfitOrLossRate,
            },
            portfolioComposition,
          };
        });

      return portfolioCurrencyStatsData;
    })
  );

  await PositionChangeModel.destroy({
    transaction: params.transaction,
    where: {
      ownerId: params.ownerId,
      changedAt: { [Op.gte]: sortedPortfolioStatsData[0].trade.performedAt },
    },
  });

  const holdingChangesCreated = await PositionChangeModel.bulkCreate(
    sortedHoldingStatsData.map(({ trade, holdingStats }) => ({
      ownerId: params.ownerId,
      symbol: trade.symbol,
      relatedTradeId: trade.id,
      totalLotCount: holdingStats.totalLotCount,
      totalQuantity: holdingStats.totalQuantity,
      totalPresentInvestedAmount: holdingStats.totalPresentInvestedAmount,
      totalRealizedAmount: holdingStats.totalRealizedAmount,
      totalRealizedProfitOrLossAmount: holdingStats.totalRealizedProfitOrLossAmount,
      totalRealizedProfitOrLossRate: holdingStats.totalRealizedProfitOrLossRate,
      changedAt: trade.performedAt,
    })),
    { transaction: params.transaction }
  );

  await CurrencyStatsChangeModel.destroy({
    transaction: params.transaction,
    where: {
      ownerId: params.ownerId,
      changedAt: { [Op.gte]: sortedHoldingStatsData[0].trade.performedAt },
    },
  });

  const portfolioStatsChangesCreated = await CurrencyStatsChangeModel.bulkCreate(
    sortedPortfolioStatsData.map(({ trade, portfolioStats }) => ({
      ownerId: params.ownerId,
      relatedTradeId: trade.id,
      forCurrency: portfolioStats.forCurrency,
      totalPresentInvestedAmount: portfolioStats.totalPresentInvestedAmount,
      totalRealizedAmount: portfolioStats.totalRealizedAmount,
      totalRealizedProfitOrLossAmount: portfolioStats.totalRealizedProfitOrLossAmount,
      totalRealizedProfitOrLossRate: portfolioStats.totalRealizedProfitOrLossRate,
      changedAt: trade.performedAt,
    })),
    { transaction: params.transaction }
  );

  const portfolioCompositionChangesCreated = await PortfolioCompositionChangeModel.bulkCreate(
    sortedPortfolioStatsData.flatMap(({ trade, portfolioComposition }) =>
      portfolioComposition.map(({ symbol, portion }) => ({
        relatedHoldingChangeId: trade.id,
        symbol,
        portion,
      }))
    ),
    { transaction: params.transaction }
  );

  return {
    holdingChangesCreated,
    portfolioStatsChangesCreated,
    portfolioCompositionChangesCreated,
  };
}
