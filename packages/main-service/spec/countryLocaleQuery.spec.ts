import { afterAll, beforeAll, expect, it, describe } from 'vitest';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { axiosGqlClient } from './utils/axiosGqlClient.js';

beforeAll(async () => {
  mockGqlContext(ctx => ({
    ...ctx,
    getSession: () => ({ activeUserId: undefined }),
  }));
});

afterAll(async () => {
  unmockGqlContext();
});

describe('◦◦ Query.countryLocale', () => {
  it('When given a non-recognized ISO 3166 country code responds with `null`', async () => {
    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            countryLocale(countryCode: "XYZ") {
              alpha2
              alpha3
              name
              locales
              defaultLocale
              currencyCode
              currencyName
              languages
              capital
              continent
              region
              alternateNames
              latitude
              longitude
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        countryLocale: null,
      },
    });
  });

  it('When given a non-valid ISO 3166 country code responds with `null`', async () => {
    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            countryLocale(countryCode: "SEYCHELLES") {
              alpha2
              alpha3
              name
              locales
              defaultLocale
              currencyCode
              currencyName
              languages
              capital
              continent
              region
              alternateNames
              latitude
              longitude
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        countryLocale: null,
      },
    });
  });

  it('When given a recognized ISO 3166 alpha-2 code responds with the correct country locale information', async () => {
    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            countryLocale(countryCode: "SC") {
              alpha2
              alpha3
              name
              locales
              defaultLocale
              currencyCode
              currencyName
              languages
              capital
              continent
              region
              alternateNames
              latitude
              longitude
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        countryLocale: {
          alpha2: 'SC',
          alpha3: 'SYC',
          name: 'Seychelles',
          alternateNames: [],
          locales: ['fr'],
          defaultLocale: 'fr',
          currencyCode: 'SCR',
          currencyName: 'Seychelles Rupee',
          capital: 'Victoria',
          region: 'Indian Ocean',
          continent: 'Africa',
          languages: ['fr', 'en'],
          latitude: -4.679574,
          longitude: 55.491977,
        },
      },
    });
  });

  it('When given a recognized ISO 3166 alpha-3 code responds with the correct country locale information', async () => {
    const resp = await axiosGqlClient({
      data: {
        query: /* GraphQL */ `
          {
            countryLocale(countryCode: "SYC") {
              alpha2
              alpha3
              name
              locales
              defaultLocale
              currencyCode
              currencyName
              languages
              capital
              continent
              region
              alternateNames
              latitude
              longitude
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        countryLocale: {
          alpha2: 'SC',
          alpha3: 'SYC',
          name: 'Seychelles',
          alternateNames: [],
          locales: ['fr'],
          defaultLocale: 'fr',
          currencyCode: 'SCR',
          currencyName: 'Seychelles Rupee',
          capital: 'Victoria',
          region: 'Indian Ocean',
          continent: 'Africa',
          languages: ['fr', 'en'],
          latitude: -4.679574,
          longitude: 55.491977,
        },
      },
    });
  });
});
