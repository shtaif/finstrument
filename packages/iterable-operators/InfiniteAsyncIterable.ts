export { type InfiniteAsyncIterable };

type InfiniteAsyncIterable<TNext> = {
  [Symbol.asyncIterator](): AsyncIterator<TNext> & {
    next(...args: [] | [TNext]): Promise<IteratorYieldResult<TNext>>;
  };
};
