import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { MissionDeliveryDemo } from '@/features/mission-delivery/demo/MissionDeliveryDemo';
import '../index.css';

// Separate entry point: never import AuthProvider, Supabase or the operational app here.
if (!import.meta.env.DEV && import.meta.env.MODE !== 'md01')
  throw new Error('MD01 preview build required.');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <MissionDeliveryDemo />
    </HashRouter>
  </React.StrictMode>,
);
