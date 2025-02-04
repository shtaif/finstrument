import { type InfiniteAsyncIterable } from './InfiniteAsyncIterable.js';

export { itTake };

function itTake<T>(count: number): (src: AsyncIterable<T>) => AsyncIterable<T>;
function itTake<T>(count: number): (src: InfiniteAsyncIterable<T>) => AsyncIterable<T>;
function itTake<T>(count: number): (src: AsyncIterable<T>) => AsyncIterable<T> {
  return sourceIter => {
    if (count === 0) {
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
          return: async () => ({ done: true, value: undefined }),
        }),
      };
    }

    let iterator: AsyncIterator<T>;
    let remainingCount = count;
    let closed = false;

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (closed) {
            return { done: true, value: undefined };
          }

          iterator ??= sourceIter[Symbol.asyncIterator]();

          if (remainingCount === 0) {
            closed = true;
            await iterator.return?.();
            return { done: true, value: undefined };
          }

          remainingCount--;
          const next = await iterator.next();

          if (next.done) {
            closed = true;
            return { done: true, value: undefined };
          }

          return next;
        },

        async return() {
          if (!closed) {
            closed = true;
            await iterator?.return?.();
          }
          return { done: true, value: undefined };
        },
      }),
    };
  };
}
