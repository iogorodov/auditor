// Персистентность в IndexedDB (§2). Не входит в ядро — обращается к браузеру. Простое kv-хранилище:
// синглтоны каталога и пользовательского списка + массив аудитов. Масштаб V1 (offline, немного
// данных) не требует отдельных хранилищ на аудит.

import type { Audit, Catalog, Remark } from './core/types.ts';

const DB_NAME = 'auditor';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function kvDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const loadCatalog = () => kvGet<Catalog>('catalog').then((c) => c ?? null);
export const saveCatalog = (c: Catalog) => kvSet('catalog', c);
export const deleteCatalog = () => kvDelete('catalog');

export const loadUserRemarks = () => kvGet<Remark[]>('userRemarks').then((r) => r ?? []);
export const saveUserRemarks = (r: Remark[]) => kvSet('userRemarks', r);

export const loadAudits = () => kvGet<Audit[]>('audits').then((a) => a ?? []);
export const saveAudits = (a: Audit[]) => kvSet('audits', a);
