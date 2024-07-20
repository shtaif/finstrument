import { uniq } from 'lodash';
import axios from 'axios';
import { env } from '../../env.js';

export { getInstrumentInfos, type InstrumentInfo };

async function getInstrumentInfos(params: { symbols: readonly string[] }): Promise<{
  [symbol: string]: InstrumentInfo;
}> {
  const paramsNorm = {
    symbols: uniq(params.symbols),
  };

  if (!paramsNorm.symbols.length) {
    return {};
  }

  const resp = await axios<GetInstrumentInfoEndpointRespose>({
    url: `${env.INSTRUMENT_INFO_SERVICE_URL}/api/instrument-info`,
    params: {
      symbols: paramsNorm.symbols,
    },
  });

  const instrumentInfos = resp.data.instrumentInfos;

  return instrumentInfos;
}

type GetInstrumentInfoEndpointRespose = {
  instrumentInfos: {
    [symbol: string]: InstrumentInfo;
  };
};

type InstrumentInfo = {
  exchangeMic: string;
  exchangeAcronym: string | null;
  exchangeFullName: string | null;
  exchangeCountryCode: string | null;
  currency: string | null;
  createdAt: Date;
  updatedAt: Date;
};
