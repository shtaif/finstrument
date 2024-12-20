import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { range } from 'lodash-es';
import { asyncPipe, pipe } from 'shared-utils';
import { itCollect, itTake, itTakeFirst } from 'iterable-operators';
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
import { gqlWsClient, gqlWsClientIterateDisposable } from './utils/gqlWsClient.js';

const [mockUserId1, mockUserId2] = [mockUuidFromNumber(1), mockUuidFromNumber(2)];
const mockTradeIds = range(12).map(mockUuidFromNumber);

const reusableTradeDatas = [
  {
    id: mockTradeIds[0],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: '2024-01-01T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[1],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: '2024-01-02T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[2],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: '2024-01-03T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[3],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: '2024-01-04T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[4],
    ownerId: mockUserId1,
    symbol: 'ADBE',
    performedAt: '2024-01-05T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[5],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: '2024-01-06T11:11:11.000Z',
    quantity: 2,
    price: 1.1,
  },
  {
    id: mockTradeIds[6],
    ownerId: mockUserId1,
    symbol: 'AAPL',
    performedAt: '2024-01-06T11:11:11.000Z',
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
      {
        symbol: 'ADBE',
        name: 'Adobe Inc',
        exchangeMic: 'aaa',
        currency: 'USD',
      },
      {
        symbol: 'AAPL',
        name: 'Apple Inc',
        exchangeMic: 'bbb',
        currency: 'USD',
      },
      {
        symbol: 'NVDA',
        name: 'Nvidia Inc',
        exchangeMic: 'ccc',
        currency: 'USD',
      },
      {
        symbol: 'VUAG',
        name: 'Vanguard S&P 500 UCITS ETF USD Acc',
        exchangeMic: 'ddd',
        currency: 'GBP',
      },
    ]),
  ]);

  mockGqlContext(ctx => ({
    ...ctx,
    getSession: async () => ({ activeUserId: mockUserId1 }),
  }));
});

beforeEach(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await PositionChangeModel.destroy({ where: {} });
  await CurrencyStatsChangeModel.destroy({ where: {} });
});

afterAll(async () => {
  await PositionChangeModel.destroy({ where: {} });
  await CurrencyStatsChangeModel.destroy({ where: {} });
  await TradeRecordModel.destroy({ where: {} });
  await InstrumentInfoModel.destroy({ where: {} });
  await UserModel.destroy({ where: {} });
  unmockGqlContext();
});

describe('Subscription.portfolioStats', () => {
  it('Upon subscription immediately emits an initial message with the state of all targeted portfolio stats', async () => {
    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[0], symbol: 'ADBE' }]);
    await PositionChangeModel.bulkCreate([{ ...reusableHoldingStats[0], symbol: 'ADBE' }]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        relatedTradeId: reusableTradeDatas[0].id,
        ownerId: mockUserId1,
        forCurrency: 'USD',
        changedAt: reusableTradeDatas[0].performedAt,
        totalPresentInvestedAmount: 200,
        totalRealizedAmount: 200,
        totalRealizedProfitOrLossAmount: 40,
        totalRealizedProfitOrLossRate: 0.25,
      },
    ]);

    const firstItem = await pipe(
      gqlWsClient.iterate({
        query: /* GraphQL */ `
          subscription {
            portfolioStats {
              data {
                ownerId
                relatedTradeId
                forCurrency
                lastChangedAt
                totalPresentInvestedAmount
                totalRealizedAmount
                totalRealizedProfitOrLossAmount
                totalRealizedProfitOrLossRate
              }
            }
          }
        `,
      }),
      itTakeFirst()
    );

    expect(firstItem).toStrictEqual({
      data: {
        portfolioStats: [
          {
            data: {
              relatedTradeId: reusableTradeDatas[0].id,
              ownerId: mockUserId1,
              forCurrency: 'USD',
              lastChangedAt: reusableTradeDatas[0].performedAt,
              totalPresentInvestedAmount: 200,
              totalRealizedAmount: 200,
              totalRealizedProfitOrLossAmount: 40,
              totalRealizedProfitOrLossRate: 0.25,
            },
          },
        ],
      },
    });
  });

  it('Emits updates for only the most recent portfolio stats record per currency', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'VUAG' },
      { ...reusableTradeDatas[1], symbol: 'ADBE' },
    ]);
    await PositionChangeModel.bulkCreate([
      { ...reusableHoldingStats[0], symbol: 'VUAG' },
      { ...reusableHoldingStats[1], symbol: 'ADBE' },
    ]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        relatedTradeId: reusableTradeDatas[0].id,
        ownerId: mockUserId1,
        forCurrency: 'GBP',
        changedAt: reusableTradeDatas[0].performedAt,
        totalPresentInvestedAmount: 100,
        totalRealizedAmount: 100,
        totalRealizedProfitOrLossAmount: 20,
        totalRealizedProfitOrLossRate: 0.25,
      },
      {
        relatedTradeId: reusableTradeDatas[1].id,
        ownerId: mockUserId1,
        forCurrency: 'USD',
        changedAt: reusableTradeDatas[1].performedAt,
        totalPresentInvestedAmount: 200,
        totalRealizedAmount: 200,
        totalRealizedProfitOrLossAmount: 40,
        totalRealizedProfitOrLossRate: 0.25,
      },
    ]);

    await using subscription = gqlWsClientIterateDisposable({
      query: /* GraphQL */ `
        subscription {
          portfolioStats {
            data {
              forCurrency
              relatedTradeId
              lastChangedAt
            }
          }
        }
      `,
    });

    const emissions: any[] = [];

    emissions.push((await subscription.next()).value);

    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[2], symbol: 'AAPL' }]);
    await PositionChangeModel.bulkCreate([{ ...reusableHoldingStats[2], symbol: 'AAPL' }]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        relatedTradeId: reusableTradeDatas[2].id,
        ownerId: mockUserId1,
        forCurrency: 'USD',
        changedAt: reusableTradeDatas[2].performedAt,
        totalPresentInvestedAmount: 200,
        totalRealizedAmount: 200,
        totalRealizedProfitOrLossAmount: 40,
        totalRealizedProfitOrLossRate: 0.25,
      },
    ]);
    await publishUserHoldingChangedRedisEvent({
      ownerId: mockUserId1,
      portfolioStats: { set: [{ forCurrency: 'USD' }] },
      holdingStats: { set: ['AAPL'] },
    });

    emissions.push((await subscription.next()).value);

    expect(emissions).toStrictEqual([
      {
        data: {
          portfolioStats: [
            {
              data: {
                forCurrency: 'USD',
                relatedTradeId: reusableTradeDatas[1].id,
                lastChangedAt: reusableTradeDatas[1].performedAt,
              },
            },
            {
              data: {
                forCurrency: 'GBP',
                relatedTradeId: reusableTradeDatas[0].id,
                lastChangedAt: reusableTradeDatas[0].performedAt,
              },
            },
          ],
        },
      },
      {
        data: {
          portfolioStats: [
            {
              data: {
                relatedTradeId: reusableTradeDatas[2].id,
                forCurrency: 'USD',
                lastChangedAt: reusableTradeDatas[2].performedAt,
              },
            },
          ],
        },
      },
    ]);
  });

  it('Sends updates for only the portfolio stats owned by the active user', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'VUAG', ownerId: mockUserId1 },
      { ...reusableTradeDatas[1], symbol: 'VUAG', ownerId: mockUserId2 },
    ]);
    await PositionChangeModel.bulkCreate([
      { ...reusableHoldingStats[0], symbol: 'VUAG', ownerId: mockUserId1 },
      { ...reusableHoldingStats[1], symbol: 'VUAG', ownerId: mockUserId2 },
    ]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        relatedTradeId: reusableTradeDatas[0].id,
        ownerId: mockUserId1,
        forCurrency: 'GBP',
        changedAt: reusableTradeDatas[0].performedAt,
        totalPresentInvestedAmount: 100,
        totalRealizedAmount: 100,
        totalRealizedProfitOrLossAmount: 20,
        totalRealizedProfitOrLossRate: 0.25,
      },
      {
        relatedTradeId: reusableTradeDatas[1].id,
        ownerId: mockUserId2,
        forCurrency: 'GBP',
        changedAt: reusableTradeDatas[1].performedAt,
        totalPresentInvestedAmount: 100,
        totalRealizedAmount: 100,
        totalRealizedProfitOrLossAmount: 20,
        totalRealizedProfitOrLossRate: 0.25,
      },
    ]);

    await using subscription = gqlWsClientIterateDisposable({
      query: /* GraphQL */ `
        subscription {
          portfolioStats {
            data {
              ownerId
              relatedTradeId
              forCurrency
            }
          }
        }
      `,
    });

    const emissions: any[] = [];

    emissions.push((await subscription.next()).value);

    await (async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[2], symbol: 'VUAG', ownerId: mockUserId2 },
      ]);
      await PositionChangeModel.bulkCreate([
        { ...reusableHoldingStats[2], symbol: 'VUAG', ownerId: mockUserId2 },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[2].id,
          ownerId: mockUserId2,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[2].performedAt,
          totalPresentInvestedAmount: 100,
          totalRealizedAmount: 100,
          totalRealizedProfitOrLossAmount: 20,
          totalRealizedProfitOrLossRate: 0.25,
        },
      ]);
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId2,
        portfolioStats: { set: [{ forCurrency: 'GBP' }] },
        holdingStats: { set: ['VUAG'] },
      });
    })();

    await (async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[3], symbol: 'AAPL', ownerId: mockUserId2 },
      ]);
      await PositionChangeModel.bulkCreate([
        { ...reusableHoldingStats[3], symbol: 'AAPL', ownerId: mockUserId2 },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[3].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[3].performedAt,
          totalPresentInvestedAmount: 200,
          totalRealizedAmount: 200,
          totalRealizedProfitOrLossAmount: 40,
          totalRealizedProfitOrLossRate: 0.25,
        },
      ]);
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        portfolioStats: { set: [{ forCurrency: 'USD' }] },
        holdingStats: { set: ['AAPL'] },
      });
    })();

    emissions.push((await subscription.next()).value);

    expect(emissions).toStrictEqual([
      {
        data: {
          portfolioStats: [
            {
              data: {
                ownerId: mockUserId1,
                relatedTradeId: reusableTradeDatas[0].id,
                forCurrency: 'GBP',
              },
            },
          ],
        },
      },
      {
        data: {
          portfolioStats: [
            {
              data: {
                ownerId: mockUserId1,
                relatedTradeId: reusableTradeDatas[3].id,
                forCurrency: 'USD',
              },
            },
          ],
        },
      },
    ]);
  });

  it('When targeting only certain fields, only portfolio stats changes that have any of these fields modified will cause updates to be emitted', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'VUAG' },
      { ...reusableTradeDatas[1], symbol: 'ADBE' },
    ]);
    await PositionChangeModel.bulkCreate([
      { ...reusableHoldingStats[0], symbol: 'VUAG' },
      { ...reusableHoldingStats[1], symbol: 'ADBE' },
    ]);
    const initialPStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[0].id,
          ownerId: mockUserId1,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[0].performedAt,
          totalPresentInvestedAmount: 100,
          totalRealizedAmount: 100,
          totalRealizedProfitOrLossAmount: 20,
          totalRealizedProfitOrLossRate: 0.25,
        },
        {
          relatedTradeId: reusableTradeDatas[1].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[1].performedAt,
          totalPresentInvestedAmount: 200,
          totalRealizedAmount: 200,
          totalRealizedProfitOrLossAmount: 40,
          totalRealizedProfitOrLossRate: 0.25,
        },
      ])
    ).map(pStats => pStats.dataValues);

    await using subscription = gqlWsClientIterateDisposable({
      query: /* GraphQL */ `
        subscription {
          portfolioStats {
            data {
              forCurrency
              totalRealizedProfitOrLossAmount
              totalRealizedProfitOrLossRate
            }
          }
        }
      `,
    });

    const emissions: any[] = [];

    emissions.push((await subscription.next()).value);

    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[2], symbol: 'VUAG' }]);
    await PositionChangeModel.bulkCreate([{ ...reusableHoldingStats[2], symbol: 'VUAG' }]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        ...initialPStats[0],
        relatedTradeId: reusableTradeDatas[2].id,
        forCurrency: 'GBP',
        changedAt: reusableTradeDatas[2].performedAt,
        totalRealizedAmount: 101,
      },
    ]);
    await publishUserHoldingChangedRedisEvent({
      ownerId: mockUserId1,
      portfolioStats: { set: [{ forCurrency: 'GBP' }] },
      holdingStats: { set: ['VUAG'] },
    });

    // *** Not expecting an emission here (because the `totalRealizedAmount` field which was modified wasn't targeted)...

    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[3], symbol: 'ADBE' }]);
    await PositionChangeModel.bulkCreate([{ ...reusableHoldingStats[3], symbol: 'ADBE' }]);
    await CurrencyStatsChangeModel.bulkCreate([
      {
        ...initialPStats[1],
        relatedTradeId: reusableTradeDatas[3].id,
        forCurrency: 'USD',
        changedAt: reusableTradeDatas[3].performedAt,
        totalRealizedProfitOrLossAmount: 41,
      },
    ]);
    await publishUserHoldingChangedRedisEvent({
      ownerId: mockUserId1,
      portfolioStats: { set: [{ forCurrency: 'USD' }] },
      holdingStats: { set: ['ADBE'] },
    });

    emissions.push((await subscription.next()).value);

    expect(emissions).toStrictEqual([
      {
        data: {
          portfolioStats: [
            {
              data: {
                forCurrency: 'USD',
                totalRealizedProfitOrLossAmount: 40,
                totalRealizedProfitOrLossRate: 0.25,
              },
            },
            {
              data: {
                forCurrency: 'GBP',
                totalRealizedProfitOrLossAmount: 20,
                totalRealizedProfitOrLossRate: 0.25,
              },
            },
          ],
        },
      },
      {
        data: {
          portfolioStats: [
            {
              data: {
                forCurrency: 'USD',
                totalRealizedProfitOrLossAmount: 41,
                totalRealizedProfitOrLossRate: 0.25,
              },
            },
          ],
        },
      },
    ]);
  });

  describe('With `marketValue` and `unrealizedPnl` fields', () => {
    it("Emits updates correctly in conjunction with changes to market data of the portfolio stats' underlying holdings", async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'VUAG' },
        { ...reusableTradeDatas[1], symbol: 'ADBE' },
        { ...reusableTradeDatas[2], symbol: 'AAPL' },
      ]);
      await PositionChangeModel.bulkCreate([
        { ...reusableHoldingStats[0], symbol: 'VUAG' },
        { ...reusableHoldingStats[1], symbol: 'ADBE' },
        { ...reusableHoldingStats[2], symbol: 'AAPL' },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[0].id,
          ownerId: mockUserId1,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[0].performedAt,
          totalPresentInvestedAmount: 100,
          totalRealizedAmount: 100,
          totalRealizedProfitOrLossAmount: 20,
          totalRealizedProfitOrLossRate: 0.25,
        },
        {
          relatedTradeId: reusableTradeDatas[1].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[1].performedAt,
          totalPresentInvestedAmount: 200,
          totalRealizedAmount: 200,
          totalRealizedProfitOrLossAmount: 40,
          totalRealizedProfitOrLossRate: 0.25,
        },
        {
          relatedTradeId: reusableTradeDatas[2].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[2].performedAt,
          totalPresentInvestedAmount: 185,
          totalRealizedAmount: 220,
          totalRealizedProfitOrLossAmount: 60,
          totalRealizedProfitOrLossRate: 0.25,
        },
      ]);

      await using _ = mockMarketDataControl.start([
        {
          VUAG: { regularMarketPrice: 50 },
          ADBE: { regularMarketPrice: 50 },
          AAPL: { regularMarketPrice: 50 },
        },
        {
          VUAG: { regularMarketPrice: 62 },
        },
        {
          ADBE: { regularMarketPrice: 62 },
        },
        {
          AAPL: { regularMarketPrice: 65 },
        },
      ]);

      const emissions = await asyncPipe(
        gqlWsClient.iterate({
          query: /* GraphQL */ `
            subscription {
              portfolioStats {
                data {
                  forCurrency
                  marketValue
                  unrealizedPnl {
                    amount
                    percent
                  }
                }
              }
            }
          `,
        }),
        itTake(4),
        itCollect
      );

      expect(emissions).toStrictEqual([
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 200,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
              {
                data: {
                  forCurrency: 'GBP',
                  marketValue: 100,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'GBP',
                  marketValue: 124,
                  unrealizedPnl: { amount: 24, percent: 24 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 224,
                  unrealizedPnl: { amount: 24, percent: 12.972972972973 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 254,
                  unrealizedPnl: { amount: 54, percent: 29.189189189189 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to underlying holdings', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'VUAG' },
        { ...reusableTradeDatas[1], symbol: 'ADBE' },
        { ...reusableTradeDatas[2], symbol: 'AAPL' },
      ]);
      await PositionChangeModel.bulkCreate([
        {
          ...reusableHoldingStats[0],
          symbol: 'VUAG',
          totalLotCount: 3,
          totalQuantity: 3,
          totalPresentInvestedAmount: 150,
        },
        {
          ...reusableHoldingStats[1],
          symbol: 'ADBE',
          totalLotCount: 3,
          totalQuantity: 3,
          totalPresentInvestedAmount: 150,
        },
        {
          ...reusableHoldingStats[2],
          symbol: 'AAPL',
          totalLotCount: 3,
          totalQuantity: 3,
          totalPresentInvestedAmount: 150,
        },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[0].id,
          ownerId: mockUserId1,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[0].performedAt,
          totalPresentInvestedAmount: 150,
        },
        {
          relatedTradeId: reusableTradeDatas[1].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[1].performedAt,
          totalPresentInvestedAmount: 150,
        },
        {
          relatedTradeId: reusableTradeDatas[2].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[2].performedAt,
          totalPresentInvestedAmount: 300,
        },
      ]);

      await using _ = mockMarketDataControl.start([
        {
          VUAG: { regularMarketPrice: 50 },
          ADBE: { regularMarketPrice: 50 },
          AAPL: { regularMarketPrice: 50 },
        },
      ]);

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            portfolioStats {
              data {
                forCurrency
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }
        `,
      });

      const emissions: any[] = [];

      emissions.push((await subscription.next()).value);

      for (const applyNextChanges of [
        async () => {
          await TradeRecordModel.bulkCreate([
            { ...reusableTradeDatas[3], symbol: 'VUAG' },
            { ...reusableTradeDatas[4], symbol: 'ADBE' },
          ]);
          await PositionChangeModel.bulkCreate([
            {
              ...reusableHoldingStats[3],
              symbol: 'VUAG',
              totalLotCount: 2,
              totalQuantity: 2,
              totalPresentInvestedAmount: 90,
            },
            {
              ...reusableHoldingStats[4],
              symbol: 'ADBE',
              totalLotCount: 2,
              totalQuantity: 2,
              totalPresentInvestedAmount: 90,
            },
          ]);
          await CurrencyStatsChangeModel.bulkCreate([
            {
              relatedTradeId: reusableTradeDatas[3].id,
              ownerId: mockUserId1,
              forCurrency: 'GBP',
              changedAt: reusableTradeDatas[3].performedAt,
              totalPresentInvestedAmount: 90,
            },
            {
              relatedTradeId: reusableTradeDatas[4].id,
              ownerId: mockUserId1,
              forCurrency: 'USD',
              changedAt: reusableTradeDatas[4].performedAt,
              totalPresentInvestedAmount: 240,
            },
          ]);
          await publishUserHoldingChangedRedisEvent({
            ownerId: mockUserId1,
            portfolioStats: { set: [{ forCurrency: 'GBP' }, { forCurrency: 'USD' }] },
            holdingStats: { set: ['VUAG', 'ADBE'] },
          });
        },

        async () => {
          await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[5], symbol: 'AAPL' }]);
          await PositionChangeModel.bulkCreate([
            {
              ...reusableHoldingStats[5],
              symbol: 'AAPL',
              totalLotCount: 1,
              totalQuantity: 1,
              totalPresentInvestedAmount: 40,
            },
          ]);
          await CurrencyStatsChangeModel.bulkCreate([
            {
              relatedTradeId: reusableTradeDatas[5].id,
              ownerId: mockUserId1,
              forCurrency: 'USD',
              changedAt: reusableTradeDatas[5].performedAt,
              totalPresentInvestedAmount: 190,
            },
          ]);
          await publishUserHoldingChangedRedisEvent({
            ownerId: mockUserId1,
            portfolioStats: { set: [{ forCurrency: 'USD' }] },
            holdingStats: { set: ['AAPL'] },
          });
        },
      ]) {
        await applyNextChanges();
        emissions.push((await subscription.next()).value);
      }

      expect(emissions).toStrictEqual([
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 300,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
              {
                data: {
                  forCurrency: 'GBP',
                  marketValue: 150,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 250,
                  unrealizedPnl: { amount: 10, percent: 4.166666666667 },
                },
              },
              {
                data: {
                  forCurrency: 'GBP',
                  marketValue: 100,
                  unrealizedPnl: { amount: 10, percent: 11.111111111111 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 150,
                  unrealizedPnl: { amount: 20, percent: 10.526315789474 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('When targeting empty portfolio stats, initial zero data is emitted and further changes in market data do not cause any updates to be emitted', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'VUAG' },
        { ...reusableTradeDatas[1], symbol: 'ADBE' },
      ]);
      await PositionChangeModel.bulkCreate([
        {
          ...reusableHoldingStats[0],
          symbol: 'VUAG',
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
        },
        {
          ...reusableHoldingStats[1],
          symbol: 'ADBE',
          totalLotCount: 2,
          totalQuantity: 2,
          totalPresentInvestedAmount: 100,
        },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[0].id,
          ownerId: mockUserId1,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[0].performedAt,
          totalPresentInvestedAmount: 0,
        },
        {
          relatedTradeId: reusableTradeDatas[1].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[1].performedAt,
          totalPresentInvestedAmount: 100,
        },
      ]);

      await using _ = mockMarketDataControl.start([
        {
          VUAG: { regularMarketPrice: 51 },
          ADBE: { regularMarketPrice: 51 },
        },
        {
          VUAG: { regularMarketPrice: 52 },
          ADBE: { regularMarketPrice: 52 },
        },
        {
          VUAG: { regularMarketPrice: 53 },
          ADBE: { regularMarketPrice: 53 },
        },
      ]);

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            portfolioStats {
              data {
                forCurrency
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }
        `,
      });

      const emissions = await pipe(subscription, itTake(3), itCollect);

      expect(emissions).toStrictEqual([
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 102,
                  unrealizedPnl: { amount: 2, percent: 2 },
                },
              },
              {
                data: {
                  forCurrency: 'GBP',
                  marketValue: 0,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 104,
                  unrealizedPnl: { amount: 4, percent: 4 },
                },
              },
            ],
          },
        },
        {
          data: {
            portfolioStats: [
              {
                data: {
                  forCurrency: 'USD',
                  marketValue: 106,
                  unrealizedPnl: { amount: 6, percent: 6 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to position symbols whose market data cannot be found', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'VUAG' },
        { ...reusableTradeDatas[1], symbol: 'ADBE' },
        { ...reusableTradeDatas[2], symbol: 'AAPL' },
      ]);
      await PositionChangeModel.bulkCreate([
        {
          ...reusableHoldingStats[0],
          symbol: 'VUAG',
          totalLotCount: 2,
          totalQuantity: 2,
          totalPresentInvestedAmount: 100,
        },
        {
          ...reusableHoldingStats[1],
          symbol: 'ADBE',
          totalLotCount: 2,
          totalQuantity: 2,
          totalPresentInvestedAmount: 100,
        },
        {
          ...reusableHoldingStats[2],
          symbol: 'AAPL',
          totalLotCount: 2,
          totalQuantity: 2,
          totalPresentInvestedAmount: 100,
        },
      ]);
      await CurrencyStatsChangeModel.bulkCreate([
        {
          relatedTradeId: reusableTradeDatas[0].id,
          ownerId: mockUserId1,
          forCurrency: 'GBP',
          changedAt: reusableTradeDatas[0].performedAt,
          totalPresentInvestedAmount: 0,
        },
        {
          relatedTradeId: reusableTradeDatas[1].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[1].performedAt,
          totalPresentInvestedAmount: 200,
        },
        {
          relatedTradeId: reusableTradeDatas[2].id,
          ownerId: mockUserId1,
          forCurrency: 'USD',
          changedAt: reusableTradeDatas[2].performedAt,
          totalPresentInvestedAmount: 400,
        },
      ]);

      await using _ = mockMarketDataControl.start([
        {
          VUAG: { regularMarketPrice: 100 },
          ADBE: null,
          AAPL: null,
        },
      ]);

      await using subscription = gqlWsClientIterateDisposable({
        query: /* GraphQL */ `
          subscription {
            portfolioStats {
              data {
                forCurrency
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }
        `,
      });

      const firstEmission = await pipe(subscription, itTakeFirst());

      expect(firstEmission).toStrictEqual({
        data: null,
        errors: [
          {
            message: 'Couldn\'t find market data for some symbols: "AAPL", "ADBE"',
            extensions: {
              type: 'SYMBOL_MARKET_DATA_NOT_FOUND',
              details: { symbolsNotFound: ['AAPL', 'ADBE'] },
            },
          },
        ],
      });
    });

    describe('With `unrealized.currencyAdjusted` field', () => {
      it("Emits updates correctly in conjunction with changes to portfolio stats' underlying holdings currency-adjusted market data", async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'VUAG' },
          { ...reusableTradeDatas[1], symbol: 'ADBE' },
        ]);
        await PositionChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            symbol: 'VUAG',
            totalLotCount: 2,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.2,
          },
          {
            ...reusableHoldingStats[1],
            symbol: 'ADBE',
            totalLotCount: 2,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.3,
          },
        ]);
        await CurrencyStatsChangeModel.bulkCreate([
          {
            relatedTradeId: reusableTradeDatas[0].id,
            ownerId: mockUserId1,
            forCurrency: 'GBP',
            changedAt: reusableTradeDatas[0].performedAt,
            totalPresentInvestedAmount: 2.2,
          },
          {
            relatedTradeId: reusableTradeDatas[1].id,
            ownerId: mockUserId1,
            forCurrency: 'USD',
            changedAt: reusableTradeDatas[1].performedAt,
            totalPresentInvestedAmount: 2.3,
          },
        ]);

        await using _ = mockMarketDataControl.start([
          {
            ['VUAG']: { regularMarketPrice: 1.5 },
            ['ADBE']: { regularMarketPrice: 1.5 },
            ['GBPEUR=X']: { regularMarketPrice: 2 },
            ['USDEUR=X']: { regularMarketPrice: 3 },
          },
          {
            ['VUAG']: { regularMarketPrice: 1.6 },
            ['GBPEUR=X']: { regularMarketPrice: 2 },
            ['USDEUR=X']: { regularMarketPrice: 3 },
          },
          {
            ['ADBE']: { regularMarketPrice: 1.6 },
            ['GBPEUR=X']: { regularMarketPrice: 2 },
            ['USDEUR=X']: { regularMarketPrice: 3 },
          },
        ]);

        await using subscription = gqlWsClientIterateDisposable({
          query: /* GraphQL */ `
            subscription {
              portfolioStats {
                data {
                  forCurrency
                  unrealizedPnl {
                    amount
                    percent
                    currencyAdjusted(currency: "EUR") {
                      currency
                      exchangeRate
                      amount
                    }
                  }
                }
              }
            }
          `,
        });

        const emissions = await asyncPipe(subscription, itTake(3), itCollect);

        expect(emissions).toStrictEqual([
          {
            data: {
              portfolioStats: [
                {
                  data: {
                    forCurrency: 'USD',
                    unrealizedPnl: {
                      amount: 0.7,
                      percent: 30.434782608696,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 3,
                        amount: 2.1000000000000005,
                      },
                    },
                  },
                },
                {
                  data: {
                    forCurrency: 'GBP',
                    unrealizedPnl: {
                      amount: 0.8,
                      percent: 36.363636363636,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 2,
                        amount: 1.5999999999999996,
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            data: {
              portfolioStats: [
                {
                  data: {
                    forCurrency: 'GBP',
                    unrealizedPnl: {
                      amount: 1,
                      percent: 45.454545454545,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 2,
                        amount: 2,
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            data: {
              portfolioStats: [
                {
                  data: {
                    forCurrency: 'USD',
                    unrealizedPnl: {
                      amount: 0.9,
                      percent: 39.130434782609,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 3,
                        amount: 2.700000000000001,
                      },
                    },
                  },
                },
              ],
            },
          },
        ]);
      });
    });
  });
});
