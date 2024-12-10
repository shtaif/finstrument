import { type Resolvers } from '../../../generated/graphql-schema.d.js';

export { resolvers };

const resolvers = {
  Query: {
    countryLocale: async (_, args) => {
      const { getCountryByAlpha2, getCountryByAlpha3 } = await import('country-locale-map');

      const country = (() => {
        switch (args.countryCode.length) {
          case 2: {
            return getCountryByAlpha2(args.countryCode);
          }
          case 3: {
            return getCountryByAlpha3(args.countryCode);
          }
        }
      })();

      return !country
        ? null
        : {
            alpha2: country.alpha2,
            alpha3: country.alpha3,
            name: country.name,
            locales: country.locales,
            defaultLocale: country.default_locale,
            currencyCode: country.currency,
            currencyName: country.currency_name,
            languages: country.languages,
            capital: country.capital,
            continent: country.continent,
            region: country.region,
            alternateNames: country.alternate_names ?? [],
            latitude: country.latitude,
            longitude: country.longitude,
          };
    },
  },
} satisfies Resolvers;
