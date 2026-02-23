import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { RootNavigator } from './RootNavigator';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  return (
    <AuthProvider>
      <OfflineBanner />
      <RootNavigator />
    </AuthProvider>
  );
}

export default App;