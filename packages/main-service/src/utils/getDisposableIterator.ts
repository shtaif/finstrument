export { getDisposableIterator };

function getDisposableIterator<T>(
  iterable: AsyncIterable<T>
): AsyncIterableIterator<T> & AsyncDisposable {
  const iterator = iterable[Symbol.asyncIterator]();
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async [Symbol.asyncDispose]() {
      await iterator.return!();
    },
    next() {
      return iterator.next();
    },
    return: !iterator.return ? undefined : () => iterator.return!(),
  };
}
