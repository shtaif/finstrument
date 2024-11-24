import { iterableSimpleMap } from '../utils/iterableSimpleMap.js';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue.js';
import { isAsyncIter } from '../utils/isAsyncIter.js';

export { mapIterate, reactAsyncIterSpecialInfoSymbol, type FixedRefTransformedIterable };

function mapIterate<TIn, TOut>(
  source: TIn,
  mapFn: (value: ExtractAsyncIterableValue<TIn>, i: number) => TOut
): TIn extends AsyncIterable<unknown>
  ? FixedRefTransformedIterable<ExtractAsyncIterableValue<TIn>, TOut>
  : TOut;
function mapIterate(source: unknown, mapFn: (value: unknown, i: number) => unknown): unknown {
  if (!isAsyncIter(source)) {
    return mapFn(source, 0);
  }

  const sourceSpecialInfo = (source as any)?.[reactAsyncIterSpecialInfoSymbol];

  return {
    [Symbol.asyncIterator]: () => iterableSimpleMap(source, mapFn)[Symbol.asyncIterator](),
    [reactAsyncIterSpecialInfoSymbol]: !sourceSpecialInfo
      ? {
          dependentSourceIter: source,
          mapFn,
        }
      : {
          dependentSourceIter: sourceSpecialInfo.dependentSourceIter,
          mapFn: (value: unknown, i: number) => {
            const prevMapResult = sourceSpecialInfo.mapFn(value, i);
            return mapFn(prevMapResult, i);
          },
        },
  };
}

const reactAsyncIterSpecialInfoSymbol = Symbol('reactAsyncIterSpecialInfoSymbol');

type FixedRefTransformedIterable<TSrc, TTransformed> = {
  [Symbol.asyncIterator](): AsyncIterator<TTransformed, void, void>;
  [reactAsyncIterSpecialInfoSymbol]: {
    dependentSourceIter: AsyncIterable<TSrc>;
    mapFn(value: TSrc, i: number): TTransformed;
  };
};
