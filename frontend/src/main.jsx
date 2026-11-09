import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2600,
          style: { background: 'rgb(var(--fg))', color: 'rgb(var(--bg))', fontSize: 14, fontWeight: 500, borderRadius: 8, padding: '10px 14px' },
          error: { iconTheme: { primary: 'rgb(var(--danger))', secondary: 'rgb(var(--bg))' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
