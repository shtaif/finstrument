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
  values,
} from 'lodash';
import { pipe, asyncPipe, CustomError } from 'shared-utils';
import {
  sequelize,
  TradeRecordModel,
  UserModel,
  HoldingStatsChangeModel,
  PortfolioStatsChangeModel,
  PositionModel,
  PositionClosingModel,
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

  const { tradeStats, positionChanges, latestHoldingStatsChanges, latestPortfolioStatsChanges } =
    await sequelize.transaction(async t => {
      await sequelize.query(
        `LOCK TABLE ${[
          TradeRecordModel,
          UserModel,
          HoldingStatsChangeModel,
          PortfolioStatsChangeModel,
          PositionModel,
          PositionClosingModel,
        ]
          .map(m => `"${m.tableName}"`)
          .join(', ')} IN SHARE ROW EXCLUSIVE MODE;`,
        { transaction: t }
      );

      const holdingStatsBefore = (
        await retrieveHoldingStats({
          transaction: t,
          filters: { ownerIds: [targetOwnerId] },
        })
      ).map(({ symbol, totalPositionCount }) => ({ symbol, totalPositionCount }));

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

      const [tradesRemoved, positionIdsDeleteCandidates] =
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

              const positionIdsDeleteCandidates = (
                await PositionModel.findAll({
                  transaction: t,
                  attributes: ['id'],
                  where: {
                    openingTradeId: tradeDeleteCandidates
                      .filter(t => t.quantity > 0)
                      .map(t => t.id),
                  },
                })
              ).map(({ id }) => id);

              // console.log({ positionIdsDeleteCandidates });

              await TradeRecordModel.destroy({
                transaction: t,
                where: {
                  ownerId: targetOwnerId,
                  id: tradeDeleteCandidates.map(({ id }) => id),
                },
              });

              return [tradeDeleteCandidates, positionIdsDeleteCandidates];
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

      const symbolPositionCountsBefore = chain(holdingStatsBefore)
        .keyBy(({ symbol }) => symbol)
        .mapValues(({ totalPositionCount }) => totalPositionCount)
        .value();

      const symbolPositionCountsAfter = chain(allResultingTrades)
        .groupBy(({ symbol }) => symbol)
        .mapValues(trades => trades.length)
        .value();

      const symbolsRemoved = keys(symbolPositionCountsBefore)
        .filter(symbol => !symbolPositionCountsAfter[symbol])
        .toSorted();

      const symbolsAddedOrChanged = pipe(
        [
          ...tradesToCreate.map(t => t.symbol),
          ...tradesToModify.map(t => t.symbol),
          ...tradesRemoved.map(t => t.symbol).filter(symbol => symbolPositionCountsAfter[symbol]),
        ],
        v => uniq(v),
        v => v.toSorted()
      );

      const instInfos = await asyncPipe(
        keys({
          ...symbolPositionCountsBefore,
          ...symbolPositionCountsAfter,
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

      const posClosingsBySymbols = pipe(
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
            const posClosings: {
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
              posClosings.push({
                buyTradeId: currBuy.trade.id,
                associatedSellTradeId: currSell.trade.id,
                closedQuantity: closedQuant,
              });
            }

            return posClosings;
          })
      );

      // const buyTradeIdsThatHadChangesToTheirSellTrades = values(posClosingsBySymbols)
      //   .flat()
      //   .filter(
      //     posClosing =>
      //       newlyAddedTrades.some(({ id }) => id === posClosing.associatedSellTradeId) ||
      //       modifiedTrades.some(({ id }) => id === posClosing.associatedSellTradeId)
      //   );

      const changedOrAddedPositionIds = await asyncPipe(
        allResultingTrades
          .filter(({ quantity }) => quantity > 0)
          .map(async openingTrade => {
            const currLotClosings = posClosingsBySymbols[openingTrade.symbol].filter(
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
                await PositionModel.create(
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
              const [, affectedRows] = await PositionModel.update(
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
              const possiblyUpdatedMatchingPosition = affectedRows.at(0);
              return possiblyUpdatedMatchingPosition?.id;
            }
          }),
        v => Promise.all(v),
        compact
      );

      // const positionIdsDeleteCandidates = (
      //   await PositionModel.findAll({
      //     transaction: t,
      //     attributes: ['id'],
      //     where: {
      //       openingTradeId: tradesRemoved.filter(t => t.quantity > 0).map(t => t.id),
      //     },
      //   })
      // ).map(({ id }) => id);

      // const ___AFTER = await PositionModel.findAll({
      //   transaction: t,
      //   attributes: ['id'],
      // });

      // console.log({ ___BEFORE, ___AFTER });

      // TODO: Is the following needed? Since each trade deletion cascades into its referencing position, at this point this shouldn't actually ever have anything left to delete - need to log result to verify
      await PositionModel.destroy({
        transaction: t,
        where: { id: positionIdsDeleteCandidates },
      });

      const openingTradeIdsToPosIdsMap = await asyncPipe(
        PositionModel.findAll({
          transaction: t,
          attributes: ['id', 'openingTradeId'],
        }),
        v => keyBy(v, ({ openingTradeId }) => openingTradeId),
        v => mapValues(v, ({ id }) => id)
      );

      await PositionClosingModel.destroy({ transaction: t, where: {} });
      await PositionClosingModel.bulkCreate(
        Object.values(posClosingsBySymbols)
          .flat()
          .map(({ buyTradeId, associatedSellTradeId, closedQuantity }) => ({
            positionId: openingTradeIdsToPosIdsMap[buyTradeId],
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
        positionChanges: {
          set: changedOrAddedPositionIds,
          remove: positionIdsDeleteCandidates,
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
    positions: {
      set: positionChanges.set,
      remove: positionChanges.remove,
    },
  });

  return {
    tradesAddedCount: tradeStats.addedCount,
    tradesModifiedCount: tradeStats.modifiedCount,
    tradesRemovedCount: tradeStats.removedCount,
  };
}
