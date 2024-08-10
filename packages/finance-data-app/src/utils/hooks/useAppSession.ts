import { useSessionContext as useSupertokensSessionContext } from 'supertokens-auth-react/recipe/session';

export { useAppSession };

function useAppSession():
  | { loading: true; activeUserId: undefined }
  | { loading: false; activeUserId: string | undefined } {
  const supertokensSessionCtx = useSupertokensSessionContext();

  return supertokensSessionCtx.loading
    ? {
        loading: true,
        activeUserId: undefined,
      }
    : {
        loading: false,
        activeUserId: !supertokensSessionCtx.doesSessionExist
          ? undefined
          : supertokensSessionCtx.userId,
      };
}
