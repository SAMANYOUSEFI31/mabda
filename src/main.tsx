import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './ui';
import { installScrollbars } from './ui/scrollbars';
import { installPinned } from './ui/pinned';
import { AiStatusProvider } from './services/aiStatus';

installScrollbars();
installPinned();

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <AiStatusProvider>
      <App />
    </AiStatusProvider>
  </ToastProvider>,
);
