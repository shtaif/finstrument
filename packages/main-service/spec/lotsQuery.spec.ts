import { afterAll, beforeEach, beforeAll, expect, it, describe } from 'vitest';
import { InstrumentInfoModel, LotModel, TradeRecordModel, UserModel } from '../src/db/index.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { axiosGqlClient } from './utils/axiosGqlClient.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { mockMarketDataControl } from './utils/mockMarketDataService.js';

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
  {
    id: mockUuidFromNumber(3),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[2],
    symbol: 'NVDA',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: '2024-01-01T00:00:02.000Z',
    recordCreatedAt: '2024-01-01T00:00:02.000Z',
    recordUpdatedAt: '2024-01-01T00:00:02.000Z',
  },
  {
    id: mockUuidFromNumber(4),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[3],
    symbol: 'NVDA',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: '2024-01-01T00:00:03.000Z',
    recordCreatedAt: '2024-01-01T00:00:03.000Z',
    recordUpdatedAt: '2024-01-01T00:00:03.000Z',
  },
  {
    id: mockUuidFromNumber(5),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[4],
    symbol: 'NVDA',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: '2024-01-01T00:00:04.000Z',
    recordCreatedAt: '2024-01-01T00:00:04.000Z',
    recordUpdatedAt: '2024-01-01T00:00:04.000Z',
  },
  {
    id: mockUuidFromNumber(6),
    ownerId: mockUserId1,
    openingTradeId: mockTradeIds[5],
    symbol: 'NVDA',
    remainingQuantity: 10,
    realizedProfitOrLoss: 0,
    openedAt: '2024-01-01T00:00:05.000Z',
    recordCreatedAt: '2024-01-01T00:00:05.000Z',
    recordUpdatedAt: '2024-01-01T00:00:05.000Z',
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
  await Promise.all([LotModel.destroy({ where: {} }), TradeRecordModel.destroy({ where: {} })]);
  mockMarketDataControl.reset();
});

afterAll(async () => {
  await Promise.all([
    LotModel.destroy({ where: {} }),
    TradeRecordModel.destroy({ where: {} }),
    InstrumentInfoModel.destroy({ where: {} }),
    UserModel.destroy({ where: {} }),
  ]);

  unmockGqlContext();
});

describe('Query.lots', () => {
  it('Retrieves all basic lot fields correctly', async () => {
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

    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            lots {
              id
              ownerId
              openingTradeId
              symbol
              remainingQuantity
              realizedProfitOrLoss
              openedAt
              recordCreatedAt
              recordUpdatedAt
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        lots: [
          {
            id: lots[1].id,
            openingTradeId: mockTradeIds[1],
            ownerId: mockUserId1,
            symbol: 'AAPL',
            openedAt: '2024-01-01T00:00:01.000Z',
            recordCreatedAt: '2024-01-01T00:00:01.000Z',
            recordUpdatedAt: '2024-01-01T00:00:02.000Z',
            remainingQuantity: 0,
            realizedProfitOrLoss: 20,
          },
          {
            id: lots[0].id,
            openingTradeId: mockTradeIds[0],
            ownerId: mockUserId1,
            symbol: 'ADBE',
            openedAt: '2024-01-01T00:00:00.000Z',
            recordCreatedAt: '2024-01-01T00:00:00.000Z',
            recordUpdatedAt: '2024-01-01T00:00:00.000Z',
            remainingQuantity: 10,
            realizedProfitOrLoss: 0,
          },
        ],
      },
    });
  });

  it('When user has no lots, gracefully retrieves an empty array', async () => {
    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            lots {
              id
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({ data: { lots: [] } });
  });

  it('Retrieves only lots owned by the requesting user', async () => {
    await TradeRecordModel.bulkCreate([
      { ...reusableTradeDatas[0], symbol: 'ADBE', ownerId: mockUserId1 },
      { ...reusableTradeDatas[1], symbol: 'AAPL', ownerId: mockUserId2 },
      { ...reusableTradeDatas[2], symbol: 'NVDA', ownerId: mockUserId1 },
    ]);
    const lots = await LotModel.bulkCreate([
      { ...reusableLotDatas[0], symbol: 'ADBE', ownerId: mockUserId1 },
      { ...reusableLotDatas[1], symbol: 'AAPL', ownerId: mockUserId2 },
      { ...reusableLotDatas[2], symbol: 'NVDA', ownerId: mockUserId1 },
    ]);

    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            lots {
              id
              ownerId
              symbol
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        lots: [
          { id: lots[2].id, ownerId: mockUserId1, symbol: 'NVDA' },
          { id: lots[0].id, ownerId: mockUserId1, symbol: 'ADBE' },
        ],
      },
    });
  });

  describe('With the `filters.ids` arg', () => {
    it('Specifying IDs of existing lots retrieves only those matching', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
        { ...reusableTradeDatas[2], symbol: 'NVDA' },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE' },
        { ...reusableLotDatas[1], symbol: 'AAPL' },
        { ...reusableLotDatas[2], symbol: 'NVDA' },
      ]);

      const resp = await axiosGqlClient({
        data: {
          query: /* GraphQL */ `{
            lots (
              filters: {
                ids: [
                  "${lots[1].id}"
                  "${lots[2].id}"
                ]
              }
            ) {
              id
              symbol
            }
          }`,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          lots: [
            { id: lots[2].id, symbol: 'NVDA' },
            { id: lots[1].id, symbol: 'AAPL' },
          ],
        },
      });
    });

    it(
      'Specifying IDs of which some have no match will only retrieve lots that ' +
        'do exist and match',
      async () => {
        await TradeRecordModel.bulkCreate([{ ...reusableTradeDatas[0], symbol: 'ADBE' }]);
        const lots = await LotModel.bulkCreate([{ ...reusableLotDatas[0], symbol: 'ADBE' }]);

        const resp = await axiosGqlClient({
          data: {
            variables: {
              ids: [lots[0].id, mockUuidFromNumber(1), mockUuidFromNumber(2)],
            },
            query: `
              query ($ids: [ID!]!) {
                lots (
                  filters: { ids: $ids }
                ) {
                  id
                  symbol
                }
              }`,
          },
        });

        expect(resp.data).toStrictEqual({
          data: {
            lots: [{ id: lots[0].id, symbol: 'ADBE' }],
          },
        });
      }
    );

    it(
      'Specifying IDs of which some are not owned by the requestor will retrieve only ' +
        'the ones which do belong to the them',
      async () => {
        await TradeRecordModel.bulkCreate([
          { ...reusableTradeDatas[0], symbol: 'ADBE', ownerId: mockUserId1 },
          { ...reusableTradeDatas[1], symbol: 'AAPL', ownerId: mockUserId2 },
          { ...reusableTradeDatas[2], symbol: 'NVDA', ownerId: mockUserId1 },
        ]);
        const lots = await LotModel.bulkCreate([
          { ...reusableLotDatas[0], symbol: 'ADBE', ownerId: mockUserId1 },
          { ...reusableLotDatas[1], symbol: 'AAPL', ownerId: mockUserId2 },
          { ...reusableLotDatas[2], symbol: 'NVDA', ownerId: mockUserId1 },
        ]);

        const resp = await axiosGqlClient({
          data: {
            variables: {
              ids: [lots[0].id, lots[1].id, lots[2].id],
            },
            query: `
              query ($ids: [ID!]!) {
                lots (
                  filters: { ids: $ids }
                ) {
                  id
                  symbol
                }
            }`,
          },
        });

        expect(resp.data).toStrictEqual({
          data: {
            lots: [
              { id: lots[2].id, symbol: 'NVDA' },
              { id: lots[0].id, symbol: 'ADBE' },
            ],
          },
        });
      }
    );
  });

  describe('With the `filters.symbols` arg', () => {
    it('Specifying symbols will retrieve any owned lots matching those symbols', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'ADBE' },
        { ...reusableTradeDatas[2], symbol: 'AAPL' },
        { ...reusableTradeDatas[3], symbol: 'AAPL' },
        { ...reusableTradeDatas[4], symbol: 'NVDA' },
        { ...reusableTradeDatas[5], symbol: 'NVDA' },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE' },
        { ...reusableLotDatas[1], symbol: 'ADBE' },
        { ...reusableLotDatas[2], symbol: 'AAPL' },
        { ...reusableLotDatas[3], symbol: 'AAPL' },
        { ...reusableLotDatas[4], symbol: 'NVDA' },
        { ...reusableLotDatas[5], symbol: 'NVDA' },
      ]);

      const resp = await axiosGqlClient({
        data: {
          query: /* GraphQL */ `
            {
              lots(filters: { symbols: ["AAPL", "NVDA", "NON_EXISTENT_SYMBOL"] }) {
                id
                symbol
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          lots: [
            { id: lots[5].id, symbol: 'NVDA' },
            { id: lots[4].id, symbol: 'NVDA' },
            { id: lots[3].id, symbol: 'AAPL' },
            { id: lots[2].id, symbol: 'AAPL' },
          ],
        },
      });
    });
  });

  describe('With `unrealizedPnl` field', () => {
    it('Retrieves lots with unrealized P&L correctly calculated', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE' },
        { ...reusableLotDatas[1], symbol: 'AAPL' },
      ]);

      mockMarketDataControl.onConnectionSend([
        {
          ADBE: { regularMarketPrice: 11 },
          AAPL: { regularMarketPrice: 12 },
        },
      ]);

      const resp = await axiosGqlClient({
        data: {
          query: /* GraphQL */ `
            {
              lots {
                id
                symbol
                unrealizedPnl {
                  amount
                  percent
                  # currencyAdjusted {
                  # currency
                  # exchangeRate
                  # amount
                  # }
                }
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          lots: [
            {
              id: lots[1].id,
              symbol: 'AAPL',
              unrealizedPnl: { amount: 109, percent: 990.909090909091 },
            },
            {
              id: lots[0].id,
              symbol: 'ADBE',
              unrealizedPnl: { amount: 99, percent: 900 },
            },
          ],
        },
      });
    });
  });

  describe('With `priceData` field', () => {
    it('Retrieves lots with correct `priceData` details', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE' },
        { ...reusableLotDatas[1], symbol: 'AAPL' },
      ]);

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
            marketState: 'CLOSED',
            regularMarketPrice: 11,
            regularMarketTime: '2024-01-01T00:00:01.000Z',
          },
        },
      ]);

      const resp = await axiosGqlClient({
        data: {
          query: /* GraphQL */ `
            {
              lots {
                id
                symbol
                priceData {
                  currency
                  marketState
                  regularMarketTime
                  regularMarketPrice
                }
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          lots: [
            {
              id: lots[1].id,
              symbol: 'AAPL',
              priceData: {
                currency: 'USD',
                marketState: 'CLOSED',
                regularMarketPrice: 11,
                regularMarketTime: '2024-01-01T00:00:01.000Z',
              },
            },
            {
              id: lots[0].id,
              symbol: 'ADBE',
              priceData: {
                currency: 'USD',
                marketState: 'REGULAR',
                regularMarketPrice: 10,
                regularMarketTime: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        },
      });
    });
  });

  describe('With `instrument` field', () => {
    it('************** Retrieves...', async () => {
      await TradeRecordModel.bulkCreate([
        { ...reusableTradeDatas[0], symbol: 'ADBE' },
        { ...reusableTradeDatas[1], symbol: 'AAPL' },
      ]);
      const lots = await LotModel.bulkCreate([
        { ...reusableLotDatas[0], symbol: 'ADBE' },
        { ...reusableLotDatas[1], symbol: 'AAPL' },
      ]);

      const resp = await axiosGqlClient({
        data: {
          query: /* GraphQL */ `
            {
              lots {
                id
                symbol
                instrument {
                  symbol
                  name
                  currency
                }
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          lots: [
            {
              id: lots[1].id,
              symbol: 'AAPL',
              instrument: {
                symbol: 'AAPL',
                name: 'Apple Inc',
                currency: 'USD',
              },
            },
            {
              id: lots[0].id,
              symbol: 'ADBE',
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
  });
});
