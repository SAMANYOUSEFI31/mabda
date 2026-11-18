import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './ui';
import { installScrollbars } from './ui/scrollbars';
import { installPinned } from './ui/pinned';
import { installKeyboard } from './ui/keyboard';
import { AiStatusProvider } from './services/aiStatus';
import { installErrorReporting } from './services/errorReport';
import { installActivity } from './services/activity';
import { RootBoundary } from './app/shell/RootBoundary';
import { SessionGate } from './app/shell/SessionGate';

installErrorReporting();
installScrollbars();
installPinned();
installKeyboard();
installActivity();

// the boundary is outermost: an error anywhere below (the providers too) shows a way back, never a white page
createRoot(document.getElementById('root')!).render(
  <RootBoundary>
    <ToastProvider>
      <SessionGate>
        <AiStatusProvider>
          <App />
        </AiStatusProvider>
      </SessionGate>
    </ToastProvider>
  </RootBoundary>,
);
