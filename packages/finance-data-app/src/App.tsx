import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client';
import { UserMainScreen } from './components/UserMainScreen';
import { gqlClient } from './utils/gqlClient';

export default App;

function App() {
  return (
    <BrowserRouter>
      <ApolloProvider client={gqlClient}>
        <Routes>
          {/* <Route path="/" element={<div>Home</div>} /> */}
          <Route path="/:alias" element={<UserMainScreen />} />
        </Routes>
      </ApolloProvider>
    </BrowserRouter>
  );
}
