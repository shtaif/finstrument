import { map, keyBy, mapValues, compact } from 'lodash-es';
import { Op } from 'sequelize';
import yahooFinance from 'yahoo-finance2';
import { asyncPipe } from 'shared-utils';
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

  // await InstrumentInfoModel.destroy({ where: { symbol: { [Op.in]: normParams.symbols } } });

  const preexistingInstInfos = await asyncPipe(
    InstrumentInfoModel.findAll({
      where: {
        symbol: { [Op.in]: normParams.symbols },
      },
    }),
    infos => map(infos, ({ dataValues }) => dataValues),
    infos => keyBy(infos, ({ symbol }) => symbol)
  );

  const missingInstInfos = normParams.symbols.filter(reqSymbol => !preexistingInstInfos[reqSymbol]);

  const newlyCreatedMissingInstInfos = !missingInstInfos.length
    ? {}
    : await (async () => {
        const micData = await getIso10383MarketIdentifiersData();

        const yahooInfos = await yahooFinance.quote(missingInstInfos, {
          // fields: ['symbol', 'currency', 'exchange', 'fullExchangeName', 'market'],
          return: 'array',
        });

        // TODO: Employ some locking mechanism to prevent case of multiple simultaneous attempts to get fill missing symbol X being unaware they're in a race among themselves, which I temporarily avoid with `InstrumentInfoModel.findOrCreate()` as a compromise...
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

  const resultInstInfos = { ...preexistingInstInfos, ...newlyCreatedMissingInstInfos };

  return mapValues(resultInstInfos, info => ({
    symbol: info.symbol,
    name: info.name,
    currency: info.currency,
    exchangeMic: info.exchangeMic,
    exchangeAcronym: info.exchangeAcronym,
    exchangeFullName: info.exchangeFullName,
    exchangeCountryCode: info.exchangeCountryCode,
    exchangeCountryFlagEmoji: countryCodeToFlagEmoji(info.exchangeCountryCode) ?? null,
    createdAt: info.createdAt,
    updatedAt: info.updatedAt,
  }));
}

type InstrumentInfo = {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchangeMic: string | null;
  exchangeAcronym: string | null;
  exchangeFullName: string | null;
  exchangeCountryCode: string | null;
  exchangeCountryFlagEmoji: string | null;
  createdAt: Date;
  updatedAt: Date;
};
