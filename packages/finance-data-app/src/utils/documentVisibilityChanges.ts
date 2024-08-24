import { iterified } from 'iterified';

export { documentVisibilityChanges };

const documentVisibilityChanges = iterified<boolean>(next => {
  next(!document.hidden);
  const listener = () => next(!document.hidden);
  document.addEventListener('visibilitychange', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
  };
}) satisfies AsyncIterable<boolean>;
