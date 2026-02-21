import React, { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { RootNavigator } from './RootNavigator';
import { OfflineBanner } from './components/OfflineBanner';

function App() {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Check if the app is already installed and running in standalone mode
    const checkStandalone = () => {
      return window.matchMedia('(display-mode: standalone)').matches || 
             (window.navigator as any).standalone === true;
    };
    setIsStandalone(checkStandalone());

    // 2. Capture the native Android "Install" prompt so we can attach it to our custom button
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault(); // Prevent Chrome's auto mini-infobar
      setDeferredPrompt(e); // Save the event so it can be triggered later
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Listen for when the user successfully installs the app
    const handleAppInstalled = () => {
      setIsStandalone(true); // Instantly switch to the login screen!
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Function to trigger the actual download/install prompt
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show the native Android install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Fallback if the browser blocks the prompt
      alert('To install, tap your browser menu (⋮) and select "Install app" or "Add to Home screen".');
    }
  };

  // IF NOT INSTALLED: Show the "Install Wall" (Hides Login and everything else)
  if (!isStandalone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          {/* Mock App Icon */}
          <div className="w-24 h-24 bg-blue-600 rounded-3xl mx-auto mb-6 shadow-md flex items-center justify-center text-white text-4xl font-bold">
            W
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">WorkforcePro</h1>
          <p className="text-gray-500 mb-8 text-sm">
            Please install the application to your device to access your dashboard.
          </p>
          
          <button
            onClick={handleInstallClick}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg active:scale-95"
          >
            Download & Install App
          </button>
          
          <p className="mt-6 text-xs text-gray-400">
            Having trouble? Tap your browser menu and select "Install app".
          </p>
        </div>
      </div>
    );
  }

  // IF INSTALLED: Show the actual application (Login Screen -> Dashboard)
  return (
    <AuthProvider>
      <OfflineBanner />
      <RootNavigator />
    </AuthProvider>
  );
}

export default App;