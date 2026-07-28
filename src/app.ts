// Точка входа: загружаем данные из IndexedDB и запускаем UI.

import { loadAll } from './state.ts';
import { startUI } from './ui.ts';
import { installViewportFix } from './viewport.ts';

installViewportFix();

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
