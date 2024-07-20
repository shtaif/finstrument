export { type ExtractAsyncIterableValue };

type ExtractAsyncIterableValue<T> = T extends AsyncIterable<infer Val> ? Val : T;
