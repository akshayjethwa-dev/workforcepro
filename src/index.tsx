import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// Tell Capgo the web app loaded successfully. 
// If an update was just applied, this prevents it from rolling back.
CapacitorUpdater.notifyAppReady();

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