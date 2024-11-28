import React from 'react';
import { ConfigProvider as AntdConfigProvider, theme as antdTheme } from 'antd';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SuperTokensWrapper } from 'supertokens-auth-react';
import { SessionAuth } from 'supertokens-auth-react/recipe/session';
import { ApolloProvider } from '@apollo/client';
import { pipe } from 'shared-utils';
import { UserMainScreen } from './components/UserMainScreen';
import { gqlClient } from './utils/gqlClient';
import { initSuperTokens } from './utils/initSuperTokens';
import './index.css';

export { App };

function App() {
  return (children =>
    pipe(
      children,
      $ => <SuperTokensWrapper children={$} />,
      $ => <ApolloProvider children={$} client={gqlClient} />,
      $ => (
        <AntdConfigProvider
          children={$}
          theme={{ cssVar: true, algorithm: antdTheme.darkAlgorithm }}
        />
      )
    ))(
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <SessionAuth requireAuth>
              <UserMainScreen />
            </SessionAuth>
          }
        />

        <Route
          path={authRoutesBasePath}
          element={
            <>
              <SignInAndUpPage />
            </>
          }
        />

        <Route
          path={`${authRoutesBasePath}/reset-password?`}
          element={
            <>
              <ResetPasswordPage />
            </>
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

const authRoutesBasePath = '/auth';

const { SignInAndUpPage, ResetPasswordPage } = initSuperTokens({
  authRoutesBasePath,
});
