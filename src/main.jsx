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

// Push a floor entry once at startup so the back button can't exit the PWA.
// React Router will replaceState this entry (merging its own idx/key) so it
// doesn't interfere with React Router's internal history tracking.
if (window.history.length <= 1) {
  window.history.pushState({ __appFloor: true }, '', window.location.href);
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
