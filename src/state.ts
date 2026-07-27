// Состояние приложения + персистентность (§7 авто-сохранение). Экраны читают и мутируют state
// напрямую, затем зовут persist* и rerender. Ядро (src/core) о state ничего не знает.

import { loadCatalog, saveCatalog, loadUserRemarks, saveUserRemarks, loadAudits, saveAudits } from './db.ts';
import { nowSec } from './dom.ts';
import type { Audit, Catalog, Remark } from './core/types.ts';

export interface AppState {
  catalog: Catalog | null;
  userRemarks: Remark[];
  audits: Audit[];
  modalAreas: string[] | null; // последний выбор «Применимо к» в рамках сессии (null = все)
}

export const state: AppState = { catalog: null, userRemarks: [], audits: [], modalAreas: null };

export async function loadAll(): Promise<void> {
  const [catalog, userRemarks, audits] = await Promise.all([loadCatalog(), loadUserRemarks(), loadAudits()]);
  state.catalog = catalog;
  state.userRemarks = userRemarks;
  state.audits = audits;
}

// Сбой записи в IndexedDB (квота, приватный режим) нельзя глотать молча: приложение живёт на
// автосохранении, и это единственный сигнал пользователю. UI регистрирует обработчик при старте.
let persistErrorHandler: (() => void) | null = null;
export function onPersistError(handler: () => void): void {
  persistErrorHandler = handler;
}
function guarded(p: Promise<void>): void {
  p.catch((e) => {
    console.error('Не удалось сохранить в IndexedDB', e);
    persistErrorHandler?.();
  });
}

export function persistAudits(): void {
  guarded(saveAudits(state.audits));
}
export function persistUserRemarks(): void {
  guarded(saveUserRemarks(state.userRemarks));
}
export function persistCatalog(): void {
  if (state.catalog) guarded(saveCatalog(state.catalog));
}

// time аудита обновляется при каждом изменении внутри него (§7).
export function touchAudit(a: Audit): void {
  a.time = nowSec();
  persistAudits();
}
