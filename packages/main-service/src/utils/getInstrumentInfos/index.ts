import { map, keyBy, compact } from 'lodash-es';
import { Op } from 'sequelize';
import yahooFinance from 'yahoo-finance2';
import { asyncPipe, objectFromEntriesTyped, parseSymbol, pipe } from 'shared-utils';
import { InstrumentInfoModel } from '../../db/index.js';
import { getIso10383MarketIdentifiersData } from './getIso10383MarketIdentifiersData/index.js';
import { countryCodeToFlagEmoji } from './countryCodeToFlagEmoji.js';

export { getInstrumentInfos, type InstrumentInfo };

async function getInstrumentInfos(params: { symbols: readonly string[] }): Promise<{
  [symbol: string]: InstrumentInfo;
}> {
  const normParams = {
    symbols: params.symbols.map(symbol => symbol.trim().toUpperCase()),
  };

  const givenSymbolsParsed = normParams.symbols.map(s => parseSymbol(s));

  const preexistingInstInfos = await asyncPipe(
    InstrumentInfoModel.findAll({
      where: {
        symbol: { [Op.in]: givenSymbolsParsed.map(s => s.baseInstrumentSymbol) },
      },
    }),
    $ => map($, ({ dataValues }) => dataValues),
    $ => keyBy($, ({ symbol }) => symbol)
  );

  const symbolsMissingInstInfos = givenSymbolsParsed.filter(
    s => !preexistingInstInfos[s.baseInstrumentSymbol]
  );

  const newlyCreatedMissingInstInfos = !symbolsMissingInstInfos.length
    ? {}
    : await (async () => {
        const micData = await getIso10383MarketIdentifiersData();

        const yahooInfos = await asyncPipe(
          symbolsMissingInstInfos.map(s => s.baseInstrumentSymbol),
          symbols =>
            yahooFinance.quote(symbols, {
              return: 'array',
              // fields: ['symbol', 'currency', 'exchange', 'fullExchangeName', 'market'],
            })
        );

        // TODO: Should employ some locking mechanism to prevent case of multiple simultaneous attempts to fill in some missing symbol X all being unaware they're in a race among themselves, which I've avoided with `InstrumentInfoModel.findOrCreate()` as a compromise for the time being...
        return await asyncPipe(
          Promise.all(
            yahooInfos.map(async yahooInfo => {
              const yahooNormalizedMic = `${yahooInfo.exchange.length < 4 ? 'X' : ''}${yahooInfo.exchange}`;
              const matchingMicExchangeData = micData[yahooNormalizedMic];
              const [instance] = await InstrumentInfoModel.findOrCreate({
                where: {
                  symbol: yahooInfo.symbol,
                },
                defaults: {
                  symbol: yahooInfo.symbol,
                  name: yahooInfo.longName,
                  currency: yahooInfo.currency,
                  exchangeMic: matchingMicExchangeData?.mic,
                  exchangeAcronym: matchingMicExchangeData?.acronym,
                  // exchangeFullName: yahooInfo.fullExchangeName,
                  // exchangeCountryCode: yahooInfo.market.slice(0, 2).toUpperCase(),
                  exchangeFullName: matchingMicExchangeData?.marketNameInstitutionDescription,
                  exchangeCountryCode: matchingMicExchangeData?.iso3166CountryCode,
                },
              });
              return instance;
            })
          ),
          newInstInfos => compact(newInstInfos),
          newInstInfos => map(newInstInfos, ({ dataValues }) => dataValues),
          newInstInfos => keyBy(newInstInfos, ({ symbol }) => symbol)
        );
      })();

  return pipe(
    givenSymbolsParsed.map(s => {
      const instrument =
        preexistingInstInfos[s.baseInstrumentSymbol] ??
        newlyCreatedMissingInstInfos[s.baseInstrumentSymbol];

      return {
        symbol: s.normalizedFullSymbol,
        baseInstrumentSymbol: instrument.symbol,
        name: instrument.name,
        currency: s.currencyOverride ?? instrument.currency ?? null,
        baseInstrumentCurrency: instrument.currency,
        exchangeMic: instrument.exchangeMic,
        exchangeAcronym: instrument.exchangeAcronym,
        exchangeFullName: instrument.exchangeFullName,
        exchangeCountryCode: instrument.exchangeCountryCode,
        exchangeCountryFlagEmoji: countryCodeToFlagEmoji(instrument.exchangeCountryCode) ?? null,
        createdAt: instrument.createdAt,
        updatedAt: instrument.updatedAt,
      };
    }),
    $ => $.map(info => [info.symbol, info] as const),
    $ => objectFromEntriesTyped($)
  );
}

type InstrumentInfo = {
  symbol: string;
  baseInstrumentSymbol: string;
  name: string | null;
  currency: string | null;
  baseInstrumentCurrency: string | null;
  exchangeMic: string | null;
  exchangeAcronym: string | null;
  exchangeFullName: string | null;
  exchangeCountryCode: string | null;
  exchangeCountryFlagEmoji: string | null;
  createdAt: Date;
  updatedAt: Date;
};
