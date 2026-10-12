import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SubtitleOverlay } from './components/SubtitleOverlay.tsx';
import './index.css';

const isSubtitleOverlay = window.location.hash === '#subtitle-overlay';

if (isSubtitleOverlay) {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.userSelect = 'none';
  createRoot(document.getElementById('root')!).render(<SubtitleOverlay />);
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
