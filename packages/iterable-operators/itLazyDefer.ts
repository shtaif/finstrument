export { itLazyDefer };

function itLazyDefer<T>(
  iterableFactory: () => AsyncIterable<T> | Promise<AsyncIterable<T>>
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let deferredIterableInitPromise: Promise<AsyncIterable<T>> | undefined;
      let deferredIterator: AsyncIterator<T>;
      let isClosed = false;

      return {
        async next() {
          if (isClosed) {
            return { done: true, value: undefined };
          }
          try {
            if (!deferredIterableInitPromise) {
              deferredIterableInitPromise = Promise.resolve(iterableFactory());
              deferredIterator = (await deferredIterableInitPromise)[Symbol.asyncIterator]();
            }
            return await deferredIterator.next();
          } catch (err) {
            isClosed = true;
            throw err;
          }
        },

        async return() {
          if (!isClosed) {
            isClosed = true;
            if (deferredIterableInitPromise) {
              await deferredIterableInitPromise;
              if (deferredIterator.return) {
                return deferredIterator.return();
              }
            }
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}
