import { asyncFilter } from 'iter-tools';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itFilter };

function itFilter<TValue>(
  predicateFn: (val: TValue, i: number) => boolean | Promise<boolean>
): (source: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return myIterableCleanupPatcher(asyncFilter(predicateFn));
}
