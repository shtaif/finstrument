import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itFinally };

function itFinally<T>(
  finallyFn: () => void | Promise<void>
): (source: AsyncIterable<T>) => AsyncIterable<T> {
  return myIterableCleanupPatcher(async function* (source: AsyncIterable<T>) {
    try {
      yield* source;
    } finally {
      await finallyFn();
    }
  });
}
