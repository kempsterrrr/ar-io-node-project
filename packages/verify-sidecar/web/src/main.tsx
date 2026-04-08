import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Derive basename from the current path so the app works at any mount point:
// /verify/, /local/verify/, etc.
// The HTML is served at the base path, so strip /report/... or other sub-routes.
const path = window.location.pathname;
const match = path.match(/^(.*\/verify)\//);
const basename = match ? match[1] : '/verify';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
