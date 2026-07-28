// Точка входа: загружаем данные из IndexedDB и запускаем UI.

import { loadAll } from './state.ts';
import { startUI } from './ui.ts';
import { installViewportFix } from './viewport.ts';

installViewportFix();

// iOS: в PWA, запущенной с домашнего экрана, navigator.standalone === true. Включаем нижний
// safe-area-отступ под home-indicator (см. --safe-bottom в app.css); в обычном Safari не нужен.
if ((navigator as Navigator & { standalone?: boolean }).standalone) {
  document.documentElement.classList.add('standalone');
}

const root = document.getElementById('app');
if (root) {
  loadAll().then(() => startUI(root)).catch((e) => {
    root.textContent = 'Ошибка запуска приложения';
    console.error(e);
  });
}

// PWA (V3/3б): регистрируем Service Worker. Относительный URL → scope в пределах /auditor/.
// В dev-сервере sw.js нет — регистрация тихо отваливается (catch), приложение работает как есть.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
