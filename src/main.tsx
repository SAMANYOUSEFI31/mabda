import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { RuntimeBoundary } from './app/lazy';
import './index.css';
import { ToastProvider } from './ui';
import { installScrollbars } from './ui/scrollbars';
import { installPinned } from './ui/pinned';
import { installKeyboard } from './ui/keyboard';
import { AiStatusProvider } from './services/aiStatus';

installScrollbars();
installPinned();
installKeyboard();

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <AiStatusProvider>
      <RuntimeBoundary label="برنامه خطا داد">
        <App />
      </RuntimeBoundary>
    </AiStatusProvider>
  </ToastProvider>,
);
