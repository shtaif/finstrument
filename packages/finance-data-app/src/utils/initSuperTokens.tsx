import React from 'react';
import SuperTokens from 'supertokens-auth-react';
import { AuthPage } from 'supertokens-auth-react/ui';
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword';
import { EmailPasswordPreBuiltUI } from 'supertokens-auth-react/recipe/emailpassword/prebuiltui';
import Session from 'supertokens-auth-react/recipe/session';

export { initSuperTokens };

function initSuperTokens(params: { authRoutesBasePath: string }): {
  SignInAndUpPage: () => React.ReactNode;
  ResetPasswordPage: () => React.ReactNode;
} {
  SuperTokens.init({
    appInfo: {
      appName: 'instrumental',
      apiDomain: `${import.meta.env.VITE_API_URL}`,
      websiteDomain: globalThis.location.origin,
      websiteBasePath: params.authRoutesBasePath,
    },
    recipeList: [Session.init({}), EmailPassword.init({})],
    style: `
      [data-supertokens~=container] {
        --palette-background: 51, 51, 51;
        --palette-inputBackground: 41, 41, 41;
        --palette-inputBorder: 41, 41, 41;
        --palette-textTitle: 255, 255, 255;
        --palette-textLabel: 255, 255, 255;
        --palette-textPrimary: 255, 255, 255;
        --palette-error: 173, 46, 46;
        --palette-textInput: 169, 169, 169;
        --palette-textLink: 169, 169, 169;
        --palette-superTokensBrandingBackground: 51, 51, 51;
      }
    `,
  });

  function SignInAndUpPage(): React.ReactNode {
    return (
      <div>
        <AuthPage preBuiltUIList={[EmailPasswordPreBuiltUI]} />
      </div>
    );
  }

  function ResetPasswordPage(): React.ReactNode {
    return (
      <div>
        <EmailPasswordPreBuiltUI.ResetPasswordUsingToken />
      </div>
    );
  }

  return { SignInAndUpPage, ResetPasswordPage };
}
