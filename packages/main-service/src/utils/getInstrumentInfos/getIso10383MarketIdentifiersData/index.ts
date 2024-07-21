import { keyBy } from 'lodash';
import { z } from 'zod';
import { parse as csvParse } from 'csv-parse/sync';
import { pipe } from 'shared-utils';

export { getIso10383MarketIdentifiersData, type MicDatasetRecord };

async function getIso10383MarketIdentifiersData(): Promise<{ [mic: string]: MicDatasetRecord }> {
  entireMicDatasetPromise ??= (async () => {
    return pipe(
      await import('./iso10383-market-identifiers-data-csv.js'),
      mod => parseCsvMicDataset(mod.iso10383marketIdentifiersDataCsv),
      micDatasetArr => keyBy(micDatasetArr, ({ mic }) => mic)
    );
  })();
  return entireMicDatasetPromise;
}

let entireMicDatasetPromise: Promise<{ [mic: string]: MicDatasetRecord }> | undefined;

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
