import { Op } from 'sequelize';
import {
  partition,
  groupBy,
  mapValues,
  keyBy,
  chain,
  sortBy,
  sumBy,
  compact,
  uniq,
  difference,
  keys,
  range,
} from 'lodash-es';
import { pipe, asyncPipe, CustomError } from 'shared-utils';
import {
  sequelize,
  pgSchemaName,
  TradeRecordModel,
  UserModel,
  HoldingStatsChangeModel,
  PortfolioStatsChangeModel,
  LotModel,
  LotClosingModel,
} from '../../../db/index.js';
import { mainRedisClient } from '../../redisClients.js';
import { userHoldingsChangedTopic } from '../../pubsubTopics/userHoldingsChangedTopic.js';
import { parseCsvLedgerFormat } from '../../parseCsvLedgerFormat.js';
import { getInstrumentInfos } from '../../getInstrumentInfos/index.js';
import { retrieveHoldingStats } from '../retrieveHoldingStats/index.js';
// import { retrievePortfolioStatsChanges } from '../retrievePortfolioStatsChanges/index.js';
// import { findDiffTradesFromSaved } from './findDiffTradesFromSaved.js';
import { findDiffTradesFromCurrStoredForOwner } from './findDiffTradesFromCurrStoredForOwner.js';
import { setEntireStatsFromTradeData } from './setEntireStatsFromTradeData.js';

export { setPositions };

async function setPositions(params: {
  ownerAlias: string;
  csvData: string;
  mode?: 'MERGE' | 'REPLACE';
}): Promise<{
  tradesAddedCount: number;
  tradesModifiedCount: number;
  tradesRemovedCount: number;
}> {
  // TODO: Need to refactor all calculations that follow to be decimal-accurate (with `pnpm add decimal.js-light`)

  const { ownerAlias, csvData, mode = 'MERGE' } = params;

  const inputTrades = pipe(
    parseCsvLedgerFormat({ input: csvData }).map(({ symbol, dateAndTime, quantity, tPrice }) => ({
      symbol,
      quantity,
      price: tPrice,
      performedAt: dateAndTime,
    })),
    $ => sortBy($, t => t.performedAt)
  );

  const targetOwnerId = (await UserModel.findOne({ where: { alias: ownerAlias } }))?.id;

  if (!targetOwnerId) {
    throw new CustomError({
      code: 'OWNER_NOT_FOUND',
      message: `No such user with alias "${ownerAlias}" could be found`,
    });
  }

  const duplicates = pipe(
    (() => {
      const sameSymbolTimestampReoccurrences = new Map<string, number>();
      for (const t of inputTrades) {
        const key = `${t.symbol}_${t.performedAt.toISOString()}`;
        const currentCount = sameSymbolTimestampReoccurrences.get(key) ?? 0;
        sameSymbolTimestampReoccurrences.set(key, currentCount + 1);
      }
      return sameSymbolTimestampReoccurrences;
    })(),
    $ => $.entries(),
    $ => $.filter(([, occurrences]) => occurrences > 1),
    $ => $.map(([key]) => pipe(key.split('_'), ([symbol, timestamp]) => ({ symbol, timestamp }))),
    $ => $.toArray()
  );

  if (duplicates.length) {
    throw new CustomError({
      code: 'DUPLICATE_TRADES',
      message: `Importing multiple trades with the same symbol and date combination is not supported; detected duplicate pairs are (${duplicates.length}): ${duplicates.map(d => `[${d.symbol} + ${d.timestamp}]`).join(', ')}`,
      duplicatePairsDetected: duplicates,
    });
  }

  const { tradeStats, lotChanges, latestHoldingStatsChanges, latestPortfolioStatsChanges } =
    await sequelize.transaction(async t => {
      await sequelize.query(
        `LOCK TABLE ${[
          TradeRecordModel,
          UserModel,
          HoldingStatsChangeModel,
          PortfolioStatsChangeModel,
          LotModel,
          LotClosingModel,
        ]
          .map(m => `"${pgSchemaName}"."${m.tableName}"`)
          .join(', ')} IN SHARE ROW EXCLUSIVE MODE;`,
        { transaction: t }
      );

      const holdingStatsBefore = (
        await retrieveHoldingStats({
          transaction: t,
          filters: { ownerIds: [targetOwnerId] },
        })
      ).map(({ symbol, totalLotCount }) => ({ symbol, totalLotCount }));

      const symbolsHeldBefore = holdingStatsBefore.map(({ symbol }) => symbol);

      const [tradesToCreate, tradesToModify] = await asyncPipe(
        findDiffTradesFromCurrStoredForOwner({
          ownerId: targetOwnerId,
          tradeRecords: inputTrades,
          transaction: t,
        }),
        tradeDifferences =>
          partition(tradeDifferences, ({ isNewOrModified }) => isNewOrModified === 'NEW')
      );

      const newlyAddedTrades = await asyncPipe(
        tradesToCreate,
        $ =>
          $.flatMap(({ symbol, quantity, price, performedAt, existingCount, newCount }) => {
            const diffCount = newCount - existingCount;
            return range(diffCount).map(() => ({
              ownerId: targetOwnerId,
              symbol,
              quantity,
              price,
              performedAt,
            }));
          }),
        tradeRecsToAdd => TradeRecordModel.bulkCreate(tradeRecsToAdd, { transaction: t }),
        $ => $.map(({ dataValues }) => dataValues),
        $ => sortBy($, ({ performedAt }) => performedAt)
      );

      const modifiedTrades = await asyncPipe(
        tradesToModify,
        $ =>
          $.map(async ({ symbol, quantity, price, performedAt }) => {
            const [, [affectedRow]] = await TradeRecordModel.update(
              {
                ownerId: targetOwnerId,
                symbol,
                quantity,
                price,
                performedAt,
              },
              {
                transaction: t,
                returning: true,
                where: {
                  ownerId: targetOwnerId,
                  symbol,
                  performedAt,
                },
              }
            );
            return affectedRow;
          }),
        $ => Promise.all($),
        $ => $.map(({ dataValues }) => dataValues),
        $ => sortBy($, ({ performedAt }) => performedAt)
      );

      const [tradesRemoved, lotIdsDeleteCandidates] =
        mode !== 'REPLACE'
          ? [[], []]
          : await (async () => {
              const tradeDeleteCandidates = (
                await TradeRecordModel.findAll({
                  transaction: t,
                  attributes: ['id', 'symbol', 'quantity'],
                  where: {
                    ownerId: targetOwnerId,
                    [Op.and]: inputTrades.map(({ performedAt, symbol }) => ({
                      [Op.not]: { performedAt, symbol },
                    })),
                  },
                })
              ).map(({ id, symbol, quantity }) => ({ id, symbol, quantity }));

              const lotIdsDeleteCandidates = (
                await LotModel.findAll({
                  transaction: t,
                  attributes: ['id'],
                  where: {
                    openingTradeId: tradeDeleteCandidates
                      .filter(t => t.quantity > 0)
                      .map(t => t.id),
                  },
                })
              ).map(({ id }) => id);

              await TradeRecordModel.destroy({
                transaction: t,
                where: {
                  ownerId: targetOwnerId,
                  id: tradeDeleteCandidates.map(({ id }) => id),
                },
              });

              return [tradeDeleteCandidates, lotIdsDeleteCandidates];
            })();

      const allResultingTrades = (
        await TradeRecordModel.findAll({
          transaction: t,
          where: { ownerId: targetOwnerId },
          order: [['performedAt', 'ASC']],
        })
      ).map(t => t.dataValues);

      const symbolsHeldAfter = uniq(allResultingTrades.map(({ symbol }) => symbol));

      const symbolLotCountsBefore = chain(holdingStatsBefore)
        .keyBy(({ symbol }) => symbol)
        .mapValues(({ totalLotCount }) => totalLotCount)
        .value();

      const symbolLotCountsAfter = chain(allResultingTrades)
        .groupBy(({ symbol }) => symbol)
        .mapValues(trades => trades.length)
        .value();

      const symbolsRemoved = keys(symbolLotCountsBefore)
        .filter(symbol => !symbolLotCountsAfter[symbol])
        .toSorted();

      const symbolsAddedOrChanged = pipe(
        [
          ...tradesToCreate.map(t => t.symbol),
          ...tradesToModify.map(t => t.symbol),
          ...tradesRemoved.map(t => t.symbol).filter(symbol => symbolLotCountsAfter[symbol]),
        ],
        $ => uniq($),
        $ => $.toSorted()
      );

      const instInfos = await asyncPipe(
        keys({
          ...symbolLotCountsBefore,
          ...symbolLotCountsAfter,
        }),
        allMentionedSymbolsBeforeAndAfter =>
          getInstrumentInfos({ symbols: allMentionedSymbolsBeforeAndAfter })
      );

      const [currenciesHeldBefore, currenciesHeldAfter] = [
        pipe(symbolsHeldBefore, symbols => symbols.map(s => instInfos[s].currency), uniq),
        pipe(symbolsHeldAfter, symbols => symbols.map(s => instInfos[s].currency), uniq),
      ];

      const currenciesHavingTradesRemoved = uniq(
        tradesRemoved.map(t => instInfos[t.symbol].currency)
      );

      const currenciesHavingAllTradesRemoved = difference(
        currenciesHeldBefore,
        currenciesHeldAfter
      );

      const currenciesHavingSomeTradesRemoved = difference(
        currenciesHavingTradesRemoved,
        currenciesHavingAllTradesRemoved
      );

      const currenciesHavingChangeInTrades = uniq([
        ...currenciesHavingSomeTradesRemoved,
        ...modifiedTrades.map(t => instInfos[t.symbol].currency),
        ...newlyAddedTrades.map(t => instInfos[t.symbol].currency),
      ]);

      const lotClosingsBySymbols = pipe(
        allResultingTrades,
        $ => groupBy($, ({ symbol }) => symbol),
        $ =>
          mapValues($, tradesBySymbol =>
            pipe(
              tradesBySymbol!.map(trade => ({ trade, remaining: Math.abs(trade.quantity) })),
              buysAndSales => partition(buysAndSales, ({ trade }) => trade.quantity > 0)
            )
          ),
        $ =>
          mapValues($, ([buys, sales]) => {
            const lotClosings: {
              buyTradeId: string;
              associatedSellTradeId: string;
              closedQuantity: number;
            }[] = [];

            for (let bIdx = 0, sIdx = 0; buys[bIdx] && sales[sIdx]; ) {
              const [currBuy, currSell] = [buys[bIdx], sales[sIdx]];
              let closedQuant = 0;
              if (currBuy.remaining >= currSell.remaining) {
                currBuy.remaining -= currSell.remaining;
                closedQuant = currSell.remaining;
                currSell.remaining = 0;
                sIdx++;
              } else {
                currSell.remaining -= currBuy.remaining;
                closedQuant = currBuy.remaining;
                currBuy.remaining = 0;
                bIdx++;
              }
              lotClosings.push({
                buyTradeId: currBuy.trade.id,
                associatedSellTradeId: currSell.trade.id,
                closedQuantity: closedQuant,
              });
            }

            return lotClosings;
          })
      );

      // const buyTradeIdsThatHadChangesToTheirSellTrades = values(lotClosingsBySymbols)
      //   .flat()
      //   .filter(
      //     lotClosing =>
      //       newlyAddedTrades.some(({ id }) => id === lotClosing.associatedSellTradeId) ||
      //       modifiedTrades.some(({ id }) => id === lotClosing.associatedSellTradeId)
      //   );

      const changedOrAddedLotIds = await asyncPipe(
        allResultingTrades
          .filter(({ quantity }) => quantity > 0)
          .map(async openingTrade => {
            const currLotClosings = lotClosingsBySymbols[openingTrade.symbol].filter(
              ({ buyTradeId }) => buyTradeId === openingTrade.id
            );

            const remainingQuantity =
              openingTrade.quantity - sumBy(currLotClosings, c => c.closedQuantity);

            const realizedProfitOrLoss = sumBy(currLotClosings, c => {
              const sellTrade = allResultingTrades.find(t => t.id === c.associatedSellTradeId)!;
              const currClosingPnlAmount =
                c.closedQuantity * (sellTrade.price - openingTrade.price);
              return currClosingPnlAmount;
            });

            if (newlyAddedTrades.some(newlyAddedTrade => newlyAddedTrade.id === openingTrade.id)) {
              return (
                await LotModel.create(
                  {
                    ownerId: targetOwnerId,
                    openingTradeId: openingTrade.id,
                    symbol: openingTrade.symbol,
                    remainingQuantity,
                    realizedProfitOrLoss,
                    openedAt: openingTrade.performedAt,
                  },
                  { transaction: t }
                )
              ).id;
            } else {
              const [, affectedRows] = await LotModel.update(
                { remainingQuantity, realizedProfitOrLoss },
                {
                  transaction: t,
                  returning: ['id'],
                  where: {
                    openingTradeId: openingTrade.id,
                    [Op.or]: [
                      { remainingQuantity: { [Op.not]: remainingQuantity } },
                      { realizedProfitOrLoss: { [Op.not]: realizedProfitOrLoss } },
                    ],
                  },
                }
              );
              const possiblyUpdatedMatchingLot = affectedRows.at(0);
              return possiblyUpdatedMatchingLot?.id;
            }
          }),
        v => Promise.all(v),
        compact
      );

      // TODO: Is the following needed? Since each trade deletion cascades into its referencing lot, at this point this shouldn't actually ever have anything left to delete - need to log result to verify
      await LotModel.destroy({
        transaction: t,
        where: { id: lotIdsDeleteCandidates },
      });

      const openingTradeIdsToLotIdsMap = await asyncPipe(
        LotModel.findAll({
          transaction: t,
          attributes: ['id', 'openingTradeId'],
        }),
        $ => keyBy($, ({ openingTradeId }) => openingTradeId),
        $ => mapValues($, ({ id }) => id)
      );

      await LotClosingModel.destroy({ transaction: t, where: {} });
      await LotClosingModel.bulkCreate(
        Object.values(lotClosingsBySymbols)
          .flat()
          .map(({ buyTradeId, associatedSellTradeId, closedQuantity }) => ({
            lotId: openingTradeIdsToLotIdsMap[buyTradeId],
            associatedTradeId: associatedSellTradeId,
            closedQuantity,
          })),
        { transaction: t }
      );

      // TODO: Add inside `setEntireStatsFromTradeData` a check that for any given instrument at any point in time there are no more sales than the held quantity
      const {} = await setEntireStatsFromTradeData({
        ownerId: targetOwnerId,
        trades: allResultingTrades,
        transaction: t,
      });

      return {
        tradeStats: {
          addedCount: newlyAddedTrades.length,
          modifiedCount: tradesToModify.length,
          removedCount: tradesRemoved.length,
        },
        lotChanges: {
          set: changedOrAddedLotIds,
          remove: lotIdsDeleteCandidates,
        },
        latestHoldingStatsChanges: {
          set: symbolsAddedOrChanged,
          remove: symbolsRemoved,
        },
        latestPortfolioStatsChanges: {
          set: currenciesHavingChangeInTrades.map(c => ({ forCurrency: c })),
          remove: currenciesHavingAllTradesRemoved.map(c => ({ forCurrency: c })),
        },
      };
    });

  await userHoldingsChangedTopic.publish(mainRedisClient, {
    ownerId: targetOwnerId,
    portfolioStats: {
      set: latestPortfolioStatsChanges.set,
      remove: latestPortfolioStatsChanges.remove,
    },
    holdingStats: {
      set: latestHoldingStatsChanges.set,
      remove: latestHoldingStatsChanges.remove,
    },
    lots: {
      set: lotChanges.set,
      remove: lotChanges.remove,
    },
  });

  return {
    tradesAddedCount: tradeStats.addedCount,
    tradesModifiedCount: tradeStats.modifiedCount,
    tradesRemovedCount: tradeStats.removedCount,
  };
}
