import { Sequelize } from 'sequelize';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { asyncPipe, pipe } from 'shared-utils';
import { itCollect, itTake, itTakeFirst } from 'iterable-operators';
import {
  InstrumentInfoModel,
  LotClosingModel,
  LotModel,
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

const reusableLotDatas = [
  {
    id: mockUuidFromNumber(1),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[0],
    symbol: 'ADBE',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: new Date('2024-01-01T00:00:00.000Z'),
    recordCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
    recordUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: mockUuidFromNumber(2),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[1],
    symbol: 'AAPL',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: new Date('2024-01-01T00:00:01.000Z'),
    recordCreatedAt: new Date('2024-01-01T00:00:01.000Z'),
    recordUpdatedAt: new Date('2024-01-01T00:00:01.000Z'),
  },
  {
    id: mockUuidFromNumber(3),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[2],
    symbol: 'NVDA',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: new Date('2024-01-01T00:00:02.000Z'),
    recordCreatedAt: new Date('2024-01-01T00:00:02.000Z'),
    recordUpdatedAt: new Date('2024-01-01T00:00:02.000Z'),
  },
];

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
  await Promise.all([LotClosingModel.destroy({ where: {} }), LotModel.destroy({ where: {} })]);
  mockMarketDataControl.reset();
});

afterAll(async () => {
  await Promise.all([
    LotClosingModel.destroy({ where: {} }),
    LotModel.destroy({ where: {} }),
    TradeRecordModel.destroy({ where: {} }),
    InstrumentInfoModel.destroy({ where: {} }),
    UserModel.destroy({ where: {} }),
  ]);
  unmockGqlContext();
});

describe('Subscription.lots ', () => {
  it('Upon subscription immediately emits an initial message with the state of all targeted lots', async () => {
    await TradeRecordModel.bulkCreate([
      {
        id: mockTradeIds[0],
        ownerId: mockUserId1,
        symbol: 'ADBE',
        performedAt: '2024-01-01T00:00:00.000Z',
        quantity: 10,
        price: 1.1,
      },
      {
        id: mockTradeIds[1],
        ownerId: mockUserId1,
        symbol: 'AAPL',
        performedAt: '2024-01-01T00:00:01.000Z',
        quantity: 10,
        price: 1.1,
      },
    ]);

    const lots = await LotModel.bulkCreate([
      {
        id: mockUuidFromNumber(1),
        ownerId: mockUserId1,
        openingTradeId: mockTradeIds[0],
        symbol: 'ADBE',
        remainingQuantity: 8,
        realizedProfitOrLoss: 0.2,
        openedAt: '2024-01-01T00:00:00.000Z',
        recordCreatedAt: '2024-01-01T00:00:00.000Z',
        recordUpdatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: mockUuidFromNumber(2),
        ownerId: mockUserId1,
        openingTradeId: mockTradeIds[1],
        symbol: 'AAPL',
        remainingQuantity: 10,
        realizedProfitOrLoss: 0,
        openedAt: '2024-01-01T00:00:01.000Z',
        recordCreatedAt: '2024-01-01T00:00:01.000Z',
        recordUpdatedAt: '2024-01-01T00:00:01.000Z',
      },
    ]);

    const firstItem = await pipe(
      gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                ]
              }
            ) {
              data {
                id
                ownerId
                openingTradeId
                symbol
                originalQuantity
                remainingQuantity
                realizedProfitOrLoss
                openedAt
                recordCreatedAt
                recordUpdatedAt
              }
            }
          }`,
      }),
      itTakeFirst()
    );

    expect(firstItem).toStrictEqual({
      data: {
        lots: [
          {
            data: {
              id: lots[1].id,
              openingTradeId: lots[1].openingTradeId,
              ownerId: mockUserId1,
              symbol: 'AAPL',
              realizedProfitOrLoss: 0,
              openedAt: '2024-01-01T00:00:01.000Z',
              recordCreatedAt: '2024-01-01T00:00:01.000Z',
              recordUpdatedAt: '2024-01-01T00:00:01.000Z',
              originalQuantity: 10,
              remainingQuantity: 10,
            },
          },
          {
            data: {
              id: lots[0].id,
              openingTradeId: lots[0].openingTradeId,
              ownerId: mockUserId1,
              symbol: 'ADBE',
              realizedProfitOrLoss: 0.2,
              openedAt: '2024-01-01T00:00:00.000Z',
              recordCreatedAt: '2024-01-01T00:00:00.000Z',
              recordUpdatedAt: '2024-01-01T00:00:00.000Z',
              originalQuantity: 10,
              remainingQuantity: 8,
            },
          },
        ],
      },
    });
  });

  it('If one or more IDs given via the `filters.ids` arg don\'t exist, an "INVALID_LOT_IDS" error type is emitted', async () => {
    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[0], symbol: 'ADBE' }]);

    const lots = await LotModel.bulkCreate([{ ...reusableLotDatas[0], symbol: 'ADBE' }]);

    const firstExistingLotId = lots[0].id;
    const secondNonexistingLotId = mockUuidFromNumber(2);
    const thirdNonexistingLotId = mockUuidFromNumber(3);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          lots (
            filters: {
              ids: [
                "${firstExistingLotId}"
                "${secondNonexistingLotId}"
                "${thirdNonexistingLotId}"
              ]
            }
          ) {
            data {
              id
              originalQuantity
              remainingQuantity
              realizedProfitOrLoss
            }
          }
        }`,
    });

    const emissions = await asyncPipe(subscription, itCollect);

    expect(emissions).toStrictEqual([
      {
        data: null,
        errors: [
          {
            message:
              `Some of the requested lots could not be found (2 in total):` +
              `\nID "${secondNonexistingLotId}",` +
              `\nID "${thirdNonexistingLotId}"`,
            extensions: {
              type: 'INVALID_LOT_IDS',
              details: {
                unmatchedLotsIds: [secondNonexistingLotId, thirdNonexistingLotId],
                lotIdsGiven: [firstExistingLotId, secondNonexistingLotId, thirdNonexistingLotId],
              },
            },
          },
        ],
      },
    ]);
  });

  it('Only lots matching the given `filters.ids` arg have updates emitted for', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 3, price: 1.1 },
      { ...reusableTradeDatas[1], symbol: 'AAPL', quantity: 3, price: 1.1 },
      { ...reusableTradeDatas[2], symbol: 'NVDA', quantity: 3, price: 1.1 },
    ]);

    const lots = await LotModel.bulkCreate([
      {
        ...reusableLotDatas[0],
        symbol: 'ADBE',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
      {
        ...reusableLotDatas[1],
        symbol: 'AAPL',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
      {
        ...reusableLotDatas[2],
        symbol: 'NVDA',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
    ]);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          lots (
            filters: {
              ids: [
                "${lots[0].id}"
                "${lots[1].id}"
              ]
            }
          ) {
            data {
              id
              originalQuantity
              remainingQuantity
              realizedProfitOrLoss
            }
          }
        }`,
    });

    try {
      const emissions = [(await subscription.next()).value];

      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[3], symbol: 'NVDA', quantity: -2, price: 1.2 },
      ]);
      await LotModel.update(
        {
          remainingQuantity: 1,
          realizedProfitOrLoss: 0.2,
        },
        { where: { id: lots[2].id } }
      );
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        portfolioStats: { set: [{ forCurrency: 'USD' }] },
        holdingStats: { set: ['NVDA'] },
        lots: { set: [lots[2].id] },
      });

      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[4], symbol: 'ADBE', quantity: -2, price: 1.2 },
        { ...reusableTradeDatas[5], symbol: 'NVDA', quantity: -2, price: 1.2 },
      ]);
      await LotModel.update(
        {
          remainingQuantity: 1,
          realizedProfitOrLoss: 0.2,
        },
        {
          where: { id: [lots[0].id, lots[2].id] },
        }
      );
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        portfolioStats: { set: [{ forCurrency: 'USD' }] },
        holdingStats: { set: ['ADBE', 'NVDA'] },
        lots: { set: [lots[0].id, lots[2].id] },
      });

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[1].id,
                  originalQuantity: 3,
                  remainingQuantity: 3,
                  realizedProfitOrLoss: 0,
                },
              },
              {
                data: {
                  id: lots[0].id,
                  originalQuantity: 3,
                  remainingQuantity: 3,
                  realizedProfitOrLoss: 0,
                },
              },
            ],
          },
        },
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[0].id,
                  originalQuantity: 3,
                  remainingQuantity: 1,
                  realizedProfitOrLoss: 0.2,
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

  // it('*** *** *** Some of the requested lots are closed lots (1 in total): ID "10000000-0000-0000-0000-000000000000"', async () => {
  //   await TradeRecordModel.bulkCreate([
  //     {
  //       id: mockTradeIds[0],
  //       ownerId: mockUserId1,
  //       symbol: 'ADBE',
  //       performedAt: '2024-01-01T00:00:00.000Z',
  //       quantity: 2,
  //       price: 1.1,
  //     },
  //     {
  //       id: mockTradeIds[1],
  //       ownerId: mockUserId1,
  //       symbol: 'AAPL',
  //       performedAt: '2024-01-01T00:00:01.000Z',
  //       quantity: 2,
  //       price: 1.1,
  //     },
  //     {
  //       id: mockTradeIds[2],
  //       ownerId: mockUserId1,
  //       symbol: 'ADBE',
  //       performedAt: '2024-01-01T00:00:02.000Z',
  //       quantity: -2,
  //       price: 1.2,
  //     },
  //   ]);

  //   const lots = await LotModel.bulkCreate([
  //     {
  //       id: mockUuidFromNumber(1),
  //       ownerId: mockUserId1,
  //       openingTradeId: mockTradeIds[0],
  //       symbol: 'ADBE',
  //       remainingQuantity: 0,
  //       realizedProfitOrLoss: 0.2,
  //       openedAt: new Date('2024-01-01T00:00:00.000Z'),
  //       recordCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
  //       recordUpdatedAt: new Date('2024-01-01T00:00:02.000Z'),
  //     },
  //     {
  //       id: mockUuidFromNumber(2),
  //       ownerId: mockUserId1,
  //       openingTradeId: mockTradeIds[1],
  //       symbol: 'AAPL',
  //       remainingQuantity: 3,
  //       realizedProfitOrLoss: 0,
  //       openedAt: new Date('2024-01-01T00:00:01.000Z'),
  //       recordCreatedAt: new Date('2024-01-01T00:00:01.000Z'),
  //       recordUpdatedAt: new Date('2024-01-01T00:00:01.000Z'),
  //     },
  //   ]);

  //   const firstItemPromise = pipe(
  //     gqlWsClient.iterate({
  //       query: `
  //         subscription {
  //           lots (
  //             filters: {
  //               ids: [
  //                 "${lots[0].id}"
  //                 "${lots[1].id}"
  //               ]
  //             }
  //           ) {
  //             data {
  //               id
  //               ownerId
  //               remainingQuantity
  //               realizedProfitOrLoss
  //             }
  //           }
  //         }`,
  //     }),
  //     itTakeFirst()
  //   );

  //   await firstItemPromise.catch(err => {
  //     err;
  //   });

  //   await expect(firstItemPromise).to.rejects.toMatchObject({});
  // });

  it(
    'When targeting only certain fields, only lot changes that have any of these ' +
      'fields modified will cause updates to be emitted',
    async () => {
      await TradeRecordModel.bulkCreate([
        {
          id: mockTradeIds[0],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:00.000Z',
          quantity: 10,
          price: 1.1,
        },
        {
          id: mockTradeIds[1],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:01.000Z',
          quantity: 10,
          price: 1.1,
        },
      ]);

      const lots = await LotModel.bulkCreate([
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[0],
          symbol: 'ADBE',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0.2,
          openedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[1],
          symbol: 'AAPL',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0,
          openedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:01.000Z'),
        },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                ]
              }
            ) {
              data {
                id
                priceData {
                  regularMarketPrice
                }
              }
            }
          }`,
      });

      try {
        const emissions: any[] = [];

        await mockMarketDataControl.onConnectionSend([
          {
            [lots[0].symbol]: { regularMarketPrice: 10 },
            [lots[1].symbol]: { regularMarketPrice: 10 },
          },
        ]);

        emissions.push((await subscription.next()).value);

        await TradeRecordModel.create({
          id: mockTradeIds[2],
          ownerId: mockUserId1,
          symbol: lots[0].symbol,
          performedAt: '2024-01-01T00:00:02.000Z',
          quantity: -2,
          price: 1.2,
        });

        await LotModel.update(
          {
            remainingQuantity: lots[0].remainingQuantity - 2,
          },
          {
            where: { id: lots[0].id },
          }
        );

        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          portfolioStats: { set: [{ forCurrency: 'USD' }] },
          holdingStats: { set: [lots[0].symbol] },
          lots: { set: [lots[0].id] },
        });

        // *** Not expecting an emission here (because the `remainingQuantity` field which was modified wasn't targeted)...

        await mockMarketDataControl.waitUntilRequestingNewSymbols();
        await mockMarketDataControl.onConnectionSend([
          { [lots[1].symbol]: { regularMarketPrice: 11 } },
        ]);

        emissions.push((await subscription.next()).value);

        expect(emissions).toStrictEqual([
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[1].id,
                    priceData: {
                      regularMarketPrice: 10,
                    },
                  },
                },
                {
                  data: {
                    id: lots[0].id,
                    priceData: {
                      regularMarketPrice: 10,
                    },
                  },
                },
              ],
            },
          },
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[1].id,
                    priceData: {
                      regularMarketPrice: 11,
                    },
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

  describe('With `marketValue` and `unrealizedPnl` fields', () => {
    it('Emits updates correctly in conjunction with changes to lot symbols market data', async () => {
      await TradeRecordModel.bulkCreate([
        {
          id: mockTradeIds[0],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:00.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[1],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:01.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[2],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:02.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[3],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:03.000Z',
          quantity: 10,
          price: 2,
        },
      ]);

      const lots = await LotModel.bulkCreate([
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[0],
          symbol: 'ADBE',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0,
          openedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[1],
          symbol: 'ADBE',
          remainingQuantity: 5,
          realizedProfitOrLoss: 10,
          openedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:01.000Z'),
        },
        {
          id: mockUuidFromNumber(3),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[2],
          symbol: 'AAPL',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0,
          openedAt: new Date('2024-01-01T00:00:02.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:02.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:02.000Z'),
        },
        {
          id: mockUuidFromNumber(4),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[3],
          symbol: 'AAPL',
          remainingQuantity: 5,
          realizedProfitOrLoss: 10,
          openedAt: new Date('2024-01-01T00:00:03.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:03.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:03.000Z'),
        },
      ]);

      // (global as any).globalRequestedSymbols.clear();
      // console.log('global.globalRequestedSymbols', (global as any).globalRequestedSymbols);

      // (global as any).debuggedTestIsRunningNow = true;
      // await using _ = {
      //   [Symbol.asyncDispose]: async () => void ((global as any).debuggedTestIsRunningNow = false),
      // };

      mockMarketDataControl.onConnectionSend([
        { ADBE: { regularMarketPrice: 3 }, AAPL: { regularMarketPrice: 3 } },
        { ADBE: { regularMarketPrice: 4 } },
        { AAPL: { regularMarketPrice: 4 } },
      ]);

      const emissions = await asyncPipe(
        gqlWsClient.iterate({
          query: `
            subscription {
              lots (
                filters: {
                  ids: [
                    "${lots[0].id}"
                    "${lots[1].id}"
                    "${lots[2].id}"
                    "${lots[3].id}"
                  ]
                }
              ) {
                data {
                  id
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

      expect(emissions).toStrictEqual([
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[3].id,
                  marketValue: 15,
                  unrealizedPnl: { amount: 5, percent: 50 },
                },
              },
              {
                data: {
                  id: lots[2].id,
                  marketValue: 30,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
              {
                data: {
                  id: lots[1].id,
                  marketValue: 15,
                  unrealizedPnl: { amount: 5, percent: 50 },
                },
              },
              {
                data: {
                  id: lots[0].id,
                  marketValue: 30,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[1].id,
                  marketValue: 20,
                  unrealizedPnl: { amount: 10, percent: 100 },
                },
              },
              {
                data: {
                  id: lots[0].id,
                  marketValue: 40,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[3].id,
                  marketValue: 20,
                  unrealizedPnl: { amount: 10, percent: 100 },
                },
              },
              {
                data: {
                  id: lots[2].id,
                  marketValue: 40,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to underlying lots', async () => {
      await TradeRecordModel.bulkCreate([
        {
          id: mockTradeIds[0],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:00.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[1],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:01.000Z',
          quantity: 10,
          price: 2,
        },
      ]);

      const lots = await LotModel.bulkCreate([
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[0],
          symbol: 'ADBE',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0,
          openedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[1],
          symbol: 'AAPL',
          remainingQuantity: 5,
          realizedProfitOrLoss: 10,
          openedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordCreatedAt: new Date('2024-01-01T00:00:01.000Z'),
          recordUpdatedAt: new Date('2024-01-01T00:00:01.000Z'),
        },
      ]);

      mockMarketDataControl.onConnectionSend([
        {
          ADBE: { regularMarketPrice: 2.5 },
          AAPL: { regularMarketPrice: 2.5 },
        },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                ]
              }
            ) {
              data {
                id
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }`,
      });

      try {
        const emissions = [(await subscription.next()).value];

        for (const applyNextChanges of [
          async () => {
            await TradeRecordModel.create({
              id: mockTradeIds[2],
              ownerId: mockUserId1,
              symbol: 'ADBE',
              performedAt: '2024-01-01T00:00:02.000Z',
              quantity: -2,
              price: 2.2,
            });

            await LotModel.update(
              {
                remainingQuantity: Sequelize.literal(
                  `"${LotModel.getAttributes().remainingQuantity.field}" - 2`
                ),
              },
              {
                where: { id: lots[0].id },
              }
            );

            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              portfolioStats: { set: [{ forCurrency: 'USD' }] },
              holdingStats: { set: [lots[0].symbol] },
              lots: { set: [lots[0].id] },
            });
          },

          async () => {
            await TradeRecordModel.create({
              id: mockTradeIds[3],
              ownerId: mockUserId1,
              symbol: 'AAPL',
              performedAt: '2024-01-01T00:00:03.000Z',
              quantity: -2,
              price: 2.4,
            });

            await LotModel.update(
              {
                remainingQuantity: Sequelize.literal(
                  `"${LotModel.getAttributes().remainingQuantity.field}" - 2`
                ),
              },
              {
                where: { id: lots[1].id },
              }
            );

            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              portfolioStats: { set: [{ forCurrency: 'USD' }] },
              holdingStats: { set: [lots[1].symbol] },
              lots: { set: [lots[1].id] },
            });
          },
        ]) {
          await applyNextChanges();
          emissions.push((await subscription.next()).value);
          await setTimeout(0); // a non-ideal workaround to let app a chance to finish reacting and processing the current change before we overwhelm it with the one that follows up next
        }

        expect(emissions).toStrictEqual([
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[1].id,
                    marketValue: 12.5,
                    unrealizedPnl: { amount: 2.5, percent: 25 },
                  },
                },
                {
                  data: {
                    id: lots[0].id,
                    marketValue: 25,
                    unrealizedPnl: { amount: 5, percent: 25 },
                  },
                },
              ],
            },
          },
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[0].id,
                    marketValue: 20,
                    unrealizedPnl: { amount: 4, percent: 25 },
                  },
                },
              ],
            },
          },
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[1].id,
                    marketValue: 7.5,
                    unrealizedPnl: { amount: 1.5, percent: 25 },
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

    it('When targeting closed lots, initial zero data is emitted and further changes in market data do not cause any updates to be emitted', async () => {
      await TradeRecordModel.bulkCreate([
        {
          id: mockTradeIds[0],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:00.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[1],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:01.000Z',
          quantity: 10,
          price: 2,
        },
        {
          id: mockTradeIds[2],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:02.000Z',
          quantity: -10,
          price: 2.2,
        },
      ]);

      const lots = await LotModel.bulkCreate([
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[0],
          symbol: 'ADBE',
          remainingQuantity: 10,
          realizedProfitOrLoss: 0,
          openedAt: '2024-01-01T00:00:00.000Z',
          recordCreatedAt: '2024-01-01T00:00:00.000Z',
          recordUpdatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[1],
          symbol: 'AAPL',
          remainingQuantity: 0,
          realizedProfitOrLoss: 20,
          openedAt: '2024-01-01T00:00:01.000Z',
          recordCreatedAt: '2024-01-01T00:00:01.000Z',
          recordUpdatedAt: '2024-01-01T00:00:02.000Z',
        },
      ]);

      mockMarketDataControl.onConnectionSend([
        {
          ADBE: { regularMarketPrice: 3 },
          AAPL: { regularMarketPrice: 3 },
        },
        {
          ADBE: { regularMarketPrice: 4 },
          AAPL: { regularMarketPrice: 4 },
        },
        {
          ADBE: { regularMarketPrice: 5 },
          AAPL: { regularMarketPrice: 5 },
        },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                ]
              }
            ) {
              data {
                id
                marketValue
                unrealizedPnl {
                  amount
                  percent
                }
              }
            }
          }`,
      });

      await using _ = {
        [Symbol.asyncDispose]: async () => void (await subscription.return!()),
      };

      const emissions = await pipe(subscription, itTake(3), itCollect);

      expect(emissions).toStrictEqual([
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[1].id,
                  marketValue: 0,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
              {
                data: {
                  id: lots[0].id,
                  marketValue: 30,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[0].id,
                  marketValue: 40,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[0].id,
                  marketValue: 50,
                  unrealizedPnl: { amount: 30, percent: 150 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to lot symbols whose market data cannot be found', async () => {
      await TradeRecordModel.bulkCreate([
        {
          id: mockTradeIds[0],
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: '2024-01-01T00:00:00.000Z',
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockTradeIds[1],
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: '2024-01-01T00:00:01.000Z',
          quantity: 2,
          price: 1.2,
        },
        {
          id: mockTradeIds[2],
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: '2024-01-01T00:00:02.000Z',
          quantity: 2,
          price: 1.3,
        },
      ]);

      const lots = await LotModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[0],
          symbol: 'ADBE',
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
          openedAt: '2024-01-01T00:00:00.000Z',
          recordCreatedAt: '2024-01-01T00:00:00.000Z',
          recordUpdatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[1],
          symbol: 'AAPL',
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
          openedAt: '2024-01-01T00:00:01.000Z',
          recordCreatedAt: '2024-01-01T00:00:01.000Z',
          recordUpdatedAt: '2024-01-01T00:00:01.000Z',
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          openingTradeId: mockTradeIds[2],
          symbol: 'NVDA',
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
          openedAt: '2024-01-01T00:00:02.000Z',
          recordCreatedAt: '2024-01-01T00:00:02.000Z',
          recordUpdatedAt: '2024-01-01T00:00:02.000Z',
        },
      ]);

      mockMarketDataControl.onConnectionSend([
        {
          ADBE: { regularMarketPrice: 10 },
          AAPL: null,
          NVDA: null,
        },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                  "${lots[2].id}"
                ]
              }
            ) {
              data {
                id
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
            message: 'Couldn\'t find market data for some symbols: "NVDA", "AAPL"',
            extensions: {
              type: 'SYMBOL_MARKET_DATA_NOT_FOUND',
              details: { symbolsNotFound: ['NVDA', 'AAPL'] },
            },
          },
        ],
      });
    });
  });

  describe('With `unrealized.currencyAdjusted` field', () => {
    it('Emits updates correctly in conjunction with changes to lot symbols currency-adjusted market data', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE', price: 1.1, quantity: 2 },
        { ...reusableTradeDatas[1], symbol: 'AAPL', price: 1.2, quantity: 2 },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE', remainingQuantity: 2 },
        { ...reusableLotDatas[1], symbol: 'AAPL', remainingQuantity: 2 },
      ]);

      mockMarketDataControl.onConnectionSend([
        {
          ['ADBE']: { regularMarketPrice: 1.5 },
          ['AAPL']: { regularMarketPrice: 1.5 },
          ['USDEUR=X']: { regularMarketPrice: 2 },
        },
        {
          ['ADBE']: { regularMarketPrice: 1.6 },
          ['USDEUR=X']: { regularMarketPrice: 2 },
        },
        {
          ['AAPL']: { regularMarketPrice: 1.6 },
          ['USDEUR=X']: { regularMarketPrice: 2 },
        },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            lots (
              filters: {
                ids: [
                  "${lots[0].id}"
                  "${lots[1].id}"
                ]
              }
            ) {
              data {
                id
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

      await using _ = {
        [Symbol.asyncDispose]: async () => void (await subscription.return!()),
      };

      const emissions = await asyncPipe(subscription, itTake(3), itCollect);

      expect(emissions).toStrictEqual([
        {
          data: {
            lots: [
              {
                data: {
                  id: lots[1].id,
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
                  id: lots[0].id,
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
            lots: [
              {
                data: {
                  id: lots[0].id,
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
            lots: [
              {
                data: {
                  id: lots[1].id,
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

    describe('With `priceData` field', () => {
      it('Emits updates correctly in conjunction with incoming market price data changes', async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE' },
          { ...reusableTradeDatas[1], symbol: 'AAPL' },
        ]);
        const lots = await LotModel.bulkCreate([
          { ...reusableLotDatas[0], symbol: 'ADBE' },
          { ...reusableLotDatas[1], symbol: 'AAPL' },
        ]);

        const subscription = gqlWsClient.iterate({
          query: `
            subscription {
              lots (
                filters: {
                  ids: [
                    "${lots[0].id}"
                    "${lots[1].id}"
                  ]
                }
              ) {
                data {
                  id
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

        await using _ = {
          [Symbol.asyncDispose]: async () => void (await subscription.return!()),
        };

        const emissions: any[] = [];

        for (const next of [
          () =>
            mockMarketDataControl.onConnectionSend([
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
            ]),
          () =>
            mockMarketDataControl.onConnectionSend([
              {
                ADBE: {
                  currency: 'USD',
                  marketState: 'CLOSED',
                  regularMarketPrice: 11,
                  regularMarketTime: '2024-01-01T00:00:01.000Z',
                },
              },
            ]),
          () =>
            mockMarketDataControl.onConnectionSend([
              {
                AAPL: {
                  currency: 'USD',
                  marketState: 'PRE',
                  regularMarketPrice: 12,
                  regularMarketTime: '2024-01-01T00:00:02.000Z',
                },
              },
            ]),
        ]) {
          await next();
          emissions.push((await subscription.next()).value);
        }

        expect(emissions).toStrictEqual([
          {
            data: {
              lots: [
                {
                  data: {
                    id: lots[1].id,
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
                    id: lots[0].id,
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
              lots: [
                {
                  data: {
                    id: lots[0].id,
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
              lots: [
                {
                  data: {
                    id: lots[1].id,
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
});
