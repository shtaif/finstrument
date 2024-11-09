export { itShare };

function itShare<TValue>(): (srcIterable: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return srcIterable => {
    let sharedSourceIterator: AsyncIterator<TValue>;
    let prevSourceIteratorActiveTearDownPromise: undefined | Promise<unknown>;
    let nextPromise: undefined | Promise<IteratorResult<TValue, undefined | void>>;
    let activeSubIteratorsCount = 0;

    return {
      [Symbol.asyncIterator]() {
        let iteratorClosed = false;

        if (++activeSubIteratorsCount === 1) {
          sharedSourceIterator = srcIterable[Symbol.asyncIterator]();
        }

        // TODO: Should wrap each iterator's returned promise such that it can be immediately early-resolved to a "done" result when the iterator gets early-closed?

        return {
          async next() {
            if (prevSourceIteratorActiveTearDownPromise) {
              await prevSourceIteratorActiveTearDownPromise;
            }
            if (iteratorClosed) {
              return { done: true, value: undefined };
            }
            nextPromise ??= sharedSourceIterator.next().finally(() => {
              nextPromise = undefined;
            });
            return nextPromise;
          },

          async return() {
            if (!iteratorClosed) {
              iteratorClosed = true;
              if (--activeSubIteratorsCount === 0) {
                await (prevSourceIteratorActiveTearDownPromise ??= (async () => {
                  try {
                    if (sharedSourceIterator.return) {
                      await sharedSourceIterator.return();
                    }
                  } finally {
                    prevSourceIteratorActiveTearDownPromise = undefined;
                  }
                })());
              }
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
}
