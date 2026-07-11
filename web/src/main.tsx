import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexProvider } from 'convex/react';
import App from './App';
import { StoreProvider } from './store';
import { convexClient } from './convex';
import './styles.css';

const tree = (
  <StoreProvider>
    <App />
  </StoreProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {convexClient ? <ConvexProvider client={convexClient}>{tree}</ConvexProvider> : tree}
  </React.StrictMode>,
);
