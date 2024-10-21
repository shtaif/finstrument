import { afterAll, beforeEach, beforeAll, expect, it } from 'vitest';
import {
  HoldingStatsChangeModel,
  InstrumentInfoModel,
  TradeRecordModel,
  UserModel,
} from '../src/db/index.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { axiosGqlClient } from './utils/axiosGqlClient.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';

const mockUserId1 = mockUuidFromNumber(1);
const mockUserId2 = mockUuidFromNumber(2);

const mockTradeIds = new Array(12).fill(undefined).map((_, i) => mockUuidFromNumber(i));

beforeAll(async () => {
  await UserModel.bulkCreate([
    { id: mockUserId1, alias: mockUserId1 },
    { id: mockUserId2, alias: mockUserId2 },
  ]);
  await InstrumentInfoModel.bulkCreate([
    { symbol: 'ADBE', name: 'Adobe Inc', exchangeMic: 'aaa', currency: 'USD' },
    { symbol: 'AAPL', name: 'Apple Inc', exchangeMic: 'bbb', currency: 'USD' },
  ]);
  mockGqlContext(ctx => ({
    ...ctx,
    getSession: async () => ({ activeUserId: mockUserId1 }),
  }));
});

beforeEach(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await HoldingStatsChangeModel.destroy({ where: {} });
});

afterAll(async () => {
  await Promise.all([
    HoldingStatsChangeModel.destroy({ where: {} }),
    TradeRecordModel.destroy({ where: {} }),
    InstrumentInfoModel.destroy({ where: {} }),
    UserModel.destroy({ where: {} }),
  ]);
  unmockGqlContext();
});

it("Retrieves only holdings owned by the active user's own holdings stats", async () => {
  const trades = await TradeRecordModel.bulkCreate([
    {
      id: mockTradeIds[0],
      ownerId: mockUserId1,
      symbol: 'ADBE',
      performedAt: '2024-01-01T11:11:11.000Z',
      quantity: 1,
      price: 1.1,
    },
    {
      id: mockTradeIds[1],
      ownerId: mockUserId2,
      symbol: 'ADBE',
      performedAt: '2024-01-02T11:11:11.000Z',
      quantity: 1,
      price: 1.1,
    },
    {
      id: mockTradeIds[2],
      ownerId: mockUserId1,
      symbol: 'AAPL',
      performedAt: '2024-01-03T11:11:11.000Z',
      quantity: 1,
      price: 1.1,
    },
    {
      id: mockTradeIds[3],
      ownerId: mockUserId2,
      symbol: 'AAPL',
      performedAt: '2024-01-04T11:11:11.000Z',
      quantity: 1,
      price: 1.1,
    },
  ]);

  await HoldingStatsChangeModel.bulkCreate(
    trades.map(({ id, ownerId, symbol, performedAt }) => ({
      ownerId,
      symbol,
      relatedTradeId: id,
      changedAt: performedAt,
    }))
  );

  const resp = await axiosGqlClient({
    data: {
      query: `{
        holdingStats {
          lastRelatedTradeId
          ownerId
          symbol
        }
      }`,
    },
  });

  expect(resp.status).toBe(200);
  expect(resp.data).toStrictEqual({
    data: {
      holdingStats: [
        { lastRelatedTradeId: mockTradeIds[2], ownerId: mockUserId1, symbol: 'AAPL' },
        { lastRelatedTradeId: mockTradeIds[0], ownerId: mockUserId1, symbol: 'ADBE' },
      ],
    },
  });
});

it('Handles empty holdings as intended...', async () => {
  const trades = await TradeRecordModel.bulkCreate([
    {
      id: mockTradeIds[0],
      ownerId: mockUserId1,
      symbol: 'ADBE',
      performedAt: '2024-01-01T11:11:11.000Z',
      quantity: 0,
      price: 0,
    },
    {
      id: mockTradeIds[1],
      ownerId: mockUserId1,
      symbol: 'AAPL',
      performedAt: '2024-01-02T11:11:11.000Z',
      quantity: 0,
      price: 0,
    },
  ]);

  await HoldingStatsChangeModel.bulkCreate(
    trades.map(({ id, ownerId, symbol, performedAt }) => ({
      ownerId,
      symbol,
      relatedTradeId: id,
      changedAt: performedAt,
      totalLotCount: 0,
      totalQuantity: 0,
      totalPresentInvestedAmount: 0,
      totalRealizedAmount: 100,
      totalRealizedProfitOrLossAmount: 20,
      totalRealizedProfitOrLossRate: 0.25,
    }))
  );

  const resp = await axiosGqlClient({
    data: {
      query: `{
        holdingStats {
          ownerId
          symbol
          lastRelatedTradeId
          lastChangedAt
          totalLotCount
          totalQuantity
          totalPresentInvestedAmount
          totalRealizedAmount
          totalRealizedProfitOrLossAmount
          totalRealizedProfitOrLossRate
          breakEvenPrice
          currentPortfolioPortion
          # relatedPortfolioStats
          # unrealizedPnl
        }
      }`,
    },
  });

  expect(resp.status).toBe(200);
  expect(resp.data).toStrictEqual({
    data: {
      holdingStats: [
        {
          ownerId: mockUserId1,
          symbol: 'AAPL',
          lastRelatedTradeId: mockTradeIds[1],
          lastChangedAt: '2024-01-02T11:11:11.000Z',
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
          totalRealizedAmount: 100,
          totalRealizedProfitOrLossAmount: 20,
          totalRealizedProfitOrLossRate: 0.25,
          breakEvenPrice: null,
          currentPortfolioPortion: null,
        },
        {
          ownerId: mockUserId1,
          symbol: 'ADBE',
          lastRelatedTradeId: mockTradeIds[0],
          lastChangedAt: '2024-01-01T11:11:11.000Z',
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
          totalRealizedAmount: 100,
          totalRealizedProfitOrLossAmount: 20,
          totalRealizedProfitOrLossRate: 0.25,
          breakEvenPrice: null,
          currentPortfolioPortion: null,
        },
      ],
    },
  });
});

it('Testing the testing capabilities 2', async () => {
  const trades = await TradeRecordModel.bulkCreate([
    {
      id: mockTradeIds[0],
      ownerId: mockUserId1,
      symbol: 'ADBE',
      performedAt: '2024-01-01T11:11:11.000Z',
      quantity: 1,
      price: 1.1,
    },
    {
      id: mockTradeIds[1],
      ownerId: mockUserId1,
      symbol: 'ADBE',
      performedAt: '2024-01-02T11:11:11.000Z',
      quantity: 2,
      price: 2.2,
    },
    {
      id: mockTradeIds[2],
      ownerId: mockUserId1,
      symbol: 'ADBE',
      performedAt: '2024-01-03T11:11:11.000Z',
      quantity: 3,
      price: 3.3,
    },
    {
      id: mockTradeIds[3],
      ownerId: mockUserId1,
      symbol: 'AAPL',
      performedAt: '2024-01-01T22:22:22.000Z',
      quantity: 1,
      price: 1.1,
    },
    {
      id: mockTradeIds[4],
      ownerId: mockUserId1,
      symbol: 'AAPL',
      performedAt: '2024-01-02T22:22:22.000Z',
      quantity: 2,
      price: 2.2,
    },
    {
      id: mockTradeIds[5],
      ownerId: mockUserId1,
      symbol: 'AAPL',
      performedAt: '2024-01-03T22:22:22.000Z',
      quantity: 3,
      price: 3.3,
    },
  ]);

  await HoldingStatsChangeModel.bulkCreate(
    trades.map(({ id, ownerId, symbol, performedAt }) => ({
      ownerId,
      symbol,
      relatedTradeId: id,
      changedAt: performedAt,
      totalLotCount: 1,
      totalQuantity: 1,
      totalPresentInvestedAmount: 1.1,
      totalRealizedAmount: 1.1,
      totalRealizedProfitOrLossAmount: 1.1,
      totalRealizedProfitOrLossRate: 1.1,
    }))
  );

  const resp = await axiosGqlClient({
    data: {
      variables: {},
      query: `{
        holdingStats {
          ownerId
          symbol
          lastRelatedTradeId
          lastChangedAt
          totalLotCount
          totalQuantity
          totalPresentInvestedAmount
          totalRealizedAmount
          totalRealizedProfitOrLossAmount
          totalRealizedProfitOrLossRate
          # currentPortfolioPortion
          breakEvenPrice
          # relatedPortfolioStats
          instrument {
            symbol
            name
            currency
            # marketState
            # regularMarketTime
            # regularMarketPrice
          }
          # unrealizedPnl
        }
      }`,
    },
  });

  expect(resp.status).toBe(200);
  expect(resp.data).toStrictEqual({
    data: {
      holdingStats: [
        {
          ownerId: mockUserId1,
          symbol: 'AAPL',
          lastRelatedTradeId: mockTradeIds[5],
          lastChangedAt: '2024-01-03T22:22:22.000Z',
          totalLotCount: 1,
          totalQuantity: 1,
          totalPresentInvestedAmount: 1.1,
          totalRealizedAmount: 1.1,
          totalRealizedProfitOrLossAmount: 1.1,
          totalRealizedProfitOrLossRate: 1.1,
          breakEvenPrice: 1.1,
          // currentPortfolioPortion: undefined,
          instrument: {
            symbol: 'AAPL',
            name: 'Apple Inc',
            currency: 'USD',
          },
        },
        {
          ownerId: mockUserId1,
          symbol: 'ADBE',
          lastRelatedTradeId: mockTradeIds[2],
          lastChangedAt: '2024-01-03T11:11:11.000Z',
          totalLotCount: 1,
          totalQuantity: 1,
          totalPresentInvestedAmount: 1.1,
          totalRealizedAmount: 1.1,
          totalRealizedProfitOrLossAmount: 1.1,
          totalRealizedProfitOrLossRate: 1.1,
          breakEvenPrice: 1.1,
          // currentPortfolioPortion: undefined,
          instrument: {
            symbol: 'ADBE',
            name: 'Adobe Inc',
            currency: 'USD',
          },
        },
      ],
    },
  });
});
