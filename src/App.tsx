import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { RootNavigator } from './RootNavigator';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <OfflineBanner />
          <RootNavigator />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;