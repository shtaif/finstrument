import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider as AntdConfigProvider, theme as antdTheme } from 'antd';
import { ApolloProvider } from '@apollo/client';
import { pipe } from 'shared-utils';
import { UserMainScreen } from './components/UserMainScreen';
import { gqlClient } from './utils/gqlClient';

export { App };

function App() {
  return (children =>
    pipe(
      children,
      children => <ApolloProvider children={children} client={gqlClient} />,
      children => (
        <AntdConfigProvider
          children={children}
          theme={{ cssVar: true, algorithm: antdTheme.darkAlgorithm }}
        />
      )
    ))(
    <BrowserRouter>
      <Routes>
        <Route path="/:alias" element={<UserMainScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
