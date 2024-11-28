export { empty };

function empty(): AsyncIterable<never, void, void> {
  return sharedEmptyIterable;
}

const sharedEmptyIterable = {
  [Symbol.asyncIterator]: () => sharedEmptyIterator,
};

const sharedEmptyIterator = {
  next: () => sharedDummyCompletionResult,
  return: () => sharedDummyCompletionResult,
};

const sharedDummyCompletionResult = Promise.resolve({
  done: true as const,
  value: undefined,
});
