export { itPairwise };

function itPairwise<TVal>(
  initialPrevValue: TVal
): (source: AsyncIterable<TVal>) => AsyncIterable<[TVal, TVal]>;

function itPairwise<TVal>(
  initialPrevValue?: TVal
): (source: AsyncIterable<TVal>) => AsyncIterable<[TVal | undefined, TVal]>;

function itPairwise(
  initialPrevValue?: unknown
): (source: AsyncIterable<unknown>) => AsyncIterable<[unknown, unknown]> {
  return source => {
    return {
      [Symbol.asyncIterator]: () => {
        let iterator: undefined | AsyncIterator<unknown>;
        let prevValue = initialPrevValue;

        return {
          next: async () => {
            if (!iterator) {
              iterator = source[Symbol.asyncIterator]();
              if (!arguments.length) {
                const first = await iterator.next();
                if (first.done) {
                  return first;
                }
                prevValue = first.value;
              }
            }
            const next = await iterator.next();
            if (next.done) {
              return next;
            }
            const paired = [prevValue, next.value] as [unknown, unknown];
            prevValue = next.value;
            return { done: false, value: paired };
          },

          return: async () => {
            await iterator?.return?.();
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
}
