import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BroadcastBoard } from './broadcast/BroadcastBoard';
import './index.css';

// The broadcast board is a separate, standalone view (opened in its own tab
// via ?broadcast=1) rather than a client-side route, so it works identically
// in dev and on a static Vercel deploy with zero routing config.
const isBroadcast = new URLSearchParams(window.location.search).has('broadcast');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isBroadcast ? <BroadcastBoard /> : <App />}</StrictMode>,
);
