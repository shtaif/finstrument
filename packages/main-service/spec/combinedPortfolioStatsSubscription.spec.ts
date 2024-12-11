import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { asyncPipe } from 'shared-utils';
import { itCollect, itTake } from 'iterable-operators';
import {
  PositionChangeModel,
  InstrumentInfoModel,
  CurrencyStatsChangeModel,
  TradeRecordModel,
  UserModel,
} from '../src/db/index.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { publishUserHoldingChangedRedisEvent } from './utils/publishUserHoldingChangedRedisEvent.js';
import { mockMarketDataControl } from './utils/mockMarketDataService.js';
import { gqlWsClientIterateDisposable } from './utils/gqlWsClient.js';

const [mockUserId1, mockUserId2] = [mockUuidFromNumber(1), mockUuidFromNumber(2)];
const mockTradeIds = new Array(12).fill(undefined).map((_, i) => mockUuidFromNumber(i));

const reusableTradeDatas = [
  {
    id: mockTradeIds[0],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: new Date('2024-01-01T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[1],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: new Date('2024-01-02T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[2],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: new Date('2024-01-03T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[3],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: new Date('2024-01-04T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[4],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: new Date('2024-01-05T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[5],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: new Date('2024-01-06T11:11:11.000Z'),
    quantity: 2,
    price: 1.1,
  },
];

const reusableHoldingStats = reusableTradeDatas.map(({ id, ownerId, symbol, performedAt }) => ({
  ownerId,
  symbol,
  relatedTradeId: id,
  changedAt: performedAt,
  totalLotCount: 2,
  totalQuantity: 2,
  totalPresentInvestedAmount: 100,
  totalRealizedAmount: 100,
  totalRealizedProfitOrLossAmount: 20,
  totalRealizedProfitOrLossRate: 0.25,
}));

beforeAll(async () => {
  await Promise.all([
    UserModel.bulkCreate([
      { id: mockUserId1, alias: mockUserId1 },
      { id: mockUserId2, alias: mockUserId2 },
    ]),
    InstrumentInfoModel.bulkCreate([
      { symbol: 'ADBE', name: 'Adobe Inc', exchangeMic: 'aaa', currency: 'USD' },
      { symbol: 'AAPL', name: 'Apple Inc', exchangeMic: 'bbb', currency: 'USD' },
      { symbol: 'NVDA', name: 'Nvidia Inc', exchangeMic: 'ccc', currency: 'USD' },
      { symbol: 'VUAG', name: 'Vanguard S&P 500', exchangeMic: 'ddd', currency: 'GBP' },
    ]),
  ]);

  mockGqlContext(ctx => ({
    ...ctx,
    getSession: () => ({ activeUserId: mockUserId1 }),
  }));
});

beforeEach(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await PositionChangeModel.destroy({ where: {} });
  await CurrencyStatsChangeModel.destroy({ where: {} });
});

afterAll(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await PositionChangeModel.destroy({ where: {} });
  await CurrencyStatsChangeModel.destroy({ where: {} });
  await InstrumentInfoModel.destroy({ where: {} });
  await UserModel.destroy({ where: {} });

  unmockGqlContext();
});

describe('◦◦ Subscription.combinedPortfolioStats', () => {
  describe('◦ With only currency data dependent fields', () => {
    it('Subscribing to an empty portfolio that fills up and then re-empties emits appropriate emissions (without pulling any market data)', async () => {
      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
              }
            }
          }
        `,
      });

      await using mockMktData = mockMarketDataControl.start();

      const emissions = [(await subscription.next()).value];

      await (async () => {
        await TradeRecordModel.bulkCreate(
          ['ADBE', 'VUAG'].map((symbol, i) => ({ ...reusableTradeDatas[i], symbol }))
        );
        await PositionChangeModel.bulkCreate(
          ['ADBE', 'VUAG'].map((symbol, i) => ({
            ...reusableHoldingStats[i],
            symbol,
            totalLotCount: 2,
            totalQuantity: 4,
            totalPresentInvestedAmount: 100,
          }))
        );
        await CurrencyStatsChangeModel.bulkCreate(
          ['USD', 'GBP'].map((forCurrency, i) => ({
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[i].relatedTradeId,
            changedAt: reusableHoldingStats[i].changedAt,
            forCurrency,
            totalPresentInvestedAmount: 100,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
          }))
        );
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(c => ({ forCurrency: c })) },
        });
        await mockMktData.next({
          ['GBPUSD=X']: { regularMarketPrice: 1.5 },
        });
      })();

      emissions.push((await subscription.next()).value);

      await (async () => {
        const tradeIds = [reusableTradeDatas[0].id, reusableTradeDatas[1].id];
        await TradeRecordModel.destroy({ where: { id: tradeIds } });
        await PositionChangeModel.destroy({ where: { relatedTradeId: tradeIds } });
        await CurrencyStatsChangeModel.destroy({ where: { relatedTradeId: tradeIds } });
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { remove: ['ADBE', 'VUAG'] },
          portfolioStats: { remove: ['USD', 'GBP'].map(c => ({ forCurrency: c })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: null,
              lastChangedAt: null,
              costBasis: 0,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              compositionByHoldings: [],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
              lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
              costBasis: 250,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              compositionByHoldings: [
                { symbol: 'VUAG', portionOfPortfolioCostBasis: 0.6 },
                { symbol: 'ADBE', portionOfPortfolioCostBasis: 0.4 },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: null,
              lastChangedAt: null,
              costBasis: 0,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              compositionByHoldings: [],
            },
          },
        },
      ]);
    });

    it('Adding buy/sell trades to a portfolio emits appropriate emissions', async () => {
      await using _ = mockMarketDataControl.start({
        ['GBPUSD=X']: { regularMarketPrice: 1.5 },
      });

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[1], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 100,
          },
          {
            ...reusableHoldingStats[1],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 110,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[0].relatedTradeId,
            changedAt: reusableHoldingStats[0].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 100,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[1].relatedTradeId,
            changedAt: reusableHoldingStats[1].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 110,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
              }
            }
          }
        `,
      });

      const emissions = [(await subscription.next()).value];

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[2], symbol: 'ADBE', quantity: -1 },
          { ...reusableTradeDatas[3], symbol: 'VUAG', quantity: -1 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[2],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 40,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ...reusableHoldingStats[3],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 50,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[2].relatedTradeId,
            changedAt: reusableHoldingStats[2].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 40,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[3].relatedTradeId,
            changedAt: reusableHoldingStats[3].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 50,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[4], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[5], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[4],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 270,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ...reusableHoldingStats[5],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 280,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[4].relatedTradeId,
            changedAt: reusableHoldingStats[4].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 270,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[5].relatedTradeId,
            changedAt: reusableHoldingStats[5].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 280,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
              lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
              costBasis: 265,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              compositionByHoldings: [
                { symbol: 'VUAG', portionOfPortfolioCostBasis: 0.622641509434 },
                { symbol: 'ADBE', portionOfPortfolioCostBasis: 0.377358490566 },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[3].relatedTradeId,
              lastChangedAt: reusableHoldingStats[3].changedAt.toISOString(),
              costBasis: 115,
              realizedAmount: 150,
              realizedPnlAmount: 17.5,
              realizedPnlRate: 0.11666666666666667,
              compositionByHoldings: [
                { symbol: 'VUAG', portionOfPortfolioCostBasis: 0.652173913043 },
                { symbol: 'ADBE', portionOfPortfolioCostBasis: 0.347826086957 },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[5].relatedTradeId,
              lastChangedAt: reusableHoldingStats[5].changedAt.toISOString(),
              costBasis: 690,
              realizedAmount: 150,
              realizedPnlAmount: 17.5,
              realizedPnlRate: 0.11666666666666667,
              compositionByHoldings: [
                { symbol: 'VUAG', portionOfPortfolioCostBasis: 0.608695652174 },
                { symbol: 'ADBE', portionOfPortfolioCostBasis: 0.391304347826 },
              ],
            },
          },
        },
      ]);
    });
  });

  describe('◦ With currency + symbol market data dependent fields', () => {
    it('Subscribing to an empty portfolio that fills up and then re-empties emits appropriate emissions', async () => {
      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              marketValue
              unrealizedPnl {
                amount
                fraction
              }
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
                portionOfPortfolioUnrealizedPnl
                portionOfPortfolioMarketValue
              }
            }
          }
        `,
      });

      await using mockMktData = mockMarketDataControl.start();

      const emissions = [(await subscription.next()).value];

      await (async () => {
        await TradeRecordModel.bulkCreate(
          ['ADBE', 'VUAG'].map((symbol, i) => ({ ...reusableTradeDatas[i], symbol }))
        );
        await PositionChangeModel.bulkCreate(
          ['ADBE', 'VUAG'].map((symbol, i) => ({
            ...reusableHoldingStats[i],
            symbol,
            totalLotCount: 2,
            totalQuantity: 4,
            totalPresentInvestedAmount: 100,
          }))
        );
        await CurrencyStatsChangeModel.bulkCreate(
          ['USD', 'GBP'].map((forCurrency, i) => ({
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[i].relatedTradeId,
            changedAt: reusableHoldingStats[i].changedAt,
            forCurrency,
            totalPresentInvestedAmount: 100,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
          }))
        );
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(c => ({ forCurrency: c })) },
        });
        await mockMktData.next({
          ['GBPUSD=X']: { regularMarketPrice: 1.5 },
          ['ADBE']: { regularMarketPrice: 60 },
          ['VUAG']: { regularMarketPrice: 70 },
        });
      })();

      emissions.push((await subscription.next()).value);

      await (async () => {
        const tradeIds = [reusableTradeDatas[0].id, reusableTradeDatas[1].id];
        await TradeRecordModel.destroy({ where: { id: tradeIds } });
        await PositionChangeModel.destroy({ where: { relatedTradeId: tradeIds } });
        await CurrencyStatsChangeModel.destroy({ where: { relatedTradeId: tradeIds } });
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { remove: ['ADBE', 'VUAG'] },
          portfolioStats: { remove: ['USD', 'GBP'].map(c => ({ forCurrency: c })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: null,
              lastChangedAt: null,
              costBasis: 0,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              marketValue: 0,
              unrealizedPnl: { amount: 0, fraction: 0 },
              compositionByHoldings: [],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
              lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
              costBasis: 250,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              marketValue: 660,
              unrealizedPnl: { amount: 410, fraction: 1.64 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.6,
                  portionOfPortfolioUnrealizedPnl: 0.658536585366,
                  portionOfPortfolioMarketValue: 0.636363636364,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.4,
                  portionOfPortfolioUnrealizedPnl: 0.341463414634,
                  portionOfPortfolioMarketValue: 0.363636363636,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: null,
              lastChangedAt: null,
              costBasis: 0,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              marketValue: 0,
              unrealizedPnl: { amount: 0, fraction: 0 },
              compositionByHoldings: [],
            },
          },
        },
      ]);
    });

    it('Adding buy/sell trades to a portfolio emits appropriate emissions', async () => {
      await using _ = mockMarketDataControl.start({
        ['GBPUSD=X']: { regularMarketPrice: 1.5 },
        ['ADBE']: { regularMarketPrice: 50 },
        ['VUAG']: { regularMarketPrice: 60 },
      });

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[1], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 100,
          },
          {
            ...reusableHoldingStats[1],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 110,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[0].relatedTradeId,
            changedAt: reusableHoldingStats[0].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 100,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[1].relatedTradeId,
            changedAt: reusableHoldingStats[1].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 110,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              marketValue
              unrealizedPnl {
                amount
                fraction
              }
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
                portionOfPortfolioUnrealizedPnl
                portionOfPortfolioMarketValue
              }
            }
          }
        `,
      });

      const emissions = [(await subscription.next()).value];

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[2], symbol: 'ADBE', quantity: -1 },
          { ...reusableTradeDatas[3], symbol: 'VUAG', quantity: -1 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[2],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 40,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ...reusableHoldingStats[3],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 50,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[2].relatedTradeId,
            changedAt: reusableHoldingStats[2].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 40,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[3].relatedTradeId,
            changedAt: reusableHoldingStats[3].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 50,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[4], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[5], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[4],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 270,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ...reusableHoldingStats[5],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 1,
            totalPresentInvestedAmount: 280,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[4].relatedTradeId,
            changedAt: reusableHoldingStats[4].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 270,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 10,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[5].relatedTradeId,
            changedAt: reusableHoldingStats[5].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 280,
            totalRealizedAmount: 60,
            totalRealizedProfitOrLossAmount: 5,
          },
        ]);
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['ADBE', 'VUAG'] },
          portfolioStats: { set: ['USD', 'GBP'].map(forCurrency => ({ forCurrency })) },
        });
      })();

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
              lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
              costBasis: 265,
              realizedAmount: 0,
              realizedPnlAmount: 0,
              realizedPnlRate: 0,
              marketValue: 280,
              unrealizedPnl: { amount: 15, fraction: 0.05660377358490566 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.622641509434,
                  portionOfPortfolioUnrealizedPnl: 1,
                  portionOfPortfolioMarketValue: 0.642857142857,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.377358490566,
                  portionOfPortfolioUnrealizedPnl: 0,
                  portionOfPortfolioMarketValue: 0.357142857143,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[3].relatedTradeId,
              lastChangedAt: reusableHoldingStats[3].changedAt.toISOString(),
              costBasis: 115,
              realizedAmount: 150,
              realizedPnlAmount: 17.5,
              realizedPnlRate: 0.11666666666666667,
              marketValue: 140,
              unrealizedPnl: { amount: 25, fraction: 0.21739130434782608 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.652173913043,
                  portionOfPortfolioUnrealizedPnl: 0.6,
                  portionOfPortfolioMarketValue: 0.642857142857,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.347826086957,
                  portionOfPortfolioUnrealizedPnl: 0.4,
                  portionOfPortfolioMarketValue: 0.357142857143,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ownerId: mockUserId1,
              currencyCombinedBy: 'USD',
              mostRecentTradeId: reusableHoldingStats[5].relatedTradeId,
              lastChangedAt: reusableHoldingStats[5].changedAt.toISOString(),
              costBasis: 690,
              realizedAmount: 150,
              realizedPnlAmount: 17.5,
              realizedPnlRate: 0.11666666666666667,
              marketValue: 140,
              unrealizedPnl: { amount: -550, fraction: -0.7971014492753623 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.608695652174,
                  portionOfPortfolioUnrealizedPnl: 0.6,
                  portionOfPortfolioMarketValue: 0.642857142857,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.391304347826,
                  portionOfPortfolioUnrealizedPnl: 0.4,
                  portionOfPortfolioMarketValue: 0.357142857143,
                },
              ],
            },
          },
        },
      ]);
    });

    it('A portfolio receiving market data updates emits appropriate emissions', async () => {
      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[1], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 100,
          },
          {
            ...reusableHoldingStats[1],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 110,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[0].relatedTradeId,
            changedAt: reusableHoldingStats[0].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 100,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[1].relatedTradeId,
            changedAt: reusableHoldingStats[1].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 110,
          },
        ]);
      })();

      await using mockMktData = mockMarketDataControl.start();

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              marketValue
              unrealizedPnl {
                amount
                fraction
              }
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
                portionOfPortfolioUnrealizedPnl
                portionOfPortfolioMarketValue
              }
            }
          }
        `,
      });

      mockMktData.next([
        {
          ['GBPUSD=X']: { regularMarketPrice: 1.5 },
          ['ADBE']: { regularMarketPrice: 50 },
          ['VUAG']: { regularMarketPrice: 60 },
        },
        {
          ['GBPUSD=X']: { regularMarketPrice: 2 },
        },
        {
          ['ADBE']: { regularMarketPrice: 100 },
        },
        {
          ['VUAG']: { regularMarketPrice: 120 },
        },
        {
          ['ADBE']: { regularMarketPrice: 50 },
          ['VUAG']: { regularMarketPrice: 60 },
        },
      ]);

      const emissions = await asyncPipe(subscription, itTake(4), itCollect);

      const commonAssertions = {
        ownerId: mockUserId1,
        currencyCombinedBy: 'USD',
        mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
        lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
        realizedAmount: 0,
        realizedPnlAmount: 0,
        realizedPnlRate: 0,
      } as const;

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 265,
              marketValue: 280,
              unrealizedPnl: { amount: 15, fraction: 0.05660377358490566 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.622641509434,
                  portionOfPortfolioUnrealizedPnl: 1,
                  portionOfPortfolioMarketValue: 0.642857142857,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.377358490566,
                  portionOfPortfolioUnrealizedPnl: 0,
                  portionOfPortfolioMarketValue: 0.357142857143,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 320,
              marketValue: 340,
              unrealizedPnl: { amount: 20, fraction: 0.0625 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.6875,
                  portionOfPortfolioMarketValue: 0.705882352941,
                  portionOfPortfolioUnrealizedPnl: 1,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.3125,
                  portionOfPortfolioMarketValue: 0.294117647059,
                  portionOfPortfolioUnrealizedPnl: 0,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 320,
              marketValue: 440,
              unrealizedPnl: { amount: 120, fraction: 0.375 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.6875,
                  portionOfPortfolioMarketValue: 0.545454545455,
                  portionOfPortfolioUnrealizedPnl: 0.166666666667,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.3125,
                  portionOfPortfolioMarketValue: 0.454545454545,
                  portionOfPortfolioUnrealizedPnl: 0.833333333333,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 320,
              marketValue: 680,
              unrealizedPnl: { amount: 360, fraction: 1.125 },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.6875,
                  portionOfPortfolioMarketValue: 0.705882352941,
                  portionOfPortfolioUnrealizedPnl: 0.722222222222,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.3125,
                  portionOfPortfolioMarketValue: 0.294117647059,
                  portionOfPortfolioUnrealizedPnl: 0.277777777778,
                },
              ],
            },
          },
        },
      ]);
    });

    it('Providing a currency value to the `currencyToCombineIn` arg emits data combined and converted according to it', async () => {
      await (async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 2 },
          { ...reusableTradeDatas[1], symbol: 'VUAG', quantity: 2 },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            symbol: 'ADBE',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 100,
          },
          {
            ...reusableHoldingStats[1],
            symbol: 'VUAG',
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 110,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[0].relatedTradeId,
            changedAt: reusableHoldingStats[0].changedAt,
            forCurrency: 'USD',
            totalPresentInvestedAmount: 100,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: reusableHoldingStats[1].relatedTradeId,
            changedAt: reusableHoldingStats[1].changedAt,
            forCurrency: 'GBP',
            totalPresentInvestedAmount: 110,
          },
        ]);
      })();

      await using mockMktData = mockMarketDataControl.start();

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            combinedPortfolioStats(currencyToCombineIn: "THB") {
              ownerId
              currencyCombinedBy
              mostRecentTradeId
              lastChangedAt
              costBasis
              realizedAmount
              realizedPnlAmount
              realizedPnlRate
              marketValue
              unrealizedPnl {
                amount
                fraction
              }
              compositionByHoldings {
                symbol
                portionOfPortfolioCostBasis
                portionOfPortfolioUnrealizedPnl
                portionOfPortfolioMarketValue
              }
            }
          }
        `,
      });

      mockMktData.next([
        {
          ['USDTHB=X']: { regularMarketPrice: 20 },
          ['GBPTHB=X']: { regularMarketPrice: 30 },
          ['ADBE']: { regularMarketPrice: 110 },
          ['VUAG']: { regularMarketPrice: 120 },
        },
        {
          ['USDTHB=X']: { regularMarketPrice: 30 },
          ['ADBE']: { regularMarketPrice: 120 },
        },
      ]);

      const emissions = await asyncPipe(subscription, itTake(2), itCollect);

      const commonAssertions = {
        ownerId: mockUserId1,
        currencyCombinedBy: 'THB',
        mostRecentTradeId: reusableHoldingStats[1].relatedTradeId,
        lastChangedAt: reusableHoldingStats[1].changedAt.toISOString(),
        realizedAmount: 0,
        realizedPnlAmount: 0,
        realizedPnlRate: 0,
      } as const;

      expect(emissions).toStrictEqual([
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 5300,
              marketValue: 11600,
              unrealizedPnl: {
                amount: 6300,
                fraction: 1.1886792452830188,
              },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.622641509434,
                  portionOfPortfolioUnrealizedPnl: 0.619047619048,
                  portionOfPortfolioMarketValue: 0.620689655172,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.377358490566,
                  portionOfPortfolioUnrealizedPnl: 0.380952380952,
                  portionOfPortfolioMarketValue: 0.379310344828,
                },
              ],
            },
          },
        },
        {
          data: {
            combinedPortfolioStats: {
              ...commonAssertions,
              costBasis: 6300,
              marketValue: 14400,
              unrealizedPnl: {
                amount: 8100,
                fraction: 1.2857142857142858,
              },
              compositionByHoldings: [
                {
                  symbol: 'VUAG',
                  portionOfPortfolioCostBasis: 0.52380952381,
                  portionOfPortfolioMarketValue: 0.5,
                  portionOfPortfolioUnrealizedPnl: 0.481481481481,
                },
                {
                  symbol: 'ADBE',
                  portionOfPortfolioCostBasis: 0.47619047619,
                  portionOfPortfolioMarketValue: 0.5,
                  portionOfPortfolioUnrealizedPnl: 0.518518518519,
                },
              ],
            },
          },
        },
      ]);
    });
  });
});
