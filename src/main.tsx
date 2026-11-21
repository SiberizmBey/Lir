import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SubtitleOverlay } from './components/SubtitleOverlay.tsx';
import { LanguageProvider } from './i18n';
import './index.css';

const isSubtitleOverlay = window.location.hash === '#subtitle-overlay';

if (isSubtitleOverlay) {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.userSelect = 'none';
  createRoot(document.getElementById('root')!).render(
    <LanguageProvider>
      <SubtitleOverlay />
    </LanguageProvider>
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}
