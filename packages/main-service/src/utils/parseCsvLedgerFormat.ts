import { parse as csvParse } from 'csv-parse/sync';
import { z } from 'zod';

export { parseCsvLedgerFormat, LedgerDataRecord };

function parseCsvLedgerFormat({ input }: { input: string }): LedgerDataRecord[] {
  const parsedRows: Record<string, string>[] = csvParse(input, {
    columns: true,
    skipEmptyLines: true,
  });
  return ibkrTradeDataRecordSchema
    .parse(parsedRows)
    .filter((row): row is LedgerDataRecord => 'symbol' in row);
}

const ibkrStocksTradeRecordSchema = z
  .object({
    ['Header']: z.literal('Data'),
    ['Asset Category']: z.literal('Stocks'),
    ['Symbol']: z.string().trim(),
    ['Date/Time']: z.date({ coerce: true }),
    ['Quantity']: z
      .string()
      .transform(val => val.replace(/,/g, '').trim())
      .pipe(z.number({ coerce: true })), // TODO: Make this not accept zeros as values
    ['T. Price']: z
      .string()
      .transform(val => val.replace(/,/g, '').trim())
      .pipe(z.number({ coerce: true }))
      .transform(Math.abs), // TODO: Make this not accept zeros as values
  })
  .transform(item => ({
    header: item.Header,
    assetCategory: item['Asset Category'],
    symbol: item.Symbol,
    dateAndTime: item['Date/Time'],
    quantity: item.Quantity,
    tPrice: item['T. Price'],
  }));

const ibkrTradeDataRecordSchema = z
  .array(
    z.union([
      ibkrStocksTradeRecordSchema,
      z
        .object({
          ['Header']: z.string(),
          ['Asset Category']: z.string(),
        })
        .transform(item => ({
          header: item.Header,
          assetCategory: item['Asset Category'],
        })),
    ])
  )
  .transform(arr => arr);

type LedgerDataRecord = z.infer<typeof ibkrStocksTradeRecordSchema>;
