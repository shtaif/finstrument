export { itFilter, itFilter as itFilterPlain };

function itFilter<TValue>(
  predicateFn: (val: TValue, i: number) => boolean | Promise<boolean>
): (source: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return source => ({
    [Symbol.asyncIterator]() {
      let iterator: AsyncIterator<TValue>;
      let idx = 0;
      let isClosed = false;

      return {
        async next() {
          if (isClosed) {
            return { done: true, value: undefined };
          }
          iterator ??= source[Symbol.asyncIterator]();
          try {
            while (true) {
              const next = await iterator.next();
              if (next.done) {
                isClosed = true;
                return next;
              }
              if (await predicateFn(next.value, idx++)) {
                return next;
              }
            }
          } catch (err) {
            isClosed = true;
            await iterator.return?.();
            throw err;
          }
        },
        async return() {
          if (!isClosed) {
            isClosed = true;
            await iterator?.return?.();
          }
          return { done: true, value: undefined };
        },
      };
    },
  });
}
