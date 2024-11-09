export { itTap };

function itTap<TValue>(
  fn: (val: TValue, i: number) => unknown
): (source: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return source => ({
    [Symbol.asyncIterator]: () => {
      let iterator: AsyncIterator<TValue>;
      let idx = 0;

      return {
        next: async () => {
          iterator ??= source[Symbol.asyncIterator]();
          const next = await iterator.next();
          if (!next.done) {
            try {
              const res = fn(next.value, idx++) as any;
              if (res?.then) {
                await res;
              }
            } catch (err) {
              await iterator.return?.();
              throw err;
            }
          }
          return next;
        },

        return: async () => {
          if (iterator) {
            await iterator.return?.();
          }
          return { done: true, value: undefined };
        },
      };
    },
  });
}
