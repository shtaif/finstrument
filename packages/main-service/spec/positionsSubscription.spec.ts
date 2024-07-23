import { Sequelize } from 'sequelize';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { asyncPipe, pipe } from 'shared-utils';
import { itCollect, itTake, itTakeFirst } from 'iterable-operators';
import {
  InstrumentInfoModel,
  PositionClosingModel,
  PositionModel,
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

const reusablePositionDatas = [
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

  mockGqlContext({
    activeUser: {
      id: mockUserId1,
      alias: mockUserId1,
    },
  });
});

beforeEach(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await Promise.all([
    PositionClosingModel.destroy({ where: {} }),
    PositionModel.destroy({ where: {} }),
  ]);
  mockMarketDataControl.reset();
});

afterAll(async () => {
  await Promise.all([
    PositionClosingModel.destroy({ where: {} }),
    PositionModel.destroy({ where: {} }),
    TradeRecordModel.destroy({ where: {} }),
    InstrumentInfoModel.destroy({ where: {} }),
    UserModel.destroy({ where: {} }),
  ]);
  unmockGqlContext();
});

describe('Subscription.positions ', () => {
  it('Upon subscription immediately emits an initial message with the state of all targeted positions', async () => {
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

    const positions = await PositionModel.bulkCreate([
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
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
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
        positions: [
          {
            data: {
              id: positions[1].id,
              openingTradeId: positions[1].openingTradeId,
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
              id: positions[0].id,
              openingTradeId: positions[0].openingTradeId,
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

  it('If one or more IDs given via the `filters.ids` arg don\'t exist, an "INVALID_POSITION_IDS" error type is emitted', async () => {
    await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[0], symbol: 'ADBE' }]);

    const positions = await PositionModel.bulkCreate([
      { ...reusablePositionDatas[0], symbol: 'ADBE' },
    ]);

    const firstExistingPosId = positions[0].id;
    const secondNonexistingPosId = mockUuidFromNumber(2);
    const thirdNonexistingPosId = mockUuidFromNumber(3);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          positions (
            filters: {
              ids: [
                "${firstExistingPosId}"
                "${secondNonexistingPosId}"
                "${thirdNonexistingPosId}"
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
              `Some of the requested positions could not be found (2 in total):` +
              `\nID "${secondNonexistingPosId}",` +
              `\nID "${thirdNonexistingPosId}"`,
            extensions: {
              type: 'INVALID_POSITION_IDS',
              details: {
                unmatchedPositionsIds: [secondNonexistingPosId, thirdNonexistingPosId],
                positionIdsGiven: [
                  firstExistingPosId,
                  secondNonexistingPosId,
                  thirdNonexistingPosId,
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('Only positions matching the given `filters.ids` arg have updates emitted for', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'ADBE', quantity: 3, price: 1.1 },
      { ...reusableTradeDatas[1], symbol: 'AAPL', quantity: 3, price: 1.1 },
      { ...reusableTradeDatas[2], symbol: 'NVDA', quantity: 3, price: 1.1 },
    ]);

    const positions = await PositionModel.bulkCreate([
      {
        ...reusablePositionDatas[0],
        symbol: 'ADBE',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
      {
        ...reusablePositionDatas[1],
        symbol: 'AAPL',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
      {
        ...reusablePositionDatas[2],
        symbol: 'NVDA',
        remainingQuantity: 3,
        realizedProfitOrLoss: 0,
      },
    ]);

    const subscription = gqlWsClient.iterate({
      query: `
        subscription {
          positions (
            filters: {
              ids: [
                "${positions[0].id}"
                "${positions[1].id}"
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
      await PositionModel.update(
        {
          remainingQuantity: 1,
          realizedProfitOrLoss: 0.2,
        },
        { where: { id: positions[2].id } }
      );
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        portfolioStats: { set: [{ forCurrency: 'USD' }] },
        holdingStats: { set: ['NVDA'] },
        positions: { set: [positions[2].id] },
      });

      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[4], symbol: 'ADBE', quantity: -2, price: 1.2 },
        { ...reusableTradeDatas[5], symbol: 'NVDA', quantity: -2, price: 1.2 },
      ]);
      await PositionModel.update(
        {
          remainingQuantity: 1,
          realizedProfitOrLoss: 0.2,
        },
        {
          where: { id: [positions[0].id, positions[2].id] },
        }
      );
      await publishUserHoldingChangedRedisEvent({
        ownerId: mockUserId1,
        portfolioStats: { set: [{ forCurrency: 'USD' }] },
        holdingStats: { set: ['ADBE', 'NVDA'] },
        positions: { set: [positions[0].id, positions[2].id] },
      });

      emissions.push((await subscription.next()).value);

      expect(emissions).toStrictEqual([
        {
          data: {
            positions: [
              {
                data: {
                  id: positions[1].id,
                  originalQuantity: 3,
                  remainingQuantity: 3,
                  realizedProfitOrLoss: 0,
                },
              },
              {
                data: {
                  id: positions[0].id,
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
            positions: [
              {
                data: {
                  id: positions[0].id,
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

  // it('*** *** *** Some of the requested positions are closed positions (1 in total): ID "10000000-0000-0000-0000-000000000000"', async () => {
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

  //   const positions = await PositionModel.bulkCreate([
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
  //           positions (
  //             filters: {
  //               ids: [
  //                 "${positions[0].id}"
  //                 "${positions[1].id}"
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
    'When targeting only certain fields, only position changes that have any of these ' +
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

      const positions = await PositionModel.bulkCreate([
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
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
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
            [positions[0].symbol]: { regularMarketPrice: 10 },
            [positions[1].symbol]: { regularMarketPrice: 10 },
          },
        ]);

        emissions.push((await subscription.next()).value);

        await TradeRecordModel.create({
          id: mockTradeIds[2],
          ownerId: mockUserId1,
          symbol: positions[0].symbol,
          performedAt: '2024-01-01T00:00:02.000Z',
          quantity: -2,
          price: 1.2,
        });

        await PositionModel.update(
          {
            remainingQuantity: positions[0].remainingQuantity - 2,
          },
          {
            where: { id: positions[0].id },
          }
        );

        await publishUserHoldingChangedRedisEvent({
          ownerId: mockUserId1,
          portfolioStats: { set: [{ forCurrency: 'USD' }] },
          holdingStats: { set: [positions[0].symbol] },
          positions: { set: [positions[0].id] },
        });

        // *** Not expecting an emission here (because the `remainingQuantity` field which was modified wasn't targeted)...

        await mockMarketDataControl.onConnectionSend([
          { [positions[1].symbol]: { regularMarketPrice: 11 } },
        ]);

        emissions.push((await subscription.next()).value);

        expect(emissions).toStrictEqual([
          {
            data: {
              positions: [
                {
                  data: {
                    id: positions[1].id,
                    priceData: {
                      regularMarketPrice: 10,
                    },
                  },
                },
                {
                  data: {
                    id: positions[0].id,
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
              positions: [
                {
                  data: {
                    id: positions[1].id,
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

  describe('With `unrealizedPnl` field', () => {
    it('Emits updates correctly in conjunction with changes to position symbols market data', async () => {
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

      const positions = await PositionModel.bulkCreate([
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

      mockMarketDataControl.onConnectionSend([
        { ADBE: { regularMarketPrice: 3 }, AAPL: { regularMarketPrice: 3 } },
        { ADBE: { regularMarketPrice: 4 } },
        { AAPL: { regularMarketPrice: 4 } },
      ]);

      const emissions = await asyncPipe(
        gqlWsClient.iterate({
          query: `
            subscription {
              positions (
                filters: {
                  ids: [
                    "${positions[0].id}"
                    "${positions[1].id}"
                    "${positions[2].id}"
                    "${positions[3].id}"
                  ]
                }
              ) {
                data {
                  id
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
            positions: [
              {
                data: {
                  id: positions[3].id,
                  unrealizedPnl: { amount: 5, percent: 50 },
                },
              },
              {
                data: {
                  id: positions[2].id,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
              {
                data: {
                  id: positions[1].id,
                  unrealizedPnl: { amount: 5, percent: 50 },
                },
              },
              {
                data: {
                  id: positions[0].id,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            positions: [
              {
                data: {
                  id: positions[1].id,
                  unrealizedPnl: { amount: 10, percent: 100 },
                },
              },
              {
                data: {
                  id: positions[0].id,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
        {
          data: {
            positions: [
              {
                data: {
                  id: positions[3].id,
                  unrealizedPnl: { amount: 10, percent: 100 },
                },
              },
              {
                data: {
                  id: positions[2].id,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
      ]);
    });

    it('Emits updates correctly in conjunction with changes to underlying positions', async () => {
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
      ]);

      const positions = await PositionModel.bulkCreate([
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
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
                ]
              }
            ) {
              data {
                id
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

            await PositionModel.update(
              {
                remainingQuantity: Sequelize.literal(
                  `"${PositionModel.getAttributes().remainingQuantity.field}" - 2`
                ),
              },
              {
                where: { id: positions[0].id },
              }
            );

            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              portfolioStats: { set: [{ forCurrency: 'USD' }] },
              holdingStats: { set: [positions[0].symbol] },
              positions: { set: [positions[0].id] },
            });
          },

          async () => {
            await TradeRecordModel.create({
              id: mockTradeIds[3],
              ownerId: mockUserId1,
              symbol: 'ADBE',
              performedAt: '2024-01-01T00:00:03.000Z',
              quantity: -2,
              price: 2.4,
            });

            await PositionModel.update(
              {
                remainingQuantity: Sequelize.literal(
                  `"${PositionModel.getAttributes().remainingQuantity.field}" - 2`
                ),
              },
              {
                where: { id: positions[1].id },
              }
            );

            await publishUserHoldingChangedRedisEvent({
              ownerId: mockUserId1,
              portfolioStats: { set: [{ forCurrency: 'USD' }] },
              holdingStats: { set: [positions[1].symbol] },
              positions: { set: [positions[1].id] },
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
              positions: [
                {
                  data: {
                    id: positions[1].id,
                    unrealizedPnl: { amount: 2.5, percent: 25 },
                  },
                },
                {
                  data: {
                    id: positions[0].id,
                    unrealizedPnl: { amount: 5, percent: 25 },
                  },
                },
              ],
            },
          },
          {
            data: {
              positions: [
                {
                  data: {
                    id: positions[0].id,
                    unrealizedPnl: { amount: 4, percent: 25 },
                  },
                },
              ],
            },
          },
          {
            data: {
              positions: [
                {
                  data: {
                    id: positions[1].id,
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

    it('When targeting closed positions, initial zero data is emitted and further changes in market data do not cause any updates to be emitted', async () => {
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

      const positions = await PositionModel.bulkCreate([
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
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
                ]
              }
            ) {
              data {
                id
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
            positions: [
              {
                data: {
                  id: positions[1].id,
                  unrealizedPnl: { amount: 0, percent: 0 },
                },
              },
              {
                data: {
                  id: positions[0].id,
                  unrealizedPnl: { amount: 10, percent: 50 },
                },
              },
            ],
          },
        },
        {
          data: {
            positions: [
              {
                data: {
                  id: positions[0].id,
                  unrealizedPnl: { amount: 20, percent: 100 },
                },
              },
            ],
          },
        },
        {
          data: {
            positions: [
              {
                data: {
                  id: positions[0].id,
                  unrealizedPnl: { amount: 30, percent: 150 },
                },
              },
            ],
          },
        },
      ]);
    });
  });

  describe('With `unrealized.currencyAdjusted` field', () => {
    it('Emits updates correctly in conjunction with changes to holding symbols currency-adjusted market data', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE', price: 1.1, quantity: 2 },
        { ...reusableTradeDatas[1], symbol: 'AAPL', price: 1.2, quantity: 2 },
      ]);
      const positions = await PositionModel.bulkCreate([
        { ...reusablePositionDatas[0], symbol: 'ADBE', remainingQuantity: 2 },
        { ...reusablePositionDatas[1], symbol: 'AAPL', remainingQuantity: 2 },
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
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
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
            positions: [
              {
                data: {
                  id: positions[1].id,
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
                  id: positions[0].id,
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
            positions: [
              {
                data: {
                  id: positions[0].id,
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
            positions: [
              {
                data: {
                  id: positions[1].id,
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

  describe('With `priceData` field', () => {
    it('Emits updates correctly in conjunction with incoming market price data changes', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
      ]);
      const positions = await PositionModel.bulkCreate([
        { ...reusablePositionDatas[0], symbol: 'ADBE' },
        { ...reusablePositionDatas[1], symbol: 'AAPL' },
      ]);

      const subscription = gqlWsClient.iterate({
        query: `
          subscription {
            positions (
              filters: {
                ids: [
                  "${positions[0].id}"
                  "${positions[1].id}"
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
            positions: [
              {
                data: {
                  id: positions[1].id,
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
                  id: positions[0].id,
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
            positions: [
              {
                data: {
                  id: positions[0].id,
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
            positions: [
              {
                data: {
                  id: positions[1].id,
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
