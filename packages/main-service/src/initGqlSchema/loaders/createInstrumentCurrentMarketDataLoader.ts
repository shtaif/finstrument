import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import { marketDataService, type UpdatedSymbolPrice } from '../../utils/marketDataService/index.js';

export { createInstrumentCurrentMarketDataLoader, type UpdatedSymbolPrice };

function createInstrumentCurrentMarketDataLoader(): DataLoader<
  string,
  UpdatedSymbolPrice | undefined
> {
  return new DataLoader(async symbols => {
    const instMarketDatas = (await pipe(
      marketDataService.observeMarketData({ symbols }),
      itTakeFirst()
    ))!;
    return symbols.map(symbol => instMarketDatas[symbol] ?? undefined);
  });
}
