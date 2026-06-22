import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href)).catch(() => {});
  });
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
