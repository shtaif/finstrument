export default shareAsyncIter;

function shareAsyncIter<TValue>(srcIterable: AsyncIterable<TValue>): AsyncIterable<TValue> {
  let baseIterator: AsyncIterator<TValue>;
  let isAwaitingNext = false;
  let nextPromise: Promise<IteratorResult<TValue, undefined | void>>;
  let activeIteratorsCount = 0;

  return {
    [Symbol.asyncIterator]() {
      activeIteratorsCount++;

      if (activeIteratorsCount === 1) {
        baseIterator = srcIterable[Symbol.asyncIterator]();
      }

      return {
        next(): Promise<IteratorResult<TValue, undefined | void>> {
          if (!isAwaitingNext) {
            isAwaitingNext = true;
            nextPromise = baseIterator.next().finally(() => (isAwaitingNext = false));
          }
          return nextPromise;
        },

        return: !baseIterator.return
          ? undefined
          : async () => {
              return --activeIteratorsCount > 0
                ? ({
                    done: true,
                    value: undefined,
                  } as const)
                : baseIterator.return!();
            },
      };
    },
  };
}
