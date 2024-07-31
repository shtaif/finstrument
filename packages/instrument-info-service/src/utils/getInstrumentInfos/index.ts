import { readFile } from 'node:fs/promises';
import { differenceWith, keyBy, mapValues } from 'lodash-es';
import { Op } from 'sequelize';
import yahooFinance from 'yahoo-finance2';
import { pipe } from 'shared-utils';
import { z } from 'zod';
import { parse as csvParse } from 'csv-parse/sync';
import { InstrumentInfoModel } from '../../db/index.js';
import { countryCodeToFlagEmoji } from '../countryCodeToFlagEmoji.js';

export { getInstrumentInfos, type InstrumentInfo };

async function getInstrumentInfos(params: { symbols: string[] }): Promise<{
  [symbol: string]: InstrumentInfo;
}> {
  const normParams = {
    symbols: params.symbols.map(symbol => symbol.trim().toUpperCase()),
  };

  await InstrumentInfoModel.destroy({ where: { symbol: { [Op.in]: normParams.symbols } } }).catch(
    err => {
      throw err;
    }
  );

  const instInfos = pipe(
    await InstrumentInfoModel.findAll({
      where: {
        symbol: { [Op.in]: normParams.symbols },
      },
    }),
    infos => infos.map(({ dataValues }) => dataValues),
    infos => keyBy(infos, ({ symbol }) => symbol)
  );

  const missingSymbolsInfos = differenceWith(
    normParams.symbols,
    Object.keys(instInfos),
    (requestedSymbol, existingInstrumentSymbol) => requestedSymbol === existingInstrumentSymbol
  );

  if (missingSymbolsInfos.length) {
    const fetchedInfos = await yahooFinance.quote(missingSymbolsInfos, {
      // fields: ['symbol', 'currency', 'exchange', 'fullExchangeName', 'market'],
      return: 'array',
    });

    const micData = parseCsvMicDataset(
      await readFile(`${__dirname}/../../iso10383-market-identifiers-data.csv`, 'utf-8')
    );

    // TODO: Employ some locking mechanism to prevent case of multiple simultaneous attempts to get fill missing symbol X being unaware they're in a race among themselves, which I temporarily avoid with `InstrumentInfoModel.findOrCreate()` as a compromise...
    const newlyCreatedInstrumentInfos = pipe(
      await Promise.all(
        fetchedInfos.map(async info => {
          const normalizedMicFromYahoo = `${info.exchange.length < 4 ? 'X' : ''}${info.exchange}`;
          const matchingMicExchangeData = micData.find(({ mic }) => mic === normalizedMicFromYahoo);
          const [instance] = await InstrumentInfoModel.findOrCreate({
            where: {
              symbol: info.symbol,
            },
            defaults: {
              symbol: info.symbol,
              name: info.longName || info.longName || '',
              // name: info.shortName,
              currency: info.currency,
              exchangeMic: matchingMicExchangeData!.mic,
              // exchangeFullName: info.fullExchangeName,
              // exchangeCountryCode: info.market.slice(0, 2).toUpperCase(),
              exchangeAcronym: matchingMicExchangeData?.acronym,
              exchangeFullName: matchingMicExchangeData?.marketNameInstitutionDescription,
              exchangeCountryCode: matchingMicExchangeData?.iso3166CountryCode,
            },
          });
          return instance;
        })
      ),
      infos => infos.map(({ dataValues }) => dataValues),
      infos => keyBy(infos, ({ symbol }) => symbol)
    );

    Object.assign(instInfos, newlyCreatedInstrumentInfos);
  }

  return mapValues(instInfos, info => ({
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
  currency: string | null;
  exchangeMic: string;
  exchangeAcronym: string | null;
  exchangeFullName: string | null;
  exchangeCountryCode: string | null;
  exchangeCountryFlagEmoji: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseCsvMicDataset(input: string): MicDatasetRecord[] {
  const parsedRows: Record<string, string>[] = csvParse(input, {
    columns: true,
    skipEmptyLines: true,
  });
  return micDataSetSchema.parse(parsedRows);
}

const micDataSetSchema = z.array(
  z
    .object({
      ['MIC']: z.string().length(4),
      ['OPERATING MIC']: z.string().length(4),
      ['OPRT/SGMT']: z.enum(['OPRT', 'SGMT']),
      ['MARKET NAME-INSTITUTION DESCRIPTION']: z.string().min(1),
      ['LEGAL ENTITY NAME']: z.string().optional(),
      ['LEI']: z.string().optional(),
      ['MARKET CATEGORY CODE']: z.string().min(1),
      ['ACRONYM']: z.string().optional(),
      ['ISO COUNTRY CODE (ISO 3166)']: z.string().length(2),
      ['CITY']: z.string().min(1),
      ['WEBSITE']: z.string().optional(),
      ['STATUS']: z.enum(['ACTIVE', 'UPDATED', 'EXPIRED']),
      ['CREATION DATE']: z.string().transform(parseNonHyphenedDateString),
      ['LAST UPDATE DATE']: z.string().transform(parseNonHyphenedDateString),
      ['LAST VALIDATION DATE']: z.string().transform(parseNonHyphenedDateString),
      ['EXPIRY DATE']: z.string().transform(parseNonHyphenedDateString),
      ['COMMENTS']: z.string().optional(),
    })
    .transform(rec => ({
      mic: rec['MIC'],
      operatingMic: rec['OPERATING MIC'],
      micType: rec['OPRT/SGMT'],
      marketNameInstitutionDescription: rec['MARKET NAME-INSTITUTION DESCRIPTION'],
      legalEntityName: rec['LEGAL ENTITY NAME'],
      lei: rec['LEI'],
      marketCategoryCode: rec['MARKET CATEGORY CODE'],
      acronym: rec['ACRONYM'],
      iso3166CountryCode: rec['ISO COUNTRY CODE (ISO 3166)'],
      city: rec['CITY'],
      website: rec['WEBSITE'],
      status: rec['STATUS'],
      creationDate: rec['CREATION DATE'],
      lastUpdateDate: rec['LAST UPDATE DATE'],
      lastValidationDate: rec['LAST VALIDATION DATE'],
      expiryDate: rec['EXPIRY DATE'],
      comments: rec['COMMENTS'],
    }))
);

function parseNonHyphenedDateString(dateStr: string): Date {
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return new Date(`${year}-${month}-${day}`);
}

type MicDatasetRecord = z.infer<typeof micDataSetSchema>[0];
