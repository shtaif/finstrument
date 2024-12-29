import { graphql } from '../../../generated/gql/index.ts';
import { gqlClient } from '../../../utils/gqlClient/index.ts';

export { getCurrentPortfolioCurrencySetting };

function getCurrentPortfolioCurrencySetting(): string | Promise<string> {
  const portfolioCurrencyStoredSetting = (() => {
    const currency = window.localStorage.getItem('portfolio_currency');
    return currency === null ? undefined : (JSON.parse(currency) as string);
  })();
  if (portfolioCurrencyStoredSetting) {
    return portfolioCurrencyStoredSetting;
  }
  const localeCode = navigator.languages.at(0)?.split('-')[1];
  if (!localeCode) {
    return 'USD';
  }
  return (async () => {
    const curr = (await resolveCurrencyByLocale(localeCode)) ?? 'USD';
    window.localStorage.setItem('portfolio_currency', JSON.stringify(curr));
    return curr;
  })();
}

async function resolveCurrencyByLocale(localeCode: string): Promise<string | undefined> {
  const translatedCurrencyCode = (
    await gqlClient.query({
      variables: { countryCode: localeCode },
      query: countryLocaleCurrencyQuery,
    })
  ).data.countryLocale?.currencyCode;
  if (translatedCurrencyCode) {
    return translatedCurrencyCode;
  }
}

const countryLocaleCurrencyQuery = graphql(/* GraphQL */ `
  query CountryLocaleCurrencyQuery($countryCode: ID!) {
    countryLocale(countryCode: $countryCode) {
      currencyCode
    }
  }
`);
