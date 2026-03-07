import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

const isCapacitor = !!window.Capacitor?.isNativePlatform?.();

if (isCapacitor) {
  // In the Android APK (Capacitor), use the native back button API.
  // This intercepts the back gesture before the WebView handles it.
  import('@capacitor/app').then(({ App: CapApp }) => {
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (window.__scannerOpen) {
        // Let the scanner's popstate handler close it
        window.history.back();
        return;
      }
      if (canGoBack) {
        window.history.back();
      }
      // else: do nothing — prevents exiting the app
    });
  });
} else {
  // In the browser / PWA, use the History API to prevent exit.
  if (window.history.length <= 1) {
    window.history.pushState({ __appFloor: true }, '', window.location.href);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
