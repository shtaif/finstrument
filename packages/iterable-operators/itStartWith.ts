import { startWith as ixStartWith } from '@reactivex/ix-esnext-esm/asynciterable/operators';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { asyncIterStartWith };

function asyncIterStartWith<TPrependings extends any[]>(
  ...args: TPrependings
): <TInput>(
  source: AsyncIterable<TInput>
) => AsyncIterable<TInput | TPrependings[number & keyof TPrependings]> {
  return myIterableCleanupPatcher(ixStartWith(...args));
}
