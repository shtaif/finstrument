import { combineLatest as ixCombineLatest } from '@reactivex/ix-esnext-esm/asynciterable';

export { itCombineLatest };

function itCombineLatest<T, T2>(
  source: AsyncIterable<T>,
  source2: AsyncIterable<T2>
): AsyncIterable<[T, T2]>;
function itCombineLatest<T, T2, T3>(
  source: AsyncIterable<T>,
  source2: AsyncIterable<T2>,
  source3: AsyncIterable<T3>
): AsyncIterable<[T, T2, T3]>;
function itCombineLatest<T, T2, T3, T4>(
  source: AsyncIterable<T>,
  source2: AsyncIterable<T2>,
  source3: AsyncIterable<T3>,
  source4: AsyncIterable<T4>
): AsyncIterable<[T, T2, T3, T4]>;
function itCombineLatest<T, T2, T3, T4, T5>(
  source: AsyncIterable<T>,
  source2: AsyncIterable<T2>,
  source3: AsyncIterable<T3>,
  source4: AsyncIterable<T4>,
  source5: AsyncIterable<T5>
): AsyncIterable<[T, T2, T3, T4, T5]>;
function itCombineLatest<T, T2, T3, T4, T5, T6>(
  source: AsyncIterable<T>,
  source2: AsyncIterable<T2>,
  source3: AsyncIterable<T3>,
  source4: AsyncIterable<T4>,
  source5: AsyncIterable<T5>,
  source6: AsyncIterable<T6>
): AsyncIterable<[T, T2, T3, T4, T5, T6]>;
function itCombineLatest<T>(...sources: AsyncIterable<T>[]): AsyncIterable<T[]>;
function itCombineLatest<T>(...sources: AsyncIterable<T>[]): AsyncIterable<T[]> {
  return {
    [Symbol.asyncIterator]() {
      const innerIterators = sources.map(source => source[Symbol.asyncIterator]());

      const combinedIterator = ixCombineLatest(
        ...innerIterators.map(it => ({ [Symbol.asyncIterator]: () => it }))
      )[Symbol.asyncIterator]();

      return {
        next: () => {
          return combinedIterator.next();
        },
        return: async () => {
          await Promise.all(innerIterators.map(it => it.return?.()));
          return await combinedIterator.return!();
        },
      };
    },
  };
}
