import { afterAll, beforeAll, expect, it, describe } from 'vitest';
import { UserModel } from '../src/db/index.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { axiosGqlClient } from './utils/axiosGqlClient.js';

const [mockUserId1, mockUserId2] = [mockUuidFromNumber(1), mockUuidFromNumber(2)];

const [mockUser1, mockUser2] = [
  { id: mockUserId1, alias: `${mockUserId1}_alias` },
  { id: mockUserId2, alias: `${mockUserId2}_alias` },
] as const;

beforeAll(async () => {
  await Promise.all([
    UserModel.bulkCreate([
      { id: mockUser1.id, alias: mockUser1.alias },
      { id: mockUser2.id, alias: mockUser2.alias },
    ]),
  ]);
});

afterAll(async () => {
  await Promise.all([UserModel.destroy({ where: {} })]);
  unmockGqlContext();
});

describe('Query.me ', () => {
  it('For a non-authenticated caller returns a `null` `user` field', async () => {
    mockGqlContext(ctx => ({
      ...ctx,
      getSession: () => ({ activeUserId: undefined }),
    }));

    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            me {
              user {
                id
                alias
              }
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        me: { user: null },
      },
    });
  });

  it('For an authenticated caller returns a full user object', async () => {
    mockGqlContext(ctx => ({
      ...ctx,
      getSession: async () => ({ activeUserId: mockUserId1 }),
    }));

    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            me {
              user {
                id
                alias
              }
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        me: {
          user: {
            id: mockUser1.id,
            alias: mockUser1.alias,
          },
        },
      },
    });
  });
});
