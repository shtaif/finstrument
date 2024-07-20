export default myIterableCleanupPatcher;

function myIterableCleanupPatcher<TInValue, TOutValue>(
  outputIterableFn: (
    inputIterableSharedIterator: AsyncIterable<TInValue>
  ) => AsyncIterable<TOutValue>
): (srcIter: AsyncIterable<TInValue>) => AsyncIterable<TOutValue> {
  return sourceIterable => ({
    [Symbol.asyncIterator]: () => {
      const sourceIterator = sourceIterable[Symbol.asyncIterator]();

      const outputIterator = outputIterableFn({ [Symbol.asyncIterator]: () => sourceIterator })[
        Symbol.asyncIterator
      ]();

      return {
        next: () => outputIterator.next(),
        return: async () => {
          sourceIterator.return?.();
          return outputIterator.return ? outputIterator.return() : { done: true, value: undefined };
        },
      };
    },
  });
}
