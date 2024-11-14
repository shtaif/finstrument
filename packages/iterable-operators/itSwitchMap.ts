export { itSwitchMap };

function itSwitchMap<TSourceVal, TInnerVal>(
  mapFn: (srcVal: TSourceVal) => AsyncIterable<TInnerVal> | Iterable<TInnerVal>
): (source: AsyncIterable<TSourceVal>) => AsyncIterable<TInnerVal> {
  return source => ({
    [Symbol.asyncIterator]() {
      let sourceIterator: AsyncIterator<TSourceVal> | undefined;
      let currInnerIterator: AsyncIterator<TInnerVal> | Iterator<TInnerVal> = reusedEmptyIterator;
      let nextInnerIteratorPromise: Promise<
        AsyncIterator<TInnerVal> | Iterator<TInnerVal> | undefined
      >;
      let stoppedByConsumer = false;

      return {
        async next() {
          if (!sourceIterator) {
            sourceIterator = source[Symbol.asyncIterator]();

            (async () => {
              while (true) {
                const sourceIteratorNextPromise = sourceIterator.next();

                nextInnerIteratorPromise = (async () => {
                  const sourceNext = await sourceIteratorNextPromise;
                  if (sourceNext.done) {
                    return;
                  }
                  await currInnerIterator.return?.();
                  if (stoppedByConsumer) {
                    return;
                  }
                  const innerIterable = mapFn(sourceNext.value);
                  return Symbol.asyncIterator in innerIterable
                    ? innerIterable[Symbol.asyncIterator]()
                    : innerIterable[Symbol.iterator]();
                })();

                const nextInnerIterator = await nextInnerIteratorPromise;

                if (!nextInnerIterator || stoppedByConsumer) {
                  break;
                }

                currInnerIterator = nextInnerIterator;
              }
            })();
          }

          try {
            do {
              if (stoppedByConsumer) {
                break;
              }
              const next = await currInnerIterator.next();
              if (!next.done) {
                return next;
              }
            } while (!stoppedByConsumer && (await nextInnerIteratorPromise));
            return { done: true, value: undefined };
          } catch (err) {
            await sourceIterator.return?.();
            throw err;
          }
        },

        async return() {
          stoppedByConsumer = true;

          await Promise.all([
            sourceIterator?.return?.(),
            currInnerIterator.return?.(),
            (async () => {
              const innerIterator = await nextInnerIteratorPromise;
              await innerIterator?.return?.();
            })(),
          ]);

          return { done: true, value: undefined };
        },
      };
    },
  });
}

const reusedEmptyIterator = {
  next: async () => ({ done: true as const, value: undefined }),
  return: async () => ({ done: true as const, value: undefined }),
};
