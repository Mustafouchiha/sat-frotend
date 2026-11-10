import 'katex/dist/katex.min.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegram } from './lib/telegram';
import { initTheme } from './lib/theme';

initTelegram();
// Saqlangan ko'rinish birinchi kadrdan oldin qo'llanadi (ranglar "sakramaydi")
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
