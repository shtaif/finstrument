export { itCycle };

function itCycle<T>(): (srcIterable: AsyncIterable<T>) => AsyncIterable<T> {
  return srcIterable => ({
    [Symbol.asyncIterator]() {
      let srcIterator: undefined | AsyncIterator<T>;
      let iteratorClosed = false;

      return {
        async next() {
          if (iteratorClosed) {
            return { done: true, value: undefined };
          }

          srcIterator ??= srcIterable[Symbol.asyncIterator]();

          const next = await srcIterator.next();
          if (!next.done) {
            return next;
          }

          if (iteratorClosed) {
            return { done: true, value: undefined };
          }

          srcIterator = srcIterable[Symbol.asyncIterator]();

          const firstNextFollowingRestart = await srcIterator.next();
          if (!firstNextFollowingRestart.done) {
            return firstNextFollowingRestart;
          }

          iteratorClosed = true;
          return { done: true, value: undefined };
        },

        async return() {
          if (!iteratorClosed) {
            iteratorClosed = true;
            if (srcIterator?.return) {
              await srcIterator.return();
            }
          }
          return { done: true, value: undefined };
        },
      };
    },
  });
}
