import supertokens from 'supertokens-node';
import SupertokensRecipeSession from 'supertokens-node/recipe/session';
import SupertokensRecipeEmailPassword from 'supertokens-node/recipe/emailpassword';
import { UserModel } from '../db/index.js';

export { initSuperTokens };

function initSuperTokens(params: {
  superTokensCoreUrl: string;
  apiDomain: string;
  websiteDomain: string;
  sessionCookieDomain: string;
  authEndpointsBasePath: string;
}): void {
  supertokens.init({
    framework: 'express',
    supertokens: {
      connectionURI: params.superTokensCoreUrl,
    },
    appInfo: {
      appName: 'instrumental',
      apiDomain: params.apiDomain,
      apiBasePath: params.authEndpointsBasePath,
      websiteDomain: params.websiteDomain,
      websiteBasePath: '/auth',
    },
    recipeList: [
      SupertokensRecipeSession.init({
        exposeAccessTokenToFrontendInCookieBasedAuth: true,
        cookieDomain: params.sessionCookieDomain,
        ...(new URL(params.apiDomain).protocol === 'https:'
          ? {
              cookieSameSite: 'none',
              cookieSecure: true,
            }
          : {
              cookieSameSite: 'lax',
              cookieSecure: false,
            }),
      }),
      SupertokensRecipeEmailPassword.init({
        override: {
          apis: origImpl => ({
            ...origImpl,
            signUpPOST: async input => {
              const result = await origImpl.signUpPOST!(input);
              if (result.status === 'OK') {
                await UserModel.create({
                  id: result.user.id,
                  createdAt: result.user.timeJoined,
                  alias: `${result.user.id}_alias`,
                });
              }
              return result;
            },
          }),
        },
      }),
    ],
  });
}
