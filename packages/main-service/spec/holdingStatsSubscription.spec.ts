import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { type SubscribePayload } from 'graphql-ws';
import { asyncPipe, pipe } from 'shared-utils';
import { itCollect, itTake, itTakeFirst } from 'iterable-operators';
import {
  HoldingStatsChangeModel,
  InstrumentInfoModel,
  TradeRecordModel,
  UserModel,
} from '../src/db/index.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { publishUserHoldingChangedRedisEvent } from './utils/publishUserHoldingChangedRedisEvent.js';
import { mockMarketDataControl } from './utils/mockMarketDataService.js';
import { gqlWsClient } from './utils/gqlWsClient.js';

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
    ]),
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
  await HoldingStatsChangeModel.destroy({ where: {} });
  await TradeRecordModel.destroy({ where: {} });
  await InstrumentInfoModel.destroy({ where: {} });
  await UserModel.destroy({ where: {} });

  unmockGqlContext();
});

describe('Subscription.holdingStats ', () => {
  it('Upon subscription immediately emits an initial message with the state of all targeted holding stats', async () => {
    const trades = await TradeRecordModel.bulkCreate([
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
    ]);

    await HoldingStatsChangeModel.bulkCreate(
      trades.map(({ id, ownerId, symbol, performedAt }) => ({
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
      }))
    );

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          holdingStats {
            data {
              ownerId
              symbol
              lastRelatedTradeId
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    try {
      const firstItem = (await subscription.next()).value;

      expect(firstItem).toStrictEqual({
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'AAPL',
                lastRelatedTradeId: mockTradeIds[1],
                totalPresentInvestedAmount: 100,
              },
            },
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'ADBE',
                lastRelatedTradeId: mockTradeIds[0],
                totalPresentInvestedAmount: 100,
              },
            },
          ],
        },
      });
    } finally {
      await subscription.return!();
    }
  });

  it(
    'For every newly created holding stats for existing symbols emits ' +
      'corresponding updates correctly',
    async () => {
      const trades = await TradeRecordModel.bulkCreate([
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
      ]);

      await HoldingStatsChangeModel.bulkCreate(
        trades.map(({ id, ownerId, symbol, performedAt }) => ({
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
        }))
      );

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            holdingStats {
              data {
                ownerId
                symbol
                lastRelatedTradeId
                totalPresentInvestedAmount
              }
            }
          }`,
      });

      // const getResource = () => ({
      //   [Symbol.asyncDispose]: async () => {
      //     console.log('DISPOSED!!!');
      //   },
      // });

      // {
      //   await using resource = getResource();
      // }

      try {
        await subscription.next(); // Drain initial full state message

        const emissions: any[] = [];

        for (const nextMockData of [
          {
            trade: {
              id: mockTradeIds[2],
              ownerId: mockUserId1,
              symbol: 'ADBE',
              performedAt: '2024-01-03T11:11:11.000Z',
              quantity: 1,
              price: 2.2,
            },
            holdingStatsChange: {
              ownerId: mockUserId1,
              symbol: 'ADBE',
              relatedTradeId: mockTradeIds[2],
              changedAt: '2024-01-03T11:11:11.000Z',
              totalLotCount: 3,
              totalQuantity: 3,
              totalPresentInvestedAmount: 110,
              totalRealizedAmount: 100,
              totalRealizedProfitOrLossAmount: 21,
              totalRealizedProfitOrLossRate: 0.3,
            },
          },
          {
            trade: {
              id: mockTradeIds[3],
              ownerId: mockUserId1,
              symbol: 'ADBE',
              performedAt: '2024-01-04T11:11:11.000Z',
              quantity: 1,
              price: 2.2,
            },
            holdingStatsChange: {
              ownerId: mockUserId1,
              symbol: 'ADBE',
              relatedTradeId: mockTradeIds[3],
              changedAt: '2024-01-04T11:11:11.000Z',
              totalLotCount: 3,
              totalQuantity: 3,
              totalPresentInvestedAmount: 120,
              totalRealizedAmount: 100,
              totalRealizedProfitOrLossAmount: 21,
              totalRealizedProfitOrLossRate: 0.3,
            },
          },
        ]) {
          await TradeRecordModel.create(nextMockData.trade);
          await HoldingStatsChangeModel.create(nextMockData.holdingStatsChange);

          await publishUserHoldingChangedRedisEvent({
            ownerId: mockUserId1,
            holdingStats: { set: ['ADBE'] },
          });

          emissions.push((await subscription.next()).value);
        }

        expect(emissions).toStrictEqual([
          {
            data: {
              holdingStats: [
                {
                  data: {
                    ownerId: mockUserId1,
                    symbol: 'ADBE',
                    lastRelatedTradeId: mockTradeIds[2],
                    totalPresentInvestedAmount: 110,
                  },
                },
              ],
            },
          },
          {
            data: {
              holdingStats: [
                {
                  data: {
                    ownerId: mockUserId1,
                    symbol: 'ADBE',
                    lastRelatedTradeId: mockTradeIds[3],
                    totalPresentInvestedAmount: 120,
                  },
                },
              ],
            },
          },
        ]);
      } finally {
        await subscription.return!();
      }
    }
  );

  it('For every newly created holding stats for symbols priorly unheld emits corresponding updates correctly', async () => {
    await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
    await HoldingStatsChangeModel.bulkCreate(reusableHoldingStats.slice(0, 2));

    const subscription = gqlWsClient.iterate({
      query: `
          subscription {
            holdingStats {
              data {
                ownerId
                symbol
                lastRelatedTradeId
                totalPresentInvestedAmount
              }
            }
          }`,
    });

    // const getResource = () => ({
    //   [Symbol.asyncDispose]: async () => {
    //     console.log('DISPOSED!!!');
    //   },
    // });

    // {
    //   await using resource = getResource();
    // }

    try {
      await subscription.next(); // Drain initial full state message

      const emissions: any[] = [];

      for (const nextMockData of [
        {
          trade: reusableTradeDatas[2],
          holdingStatsChange: {
            ...reusableHoldingStats[2],
            totalPresentInvestedAmount: 110,
          },
        },
        {
          trade: reusableTradeDatas[4],
          holdingStatsChange: {
            ...reusableHoldingStats[4],
            totalPresentInvestedAmount: 120,
          },
        },
      ]) {
        await TradeRecordModel.create(nextMockData.trade);
        await HoldingStatsChangeModel.create(nextMockData.holdingStatsChange);

        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: [nextMockData.holdingStatsChange.symbol] },
        });

        emissions.push((await subscription.next()).value);
      }

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              {
                data: {
                  ownerId: mockUserId1,
                  symbol: 'ADBE',
                  lastRelatedTradeId: reusableHoldingStats[2].relatedTradeId,
                  totalPresentInvestedAmount: 110,
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  ownerId: mockUserId1,
                  symbol: 'ADBE',
                  lastRelatedTradeId: reusableHoldingStats[4].relatedTradeId,
                  totalPresentInvestedAmount: 120,
                },
              },
            ],
          },
        },
      ]);
    } finally {
      await subscription.return!();
    }
  });

  it('Targeting non-existent holding stats emits initial state message with empty data', async () => {
    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          holdingStats {
            data {
              ownerId
              symbol
              lastRelatedTradeId
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    try {
      const initialMessage = (await subscription.next()).value;

      expect(initialMessage).toStrictEqual({
        data: {
          holdingStats: [],
        },
      });
    } finally {
      await subscription.return!();
    }
  });

  it("When entire existing symbols' holding stats get erased emits corresponding updates correctly", async () => {
    const trades = await TradeRecordModel.bulkCreate([
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
    ]);

    await HoldingStatsChangeModel.bulkCreate(
      trades.map(({ id, ownerId, symbol, performedAt }) => ({
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
      }))
    );

    await using subscription = iterateGqlSubscriptionDisposable({
      query: `
        subscription {
          holdingStats {
            type
            data {
              ownerId
              symbol
              lastRelatedTradeId
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    const emissions = [(await subscription.next()).value];

    await Promise.all([
      TradeRecordModel.destroy({ where: { id: trades[0].id } }),
      HoldingStatsChangeModel.destroy({ where: { relatedTradeId: trades[0].id } }),
    ]);
    await publishUserHoldingChangedRedisEvent({
      ownerId: mockUserId1,
      holdingStats: { remove: ['ADBE'] },
    });

    emissions.push((await subscription.next()).value);

    expect(emissions).toStrictEqual([
      {
        data: {
          holdingStats: [
            expect.objectContaining({ type: 'SET' }),
            expect.objectContaining({ type: 'SET' }),
          ],
        },
      },
      {
        data: {
          holdingStats: [
            {
              type: 'REMOVE',
              data: {
                lastRelatedTradeId: trades[0].id,
                ownerId: mockUserId1,
                symbol: 'ADBE',
                totalPresentInvestedAmount: 100,
              },
            },
          ],
        },
      },
    ]);
  });

  it('Targeting non-existent holding stats will emit a message as soon as such holding stats eventually get created', async () => {
    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          holdingStats {
            data {
              ownerId
              symbol
              lastRelatedTradeId
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    try {
      await subscription.next(); // Drain initial full state message

      const trades = await TradeRecordModel.bulkCreate(
        ['ADBE', 'AAPL'].map((symbol, i) => ({
          id: mockTradeIds[i],
          ownerId: mockUserId1,
          symbol,
          performedAt: `2024-01-0${i + 1}T11:11:11.000Z`,
          quantity: 2,
          price: 1.1,
        }))
      );
      await HoldingStatsChangeModel.bulkCreate(
        trades.map(({ id, ownerId, symbol, performedAt }) => ({
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
        }))
      );
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        holdingStats: { set: ['ADBE', 'AAPL'] },
      });

      const nextMessage = (await subscription.next()).value;

      expect(nextMessage).toStrictEqual({
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'AAPL',
                lastRelatedTradeId: mockTradeIds[1],
                totalPresentInvestedAmount: 100,
              },
            },
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'ADBE',
                lastRelatedTradeId: mockTradeIds[0],
                totalPresentInvestedAmount: 100,
              },
            },
          ],
        },
      });
    } finally {
      await subscription.return!();
    }
  });

  it('When targeting only certain stats fields, only holding changes that have any of these fields modified will cause updates to be emitted', async () => {
    await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
    await HoldingStatsChangeModel.bulkCreate(reusableHoldingStats.slice(0, 2));

    await using subscription = iterateGqlSubscriptionDisposable({
      query: `
        subscription {
          holdingStats {
            data {
              ownerId
              symbol
              totalQuantity
              totalRealizedAmount
            }
          }
        }`,
    });

    const emissions = [(await subscription.next()).value];

    let currTradeData = reusableTradeDatas.at(-1)!;
    let currHoldingStatsData = reusableHoldingStats.at(-1)!;

    for (const [i, nextDataChanges] of (
      [
        {
          containsChangesInFieldsThatWereObserved: false,
          symbol: 'ADBE',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 2,
            totalRealizedAmount: 100,
          },
        },
        {
          containsChangesInFieldsThatWereObserved: true,
          symbol: 'ADBE',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 3,
            totalRealizedAmount: 100,
          },
        },
        {
          containsChangesInFieldsThatWereObserved: true,
          symbol: 'ADBE',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 3,
            totalRealizedAmount: 120,
          },
        },
        {
          containsChangesInFieldsThatWereObserved: false,
          symbol: 'AAPL',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 2,
            totalRealizedAmount: 100,
          },
        },
        {
          containsChangesInFieldsThatWereObserved: true,
          symbol: 'AAPL',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 3,
            totalRealizedAmount: 100,
          },
        },
        {
          containsChangesInFieldsThatWereObserved: true,
          symbol: 'AAPL',
          holdingStatsChange: {
            totalPresentInvestedAmount: 120,
            totalQuantity: 3,
            totalRealizedAmount: 120,
          },
        },
      ] as const
    ).entries()) {
      const nextTradeId = mockTradeIds[i + 2];
      const nextSymbol = nextDataChanges.symbol;
      const nextDate = new Date(+currTradeData.performedAt + 1000 * 60 * 60 * 24);

      currTradeData = {
        ...currTradeData,
        id: nextTradeId,
        performedAt: nextDate,
        symbol: nextSymbol,
      };

      currHoldingStatsData = {
        ...currHoldingStatsData,
        ...nextDataChanges.holdingStatsChange,
        symbol: nextSymbol,
        changedAt: nextDate,
        relatedTradeId: nextTradeId,
      };

      await TradeRecordModel.create(currTradeData);
      await HoldingStatsChangeModel.create(currHoldingStatsData);

      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        holdingStats: { set: [nextSymbol] },
      });

      if (nextDataChanges.containsChangesInFieldsThatWereObserved) {
        await asyncPipe(subscription.next(), ({ value }) => emissions.push(value));
      }
    }

    expect(emissions).toStrictEqual([
      expect.anything(), // (initial full state emission)
      {
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'ADBE',
                totalQuantity: 3,
                totalRealizedAmount: 100,
              },
            },
          ],
        },
      },
      {
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'ADBE',
                totalQuantity: 3,
                totalRealizedAmount: 120,
              },
            },
          ],
        },
      },
      {
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'AAPL',
                totalQuantity: 3,
                totalRealizedAmount: 100,
              },
            },
          ],
        },
      },
      {
        data: {
          holdingStats: [
            {
              data: {
                ownerId: mockUserId1,
                symbol: 'AAPL',
                totalQuantity: 3,
                totalRealizedAmount: 120,
              },
            },
          ],
        },
      },
    ]);
  });

  describe('With `marketValue` and `unrealizedPnl` fields', () => {
    it('Emits updates correctly in conjunction with changes to holding symbols market data', async () => {
      await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
      await HoldingStatsChangeModel.bulkCreate(
        reusableHoldingStats.slice(0, 2).map(h => ({
          ...h,
          totalLotCount: 1,
          totalQuantity: 3,
          totalPresentInvestedAmount: 30,
        }))
      );

      const emissionsPromise = asyncPipe(
        gqlWsClient.iterate({
          query: `
            subscription {
              holdingStats {
                data {
                  symbol
                  marketValue
                  unrealizedPnl {
                    amount
                    percent
                  }
                }
              }
            }`,
        }),
        itTake(3),
        itCollect
      );

      await using mockMarketData = mockMarketDataControl.start();
      await mockMarketData.next([
        {
          ADBE: { regularMarketPrice: 12.5 },
          AAPL: { regularMarketPrice: 12.5 },
        },
        {
          ADBE: { regularMarketPrice: 15 },
        },
        {
          AAPL: { regularMarketPrice: 15 },
        },
      ]);

      const emissions = await emissionsPromise;

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 37.5,
                  unrealizedPnl: { amount: 7.5, percent: 25 },
                },
              },
              {
                data: {
                  symbol: 'ADBE',
                  marketValue: 37.5,
                  unrealizedPnl: { amount: 7.5, percent: 25 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'ADBE',
                  marketValue: 45,
                  unrealizedPnl: { amount: 15, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 45,
                  unrealizedPnl: { amount: 15, percent: 50 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to underlying holding stats', async () => {
      await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
      await HoldingStatsChangeModel.bulkCreate(
        reusableHoldingStats.slice(0, 2).map(h => ({
          ...h,
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 16,
        }))
      );

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            holdingStats {
              data {
                symbol
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }`,
      });

      await using mockMarketData = mockMarketDataControl.start();
      await mockMarketData.next([
        {
          ADBE: { regularMarketPrice: 10 },
          AAPL: { regularMarketPrice: 10 },
        },
      ]);

      try {
        const emissions: any[] = [(await subscription.next()).value];

        for (const applyNextChanges of [
          async () => {
            await TradeRecordModel.create(reusableTradeDatas[2]);
            await HoldingStatsChangeModel.create({
              ...reusableHoldingStats[2],
              symbol: 'ADBE',
              totalLotCount: 2,
              totalQuantity: 4,
              totalPresentInvestedAmount: 38,
            });
            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              holdingStats: { set: [reusableHoldingStats[2].symbol] },
            });
          },
          async () => {
            await TradeRecordModel.create(reusableTradeDatas[3]);
            await HoldingStatsChangeModel.create({
              ...reusableHoldingStats[3],
              symbol: 'AAPL',
              totalLotCount: 3,
              totalQuantity: 6,
              totalPresentInvestedAmount: 58,
            });
            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              holdingStats: { set: [reusableHoldingStats[3].symbol] },
            });
          },
        ]) {
          await applyNextChanges();

          const { value } = await subscription.next();
          emissions.push(value);

          await setTimeout(0); // a non-ideal workaround to let app a chance to finish reacting and processing the current change before we overwhelm it with the one that follows up next
        }

        expect(emissions).toStrictEqual([
          {
            data: {
              holdingStats: [
                {
                  data: {
                    symbol: 'AAPL',
                    marketValue: 20,
                    unrealizedPnl: { amount: 4, percent: 25 },
                  },
                },
                {
                  data: {
                    symbol: 'ADBE',
                    marketValue: 20,
                    unrealizedPnl: { amount: 4, percent: 25 },
                  },
                },
              ],
            },
          },
          {
            data: {
              holdingStats: [
                {
                  data: {
                    symbol: 'ADBE',
                    marketValue: 40,
                    unrealizedPnl: { amount: 2, percent: 5.263157894737 },
                  },
                },
              ],
            },
          },
          {
            data: {
              holdingStats: [
                {
                  data: {
                    symbol: 'AAPL',
                    marketValue: 60,
                    unrealizedPnl: { amount: 2, percent: 3.448275862069 },
                  },
                },
              ],
            },
          },
        ]);
      } finally {
        await subscription.return!();
      }
    });

    it('When targeting empty past holdings, emits the initial message with zero amount and percent and then continues observing for any relevant future changes as in any regular holding', async () => {
      await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
      await HoldingStatsChangeModel.bulkCreate(
        reusableHoldingStats.slice(0, 2).map(h => ({
          ...h,
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
        }))
      );

      await using subscription = iterateGqlSubscriptionDisposable({
        query: `
          subscription {
            holdingStats {
              data {
                symbol
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }`,
      });

      await using mockMarketData = mockMarketDataControl.start();

      const emissions = [(await subscription.next()).value];

      for (const applyNextChanges of [
        async () => {
          await TradeRecordModel.create(reusableTradeDatas[2]);
          await HoldingStatsChangeModel.create({
            ...reusableHoldingStats[2],
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 16,
          });

          await publishUserHoldingChangedRedisEvent({
            ownerId: mockUserId1,
            holdingStats: { set: [reusableHoldingStats[2].symbol] },
          });

          await mockMarketData.next([{ ADBE: { regularMarketPrice: 11 } }]);
        },

        async () => {
          await TradeRecordModel.create(reusableTradeDatas[3]);
          await HoldingStatsChangeModel.create({
            ...reusableHoldingStats[3],
            totalLotCount: 2,
            totalQuantity: 4,
            totalPresentInvestedAmount: 36,
          });

          await publishUserHoldingChangedRedisEvent({
            ownerId: mockUserId1,
            holdingStats: { set: [reusableHoldingStats[3].symbol] },
          });

          await mockMarketDataControl.whenNextMarketDataSymbolsRequested();
          await mockMarketData.next([{ AAPL: { regularMarketPrice: 12 } }]);
        },
      ]) {
        await applyNextChanges();
        const { value } = await subscription.next();
        emissions.push(value);
      }

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 0,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
              {
                data: {
                  symbol: 'ADBE',
                  marketValue: 0,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'ADBE',
                  marketValue: 22,
                  unrealizedPnl: { amount: 6, percent: 37.5 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 48,
                  unrealizedPnl: { amount: 12, percent: 33.333333333333 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('When targeting empty past holdings, changes in market data do not cause any further updates to be emitted', async () => {
      await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
      await HoldingStatsChangeModel.bulkCreate([
        {
          ...reusableHoldingStats[0],
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
        },
        {
          ...reusableHoldingStats[1],
          totalLotCount: 1,
          totalQuantity: 1,
          totalPresentInvestedAmount: 4,
        },
      ]);

      await using subscription = iterateGqlSubscriptionDisposable({
        query: `
            subscription {
              holdingStats {
                data {
                  symbol
                  marketValue
                  unrealizedPnl {
                    amount
                    percent
                  }
                }
              }
            }`,
      });

      await using mockMarketData = mockMarketDataControl.start();
      await mockMarketData.next([
        {
          ADBE: { regularMarketPrice: 5 },
          AAPL: { regularMarketPrice: 5 },
        },
        {
          ADBE: { regularMarketPrice: 6 },
          AAPL: { regularMarketPrice: 6 },
        },
        {
          ADBE: { regularMarketPrice: 7 },
          AAPL: { regularMarketPrice: 7 },
        },
      ]);

      const emissions = await pipe(subscription, itTake(3), itCollect);

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 5,
                  unrealizedPnl: { amount: 1, percent: 25 },
                },
              },
              {
                data: {
                  symbol: 'ADBE',
                  marketValue: 0,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 6,
                  unrealizedPnl: { amount: 2, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  marketValue: 7,
                  unrealizedPnl: { amount: 3, percent: 75 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to holding symbols whose market data cannot be found', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
        { ...reusableTradeDatas[2], symbol: 'NVDA' },
      ]);
      await HoldingStatsChangeModel.bulkCreate([
        { ...reusableHoldingStats[0], symbol: 'ADBE' },
        { ...reusableHoldingStats[1], symbol: 'AAPL' },
        { ...reusableHoldingStats[2], symbol: 'NVDA' },
      ]);

      await using __ = mockMarketDataControl.start([
        {
          ADBE: { regularMarketPrice: 10 },
          AAPL: null,
          NVDA: null,
        },
      ]);

      await using subscription = iterateGqlSubscriptionDisposable({
        query: `
          subscription {
            holdingStats {
              data {
                symbol
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }`,
      });

      const firstEmission = await pipe(subscription, itTakeFirst());

      expect(firstEmission).toStrictEqual({
        data: null,
        errors: [
          {
            message: 'Couldn\'t find market data for some symbols: "AAPL", "NVDA"',
            extensions: {
              type: 'SYMBOL_MARKET_DATA_NOT_FOUND',
              details: { symbolsNotFound: ['AAPL', 'NVDA'] },
            },
          },
        ],
      });
    });

    describe('With `unrealizedPnl.currencyAdjusted` field', () => {
      it('Emits updates correctly in conjunction with changes to holding symbols currency-adjusted market data', async () => {
        await TradeRecordModel.bulkCreate(reusableTradeDatas.slice(0, 2));
        await HoldingStatsChangeModel.bulkCreate([
          {
            ...reusableHoldingStats[0],
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.2,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ...reusableHoldingStats[1],
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.4,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
        ]);

        await using __ = mockMarketDataControl.start([
          {
            ADBE: { regularMarketPrice: 1.5 },
            AAPL: { regularMarketPrice: 1.5 },
            'USDEUR=X': { regularMarketPrice: 2 },
          },
          {
            ADBE: { regularMarketPrice: 1.6 },
            'USDEUR=X': { regularMarketPrice: 2 },
          },
          {
            AAPL: { regularMarketPrice: 1.6 },
            'USDEUR=X': { regularMarketPrice: 2 },
          },
        ]);

        await using subscription = iterateGqlSubscriptionDisposable({
          query: `
            subscription {
              holdingStats {
                data {
                  symbol
                  unrealizedPnl {
                    amount
                    percent
                    currencyAdjusted (currency: "EUR") {
                      currency
                      exchangeRate
                      amount
                    }
                  }
                }
              }
            }`,
        });

        const emissions = await asyncPipe(subscription, itTake(3), itCollect);

        expect(emissions).toStrictEqual([
          {
            data: {
              holdingStats: [
                {
                  data: {
                    symbol: 'AAPL',
                    unrealizedPnl: {
                      amount: 0.6,
                      percent: 25,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 2,
                        amount: 1.2000000000000002,
                      },
                    },
                  },
                },
                {
                  data: {
                    symbol: 'ADBE',
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
              holdingStats: [
                {
                  data: {
                    symbol: 'ADBE',
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
              holdingStats: [
                {
                  data: {
                    symbol: 'AAPL',
                    unrealizedPnl: {
                      amount: 0.8,
                      percent: 33.333333333333,
                      currencyAdjusted: {
                        currency: 'EUR',
                        exchangeRate: 2,
                        amount: 1.6000000000000005,
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

  it('When targeting holdings using the `filters.symbols` arg, only holdings with corresponding symbols have updates sent for and are watched for further changes', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'ADBE' },
      { ...reusableTradeDatas[1], symbol: 'AAPL' },
      { ...reusableTradeDatas[2], symbol: 'NVDA' },
    ]);
    await HoldingStatsChangeModel.bulkCreate([
      { ...reusableHoldingStats[0], symbol: 'ADBE' },
      { ...reusableHoldingStats[1], symbol: 'AAPL' },
      { ...reusableHoldingStats[2], symbol: 'NVDA' },
    ]);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          holdingStats (
            filters: {
              symbols: ["ADBE", "AAPL"]
            }
          ) {
            data {
              symbol
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    try {
      const emissions = [(await subscription.next()).value];

      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[3], symbol: 'ADBE' },
        { ...reusableTradeDatas[4], symbol: 'AAPL' },
        { ...reusableTradeDatas[5], symbol: 'NVDA' },
      ]);
      await HoldingStatsChangeModel.bulkCreate([
        { ...reusableHoldingStats[3], symbol: 'ADBE', totalPresentInvestedAmount: 110 },
        { ...reusableHoldingStats[4], symbol: 'AAPL', totalPresentInvestedAmount: 110 },
        { ...reusableHoldingStats[5], symbol: 'NVDA', totalPresentInvestedAmount: 110 },
      ]);
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        holdingStats: { set: ['ADBE', 'AAPL', 'NVDA'] },
      });

      const value = (await subscription.next()).value;
      emissions.push(value);

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              { data: { symbol: 'AAPL', totalPresentInvestedAmount: 100 } },
              { data: { symbol: 'ADBE', totalPresentInvestedAmount: 100 } },
            ],
          },
        },

        {
          data: {
            holdingStats: [
              { data: { symbol: 'AAPL', totalPresentInvestedAmount: 110 } },
              { data: { symbol: 'ADBE', totalPresentInvestedAmount: 110 } },
            ],
          },
        },
      ]);
    } finally {
      await subscription.return!();
    }
  });

  it("When targeting holdings using the `filters.symbols` arg, if some of the target symbols don't have matching existing holdings, they'll have updates sent for when they eventually do", async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'ADBE' },
      { ...reusableTradeDatas[1], symbol: 'AAPL' },
    ]);
    await HoldingStatsChangeModel.bulkCreate([
      { ...reusableHoldingStats[0], symbol: 'ADBE' },
      { ...reusableHoldingStats[1], symbol: 'AAPL' },
    ]);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          holdingStats (
            filters: {
              symbols: ["ADBE", "AAPL", "NVDA"]
            }
          ) {
            data {
              symbol
              totalPresentInvestedAmount
            }
          }
        }`,
    });

    const emissions = await (async () => {
      try {
        const emissions = [(await subscription.next()).value];

        await TradeRecordModel.create({ ...reusableTradeDatas[3], symbol: 'NVDA' });
        await HoldingStatsChangeModel.create({ ...reusableHoldingStats[3], symbol: 'NVDA' });
        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          holdingStats: { set: ['NVDA'] },
        });

        const value = (await subscription.next()).value;
        emissions.push(value);

        return emissions;
      } finally {
        await subscription.return!();
      }
    })();

    expect(emissions).toStrictEqual([
      {
        data: {
          holdingStats: [
            { data: { symbol: 'AAPL', totalPresentInvestedAmount: 100 } },
            { data: { symbol: 'ADBE', totalPresentInvestedAmount: 100 } },
          ],
        },
      },
      {
        data: {
          holdingStats: [{ data: { symbol: 'NVDA', totalPresentInvestedAmount: 100 } }],
        },
      },
    ]);
  });

  describe('With `priceData` field', () => {
    it('Emits updates correctly in conjunction with incoming market price data changes', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
      ]);
      await HoldingStatsChangeModel.bulkCreate([
        { ...reusableHoldingStats[0], symbol: 'ADBE' },
        { ...reusableHoldingStats[1], symbol: 'AAPL' },
      ]);

      await using subscription = iterateGqlSubscriptionDisposable({
        query: `
          subscription {
            holdingStats {
              data {
                symbol
                priceData {
                  currency
                  marketState
                  regularMarketTime
                  regularMarketPrice
                }
              }
            }
          }`,
      });

      await using mockMarketData = mockMarketDataControl.start();
      await mockMarketData.next([
        {
          ADBE: {
            currency: 'USD',
            marketState: 'REGULAR',
            regularMarketPrice: 10,
            regularMarketTime: '2024-01-01T00:00:00.000Z',
          },
          AAPL: {
            currency: 'USD',
            marketState: 'REGULAR',
            regularMarketPrice: 10,
            regularMarketTime: '2024-01-01T00:00:00.000Z',
          },
        },
        {
          ADBE: {
            currency: 'USD',
            marketState: 'CLOSED',
            regularMarketPrice: 11,
            regularMarketTime: '2024-01-01T00:00:01.000Z',
          },
        },
        {
          AAPL: {
            currency: 'USD',
            marketState: 'PRE',
            regularMarketPrice: 12,
            regularMarketTime: '2024-01-01T00:00:02.000Z',
          },
        },
      ]);

      const emissions = await pipe(subscription, itTake(3), itCollect);

      expect(emissions).toStrictEqual([
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  priceData: {
                    currency: 'USD',
                    marketState: 'REGULAR',
                    regularMarketPrice: 10,
                    regularMarketTime: '2024-01-01T00:00:00.000Z',
                  },
                },
              },
              {
                data: {
                  symbol: 'ADBE',
                  priceData: {
                    currency: 'USD',
                    marketState: 'REGULAR',
                    regularMarketPrice: 10,
                    regularMarketTime: '2024-01-01T00:00:00.000Z',
                  },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'ADBE',
                  priceData: {
                    currency: 'USD',
                    marketState: 'CLOSED',
                    regularMarketPrice: 11,
                    regularMarketTime: '2024-01-01T00:00:01.000Z',
                  },
                },
              },
            ],
          },
        },
        {
          data: {
            holdingStats: [
              {
                data: {
                  symbol: 'AAPL',
                  priceData: {
                    currency: 'USD',
                    marketState: 'PRE',
                    regularMarketPrice: 12,
                    regularMarketTime: '2024-01-01T00:00:02.000Z',
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

function iterateGqlSubscriptionDisposable(
  subscribePayload: SubscribePayload
): ReturnType<typeof gqlWsClient.iterate> & AsyncDisposable {
  const subscription = gqlWsClient.iterate(subscribePayload);
  return obtainDisposableIterableIterator(subscription);
}

function obtainDisposableIterableIterator<T>(
  iterableIterator: AsyncIterableIterator<T>
): AsyncIterableIterator<T> & AsyncDisposable {
  return {
    next: () => iterableIterator.next(),
    return: () => iterableIterator.return!(),
    [Symbol.asyncIterator]() {
      return this;
    },
    async [Symbol.asyncDispose]() {
      await iterableIterator.return!();
    },
  };
}
