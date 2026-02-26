import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App';
// ADD THIS IMPORT to trigger the PWA Service Worker
import { registerSW } from 'virtual:pwa-register';

// Start the service worker immediately
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);