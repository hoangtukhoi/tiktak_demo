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
        containerStyle={{ top: 72 }}
        toastOptions={{
          duration: 2600,
          style: { background: '#d9ff3f', color: '#12140a', fontWeight: 700, borderRadius: 999, padding: '10px 18px' },
          error: { style: { background: '#ff5a47', color: '#fff' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
