import { isEmpty } from 'lodash-es';

export { isNotEmpty };

function isNotEmpty(val: unknown): boolean {
  return !isEmpty(val);
}
