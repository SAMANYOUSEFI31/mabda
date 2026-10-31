import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './ui';
import { AiStatusProvider } from './services/aiStatus';

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <AiStatusProvider>
      <App />
    </AiStatusProvider>
  </ToastProvider>,
);
