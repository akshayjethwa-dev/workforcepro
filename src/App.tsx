import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { EntitlementProvider } from './contexts/EntitlementContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { RootNavigator } from './RootNavigator';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  return (
    <AuthProvider>
      <EntitlementProvider>
        <ThemeProvider>
          <ToastProvider>
            <OfflineBanner />
            <RootNavigator />
          </ToastProvider>
        </ThemeProvider>
      </EntitlementProvider>
    </AuthProvider>
  );
}

export default App;