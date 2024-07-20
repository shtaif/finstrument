export { myIterableCleanupPatcher };

function myIterableCleanupPatcher<TInValue, TOutValue = TInValue>(
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
        next: () => {
          return outputIterator.next();
        },
        return: async () => {
          sourceIterator.return?.();
          return outputIterator.return ? outputIterator.return() : { done: true, value: undefined };
        },
      };
    },
  });
}
