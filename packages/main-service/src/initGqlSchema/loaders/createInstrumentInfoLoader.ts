import DataLoader from 'dataloader';
import { getInstrumentInfos, type InstrumentInfo } from '../../utils/getInstrumentInfos/index.js';

export { createInstrumentInfoLoader, type InstrumentInfo };

function createInstrumentInfoLoader() {
  return new DataLoader<string, InstrumentInfo>(async symbols => {
    const instrumentInfos = await getInstrumentInfos({ symbols });
    return symbols.map(symbol => instrumentInfos[symbol]);
  });
}
