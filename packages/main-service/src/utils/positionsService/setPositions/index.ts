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

  const tradeRecordsParsed = parseCsvLedgerFormat({ input: csvData }).map(
    ({ symbol, dateAndTime, quantity, tPrice }) => ({
      symbol,
      quantity,
      price: tPrice,
      performedAt: dateAndTime,
    })
  );

  const targetOwnerId = (await UserModel.findOne({ where: { alias: ownerAlias } }))?.id;

  if (!targetOwnerId) {
    throw new CustomError({
      type: 'OWNER_NOT_FOUND',
      message: `No such user with alias "${ownerAlias}" could be found`,
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

      // const symbolsHeldBefore2 = (
      //   await TradeRecordModel.findAll({
      //     transaction: t,
      //     attributes: ['symbol'],
      //     where: {
      //       ownerId: targetOwnerId,
      //       quantity: { [Op.gt]: 0 },
      //     },
      //     order: [['performedAt', 'ASC']],
      //   })
      // ).map(({ symbol }) => symbol);

      // const currenciesHeldBefore = pipe(
      //   await retrievePortfolioStatsChanges({
      //     transaction: t,
      //     latestPerOwner: true,
      //     filters: { ownerIds: [targetOwnerId] },
      //   }),
      //   portfolios => portfolios.map(({ forCurrency }) => forCurrency),
      //   uniq
      // );

      const [tradesToCreate, tradesToModify] = await asyncPipe(
        findDiffTradesFromCurrStoredForOwner({
          ownerId: targetOwnerId,
          tradeRecords: tradeRecordsParsed,
          transaction: t,
        }),
        tradeDifferences =>
          partition(tradeDifferences, ({ isNewOrModified }) => isNewOrModified === 'NEW')
      );

      const newlyAddedTrades = await asyncPipe(
        tradesToCreate,
        v =>
          v.flatMap(({ symbol, quantity, price, performedAt, existingCount, newCount }) =>
            pipe(
              newCount - existingCount,
              diffCount =>
                new Array<{
                  ownerId: string;
                  symbol: string;
                  quantity: number;
                  price: number;
                  performedAt: Date;
                }>(diffCount),
              arr => arr.fill({ ownerId: targetOwnerId, symbol, quantity, price, performedAt })
            )
          ),
        tradeRecsToAdd => TradeRecordModel.bulkCreate(tradeRecsToAdd, { transaction: t }),
        v => v.map(({ dataValues }) => dataValues),
        v => sortBy(v, ({ performedAt }) => performedAt)
      );

      const modifiedTrades = await asyncPipe(
        tradesToModify,
        v =>
          v.map(async ({ symbol, quantity, price, performedAt }) => {
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
        v => Promise.all(v),
        v => v.map(({ dataValues }) => dataValues),
        v => sortBy(v, ({ performedAt }) => performedAt)
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
                    [Op.and]: tradeRecordsParsed.map(({ performedAt, symbol }) => ({
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

              // console.log({ lotIdsDeleteCandidates });

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
      // const symbolsHeldAfter = (
      //   await TradeRecordModel.findAll({
      //     transaction: t,
      //     attributes: ['symbol'],
      //     group: 'symbol',
      //     where: { ownerId: targetOwnerId },
      //   })
      // ).map(({ symbol }) => symbol);

      // const [symbolsRemoved3, symbolsAdded3] = [
      //   difference(symbolsHeldBefore, symbolsHeldAfter),
      //   difference(symbolsHeldAfter, symbolsHeldBefore),
      // ];

      // const holdingChangedOrModifiedSymbols = pipe(
      //   newlyAddedTrades,
      //   trades => trades.map(t => t.symbol),
      //   uniq
      // );

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
        v => uniq(v),
        v => v.toSorted()
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

      // const currenciesRemoved = difference(currenciesHeldBefore, currenciesHeldAfter);

      const currenciesHavingTradesRemoved = uniq(
        tradesRemoved.map(t => instInfos[t.symbol].currency)
      );

      // const currenciesHavingAllTradesRemoved = difference(
      //   currenciesHavingTradesRemoved,
      //   currenciesHeldAfter
      // );
      const currenciesHavingAllTradesRemoved = difference(
        currenciesHeldBefore,
        currenciesHeldAfter
      );

      // const symbolsHavingTradesRemoved = uniq(tradesRemoved.map(t => t.symbol));

      // const symbolsFromBeforeNowDisappeared = !symbolsHavingTradesRemoved.length
      //   ? []
      //   : (
      //       await sequelize.query<{ symbol: string }>(
      //         `
      //           SELECT
      //             DISTINCT t.symbol AS symbol
      //           FROM
      //             "${TradeRecordModel.tableName}" AS t
      //           WHERE
      //             t.owner_id = :targetOwnerId AND
      //             t.symbol NOT IN (:symbolsHavingTradesRemoved)
      //         `,
      //         {
      //           transaction: t,
      //           type: QueryTypes.SELECT,
      //           replacements: { targetOwnerId, symbolsHavingTradesRemoved },
      //         }
      //       )
      //     ).map(({ symbol }) => symbol);

      // const currenciesFromBeforeNowDisappeared = !currenciesHavingTradesRemoved.length
      //   ? []
      //   : (
      //       await sequelize.query<{ currency: string }>(
      //         `
      //           SELECT
      //             DISTINCT ii.currency AS currency
      //           FROM
      //             "${TradeRecordModel.tableName}" AS t
      //             JOIN "${InstrumentInfoModel.tableName}" AS ii ON t.symbol = ii.symbol
      //           WHERE
      //             t.owner_id = :targetOwnerId AND
      //             ii.currency NOT IN (:currenciesHavingTradesRemoved)
      //         `,
      //         {
      //           transaction: t,
      //           type: QueryTypes.SELECT,
      //           replacements: { targetOwnerId, currenciesHavingTradesRemoved },
      //         }
      //       )
      //     ).map(({ currency }) => currency);

      // const ______ = pipe(
      //   await sequelize.query<{ symbol: string } | { currency: string }>(
      //     `
      //       ${
      //         !symbolsHavingTradesRemoved.length
      //           ? 'SELECT NULL LIMIT 0;'
      //           : `
      //         SELECT
      //           DISTINCT t.symbol AS symbol
      //         FROM
      //           "${TradeRecordModel.tableName}" AS t
      //         WHERE
      //           t.owner_id = :targetOwnerId AND
      //           t.symbol NOT IN (:symbolsHavingTradesRemoved);
      //       `
      //       }
      //       ${
      //         !currenciesHavingTradesRemoved.length
      //           ? 'SELECT NULL LIMIT 0;'
      //           : `
      //         SELECT
      //           DISTINCT ii.currency AS currency
      //         FROM
      //           "${TradeRecordModel.tableName}" AS t
      //           JOIN "${InstrumentInfoModel.tableName}" AS ii ON t.symbol = ii.symbol
      //         WHERE
      //           t.owner_id = :targetOwnerId AND
      //           ii.currency NOT IN (:currenciesHavingTradesRemoved);
      //       `
      //       }
      //     `,
      //     {
      //       transaction: t,
      //       type: QueryTypes.SELECT,
      //       // type: QueryTypes.RAW,
      //       replacements: {
      //         targetOwnerId,
      //         symbolsHavingTradesRemoved,
      //         currenciesHavingTradesRemoved,
      //       },
      //     }
      //   )
      // );

      // console.log(
      //   '______',
      //   pipe(
      //     partition(______, record => 'symbol' in record),
      //     ([symbolsFromBeforeNowDisappeared, currenciesFromBeforeNowDisappeared]) => ({
      //       symbolsFromBeforeNowDisappeared: symbolsFromBeforeNowDisappeared.map(
      //         ({ symbol }) => symbol
      //       ),
      //       currenciesFromBeforeNowDisappeared: currenciesFromBeforeNowDisappeared.map(
      //         ({ currency }) => currency
      //       ),
      //     })
      //   )
      //   // ______[1].map(({ rows }) => rows)
      // );

      // console.log('tradesRemoved', tradesRemoved, uniq(tradesRemoved.map(t => t.symbol)));
      // console.log({ symbolsFromBeforeNowDisappeared, currenciesFromBeforeNowDisappeared });

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
        v => groupBy(v, ({ symbol }) => symbol),
        v =>
          mapValues(v, tradesBySymbol =>
            pipe(
              tradesBySymbol!.map(trade => ({ trade, remaining: Math.abs(trade.quantity) })),
              buysAndSales => partition(buysAndSales, ({ trade }) => trade.quantity > 0)
            )
          ),
        v =>
          mapValues(v, ([buys, sales]) => {
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

      // const lotIdsDeleteCandidates = (
      //   await LotModel.findAll({
      //     transaction: t,
      //     attributes: ['id'],
      //     where: {
      //       openingTradeId: tradesRemoved.filter(t => t.quantity > 0).map(t => t.id),
      //     },
      //   })
      // ).map(({ id }) => id);

      // const ___AFTER = await LotModel.findAll({
      //   transaction: t,
      //   attributes: ['id'],
      // });

      // console.log({ ___BEFORE, ___AFTER });

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
        v => keyBy(v, ({ openingTradeId }) => openingTradeId),
        v => mapValues(v, ({ id }) => id)
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
