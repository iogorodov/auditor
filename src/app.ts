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
