export { asyncIterTakeUntil, type TerminationTrigger };

// TODO: In the event of an any exception thrown from `terminationTrigger` - the whole result iterator should probably throw it as well and close itself

function asyncIterTakeUntil<T>(
  terminationTrigger: TerminationTrigger
): (source: AsyncIterable<T>) => AsyncIterable<T> {
  return source => ({
    [Symbol.asyncIterator]() {
      let srcIterator: AsyncIterator<T>;
      let observedTerminationIterator: AsyncIterator<unknown>;

      return {
        async next() {
          if (!srcIterator) {
            srcIterator = source[Symbol.asyncIterator]();

            (async () => {
              try {
                if (typeof terminationTrigger === 'function') {
                  await terminationTrigger();
                } else if (terminationTrigger instanceof Promise) {
                  await terminationTrigger;
                } else {
                  observedTerminationIterator = terminationTrigger[Symbol.asyncIterator]();
                  await observedTerminationIterator
                    .next()
                    .finally(() => observedTerminationIterator.return?.());
                }
              } finally {
                await srcIterator?.return?.();
              }
            })();
          }

          return srcIterator.next();
        },

        async return() {
          await observedTerminationIterator?.return?.();
          await srcIterator?.return?.();
          return { done: true as const, value: undefined };
        },
      };
    },
  });
}

type TerminationTrigger = Promise<unknown> | (() => Promise<unknown>) | AsyncIterable<unknown>;
