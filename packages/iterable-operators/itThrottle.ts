export { asyncIterThrottle };

function asyncIterThrottle<T>(intervalMs: number): (source: AsyncIterable<T>) => AsyncIterable<T> {
  return source => ({
    [Symbol.asyncIterator]() {
      let isClosed = false;
      let iterator: AsyncIterator<T> | undefined;
      let stackedPreviousThrottlesPromise = sharedResolvedPromise;
      let lastTimeoutClearAndResolve = noop;

      return {
        async next() {
          if (isClosed) {
            return { done: true, value: undefined };
          }

          iterator ??= source[Symbol.asyncIterator]();

          const delayForCurrIteration = stackedPreviousThrottlesPromise;

          stackedPreviousThrottlesPromise = (async () => {
            await stackedPreviousThrottlesPromise;
            await new Promise<void>(resolve => {
              const timeoutId = setTimeout(resolve, intervalMs);
              lastTimeoutClearAndResolve = () => {
                clearTimeout(timeoutId);
                resolve();
              };
            });
          })();

          await delayForCurrIteration;

          if (isClosed) {
            return { done: true, value: undefined };
          }

          return iterator.next();
        },

        async return() {
          if (!isClosed) {
            isClosed = true;
            lastTimeoutClearAndResolve();
            await iterator?.return?.();
          }
          return { done: true, value: undefined };
        },
      };
    },
  });
}

const sharedResolvedPromise = Promise.resolve();
const noop = () => {};
