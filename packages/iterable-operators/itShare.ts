export { itShare };

function itShare<TValue>(): (srcIterable: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return srcIterable => {
    let sharedSourceIterator: AsyncIterator<TValue>;
    let prevSourceIteratorActiveTearDownPromise: undefined | Promise<unknown>;
    let nextPromise: undefined | Promise<IteratorResult<TValue, undefined>>;
    let activeSubIteratorsCount = 0;

    return {
      [Symbol.asyncIterator]() {
        let iteratorClosed = false;
        const whenIteratorCloses = Promise.withResolvers<IteratorReturnResult<undefined>>();

        if (++activeSubIteratorsCount === 1) {
          sharedSourceIterator = srcIterable[Symbol.asyncIterator]();
        }

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
            return Promise.race([whenIteratorCloses.promise, nextPromise]);
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
              whenIteratorCloses.resolve({ done: true, value: undefined });
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
}
