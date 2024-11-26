import { iterableSimpleMap } from '../utils/iterableSimpleMap.js';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue.js';
import {
  reactAsyncIterSpecialInfoSymbol,
  type ReactAsyncIterSpecialInfo,
} from '../common/reactAsyncIterSpecialInfoSymbol.js';
import { isAsyncIter } from '../utils/isAsyncIter.js';

export { iterateFormatted, type FixedRefFormattedIterable };

function iterateFormatted<TIn, TOut>(
  source: TIn,
  formatFn: (value: ExtractAsyncIterableValue<TIn>, i: number) => TOut
): TIn extends AsyncIterable<unknown>
  ? FixedRefFormattedIterable<ExtractAsyncIterableValue<TIn>, TOut>
  : TOut;
function iterateFormatted(
  source: unknown,
  formatFn: (value: unknown, i: number) => unknown
): unknown {
  if (!isAsyncIter(source)) {
    return formatFn(source, 0);
  }

  const sourceSpecialInfo = (source as any)?.[reactAsyncIterSpecialInfoSymbol] as
    | undefined
    | ReactAsyncIterSpecialInfo<unknown, unknown>;

  return {
    [Symbol.asyncIterator]: () => iterableSimpleMap(source, formatFn)[Symbol.asyncIterator](),
    [reactAsyncIterSpecialInfoSymbol]: !sourceSpecialInfo
      ? {
          origPreformattedSource: source,
          formatFn,
        }
      : {
          origPreformattedSource: sourceSpecialInfo.origPreformattedSource,
          formatFn: (value: unknown, i: number) => {
            const prevMapResult = sourceSpecialInfo.formatFn(value, i);
            return formatFn(prevMapResult, i);
          },
        },
  };
}

type FixedRefFormattedIterable<TVal, TValFormatted> = AsyncIterable<TValFormatted, void, void> & {
  [reactAsyncIterSpecialInfoSymbol]: ReactAsyncIterSpecialInfo<TVal, TValFormatted>;
};
