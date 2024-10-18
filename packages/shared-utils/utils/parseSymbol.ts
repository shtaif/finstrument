export { parseSymbol, type ParsedSymbol };

function parseSymbol(symbol: string): ParsedSymbol {
  const [baseInstrumentSymbol, currencyOverride] = symbol.trim().split(':');
  return {
    normalizedFullSymbol: `${baseInstrumentSymbol}${!currencyOverride ? `` : `:${currencyOverride}`}`,
    baseInstrumentSymbol,
    currencyOverride: currencyOverride || undefined,
  };
}

type ParsedSymbol = {
  normalizedFullSymbol: string;
  baseInstrumentSymbol: string;
  currencyOverride: string | undefined;
};
