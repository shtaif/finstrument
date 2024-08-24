import { type ExtractAsyncIterableValue } from './ExtractAsyncIterableValue.js';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itCatch };

function itCatch<TOrigIter extends AsyncIterable<unknown>>(
  catchFn: (err: unknown, origIter: TOrigIter) => OptionallyPromise<never>
): (source: TOrigIter) => AsyncIterable<ExtractAsyncIterableValue<TOrigIter>>;

function itCatch<TOrigIter extends AsyncIterable<unknown>, TAltIter>(
  catchFn: (err: unknown, origIter: TOrigIter) => OptionallyPromise<TAltIter>
): (
  source: TOrigIter
) => AsyncIterable<ExtractAsyncIterableValue<TOrigIter> | ExtractAsyncIterableValue<TAltIter>>;

function itCatch(
  catchFn: (err: unknown, origIter: AsyncIterable<unknown>) => OptionallyPromise<unknown>
): (source: AsyncIterable<unknown>) => AsyncIterable<unknown> {
  return myIterableCleanupPatcher(async function* (source) {
    let currActiveIter: AsyncIterable<unknown> = source;
    while (true) {
      try {
        yield* currActiveIter;
        break;
      } catch (err) {
        const catchFnResult: any = await catchFn(err, currActiveIter);
        if (!catchFnResult?.[Symbol.asyncIterator]) {
          throw err;
        }
        currActiveIter = catchFnResult;
      }
    }
  });
}

type OptionallyPromise<T> = T | Promise<T>;
