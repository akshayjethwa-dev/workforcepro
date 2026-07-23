import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { RootNavigator } from './RootNavigator';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <OfflineBanner />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;