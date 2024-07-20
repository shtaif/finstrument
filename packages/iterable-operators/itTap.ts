import { asyncTap } from 'iter-tools';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itTap };

function itTap<TValue>(
  fn: (val: TValue, i: number) => unknown
): (source: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return myIterableCleanupPatcher(asyncTap(fn));
}
