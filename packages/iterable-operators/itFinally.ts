export { itFinally };

function itFinally<T>(finallyFn: () => unknown): (source: AsyncIterable<T>) => AsyncIterable<T> {
  return source => ({
    [Symbol.asyncIterator]: () => {
      let iterator: undefined | AsyncIterator<T>;
      let isClosed = false;
      let finallyFnInvokationResult: any;

      return {
        next: async () => {
          if (isClosed) {
            if (finallyFnInvokationResult?.then) {
              await finallyFnInvokationResult;
            }

            return { done: true, value: undefined };
          }

          iterator ??= source[Symbol.asyncIterator]();

          const next = await iterator.next();

          if (next.done) {
            if (!isClosed) {
              isClosed = true;
              finallyFnInvokationResult = finallyFn();
            }
            if (finallyFnInvokationResult?.then) {
              await finallyFnInvokationResult;
            }
          }

          return next;
        },

        return: async () => {
          if (!isClosed) {
            isClosed = true;
            if (iterator) {
              if (iterator.return) {
                await iterator.return();
              }
              finallyFnInvokationResult = finallyFn();
            }
          }

          if (finallyFnInvokationResult?.then) {
            await finallyFnInvokationResult;
          }

          return { done: true, value: undefined };
        },
      };
    },
  });
}
