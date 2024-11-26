export { reactAsyncIterSpecialInfoSymbol, type ReactAsyncIterSpecialInfo };

const reactAsyncIterSpecialInfoSymbol = Symbol('reactAsyncIterSpecialInfoSymbol');

type ReactAsyncIterSpecialInfo<TFormatInput, TFormatOutput> = {
  origPreformattedSource: AsyncIterable<TFormatInput>;
  formatFn(value: TFormatInput, i: number): TFormatOutput;
};
