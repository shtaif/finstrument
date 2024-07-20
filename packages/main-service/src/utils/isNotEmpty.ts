import { isEmpty } from 'lodash';

export { isNotEmpty };

function isNotEmpty(val: unknown): boolean {
  return !isEmpty(val);
}
