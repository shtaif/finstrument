export { OptionallyPromise };

type OptionallyPromise<T> = T | Promise<T>;
