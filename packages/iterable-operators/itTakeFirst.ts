import { type InfiniteAsyncIterable } from './InfiniteAsyncIterable.js';

export { itTakeFirst };

function itTakeFirst<T>(): (src: AsyncIterable<T>) => Promise<T | undefined>;
function itTakeFirst<T>(): (src: InfiniteAsyncIterable<T>) => Promise<T>;
function itTakeFirst<T>(): (src: AsyncIterable<T>) => Promise<T | undefined> {
  return async sourceIter => {
    const iterator = sourceIter[Symbol.asyncIterator]();
    try {
      const first = await iterator.next();
      return first.done ? undefined : first.value;
    } finally {
      await iterator.return?.();
    }
  };
}
