import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { RootNavigator } from './RootNavigator';

function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

export default App;