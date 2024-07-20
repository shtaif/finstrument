import { promiseWithResolvers } from 'shared-utils';

export { hangingIterable };

function hangingIterable(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      const hangingPromiseWithResolvers = promiseWithResolvers<IteratorResult<never>>();
      return {
        next: () => {
          return hangingPromiseWithResolvers.promise;
        },
        return: async () => {
          hangingPromiseWithResolvers.resolve({ done: true, value: undefined });
          return hangingPromiseWithResolvers.promise;
        },
      };
    },
  };
}
