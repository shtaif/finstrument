export { itMap };

function itMap<TValue, TMappedValue>(
  mapFn: (val: TValue, i: number) => TMappedValue | Promise<TMappedValue>
): (source: AsyncIterable<TValue>) => AsyncIterable<TMappedValue> {
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
              const mappedValue = await mapFn(next.value, idx++);
              return { done: false, value: mappedValue };
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
