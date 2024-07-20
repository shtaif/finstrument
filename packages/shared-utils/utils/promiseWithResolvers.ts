export { promiseWithResolvers, type PromiseWithResolvers };

/**
 * A ponyfill for the [`Promise.withResolvers`](https://github.com/tc39/proposal-promise-with-resolvers) helper, yet to be shipped and enabled on Node.js or browsers at the time of writing
 * @returns A pending {@link PromiseWithResolvers} instance for use
 */
function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: PromiseWithResolvers<T>['resolve'];
  let reject!: PromiseWithResolvers<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(errorVal: unknown): void;
};
