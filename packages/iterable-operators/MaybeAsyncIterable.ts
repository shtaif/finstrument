export { type MaybeAsyncIterable };

type MaybeAsyncIterable<T> = T | AsyncIterable<T>;
