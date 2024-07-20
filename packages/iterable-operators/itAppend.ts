export { itAppend };

function itAppend<TSource, TAppended>(
  appendedValue: TAppended
): (src: AsyncIterable<TSource>) => AsyncIterable<TSource | TAppended> {
  return sourceIter => {
    let iterator: AsyncIterator<TSource>;
    let origIteratorDone = false;

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (origIteratorDone) {
            return { done: true as const, value: undefined };
          }
          iterator ??= sourceIter[Symbol.asyncIterator]();
          const next = await iterator.next();
          if (!next.done) {
            return next;
          }
          origIteratorDone = true;
          return { done: false, value: appendedValue };
        },

        async return() {
          if (!iterator || !iterator.return) {
            return { done: true, value: undefined };
          }
          return iterator.return();
        },
      }),
    };
  };
}
