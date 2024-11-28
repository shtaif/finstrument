export { itLazyDefer };

function itLazyDefer<T>(
  iterableFactory: () => AsyncIterable<T> | Promise<AsyncIterable<T>>
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let deferredIterableInitPossiblyPromise:
        | undefined
        | AsyncIterable<T>
        | Promise<AsyncIterable<T>>;
      let deferredIterator: AsyncIterator<T>;
      let isClosed = false;

      return {
        async next() {
          if (isClosed) {
            return { done: true, value: undefined };
          }
          try {
            if (!deferredIterableInitPossiblyPromise) {
              deferredIterableInitPossiblyPromise = iterableFactory();
              const iterable = isPromise(deferredIterableInitPossiblyPromise)
                ? await deferredIterableInitPossiblyPromise
                : deferredIterableInitPossiblyPromise;
              deferredIterator = iterable[Symbol.asyncIterator]();
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
            if (deferredIterableInitPossiblyPromise) {
              if (isPromise(deferredIterableInitPossiblyPromise)) {
                await deferredIterableInitPossiblyPromise;
              }
              if (deferredIterator.return) {
                await deferredIterator.return();
              }
            }
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

function isPromise<T = unknown>(input: unknown): input is Promise<T> {
  return !!(input as any)?.then;
}
