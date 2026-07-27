// Экспорт в xlsx (V2): аудит и пользовательские замечания.
//
// Аудит. Формат согласован с заказчиком: один лист, 4 колонки —
// № (сквозная нумерация) | Уровень 1 | Уровень 2 | Замечание; каждое здание открывается
// строкой с названием в первой ячейке. Заголовков нет. Пустые узлы и здания без замечаний
// в документ не попадают. Порядок зданий/узлов — как в приложении (разрешение через шаблон),
// порядок замечаний в листе — порядок каталога (не порядок отметки), не-каталожные — после,
// по алфавиту.

import { resolveBuilding } from './merge.ts';
import { nameKey } from './normalize.ts';
import { categoryCompare } from './leafview.ts';
import type { LevelEntry } from './merge.ts';
import { OTHER_CATEGORY, type Audit, type HierarchyTemplate, type Remark } from './types.ts';
import { buildXlsxFile, CellType, type Cell, type Worksheet } from '../xlsx/xlsx';

export type AuditExportRow =
  | { kind: 'building'; name: string }
  | { kind: 'remark'; n: number; l1: string; leaf: string; text: string };

function flatten<T>(entries: LevelEntry<T>[]): T[] {
  return entries.flatMap((e) => (e.kind === 'fixed' ? [e.node] : e.instances));
}

// Выбранные тексты в порядке каталога; не найденные в каталоге — в конец по алфавиту.
export function orderRemarks(selected: string[], catalogRemarks: Remark[]): string[] {
  const position = new Map<string, number>();
  catalogRemarks.forEach((r, i) => {
    const key = nameKey(r.text);
    if (!position.has(key)) position.set(key, i);
  });
  const inCatalog = (t: string) => position.has(nameKey(t));
  return [
    ...selected.filter(inCatalog).sort((a, b) => position.get(nameKey(a))! - position.get(nameKey(b))!),
    ...selected.filter((t) => !inCatalog(t)).sort((a, b) => a.localeCompare(b, 'ru')),
  ];
}

export function auditExportRows(audit: Audit, tmpl: HierarchyTemplate, catalogRemarks: Remark[]): AuditExportRow[] {
  const rows: AuditExportRow[] = [];
  let n = 0;
  for (const building of audit.buildings) {
    let opened = false;
    const resolved = resolveBuilding(building, tmpl);
    for (const l1 of flatten(resolved.level1)) {
      for (const leaf of flatten(l1.leaves)) {
        if (!leaf.source || leaf.source.remarks.length === 0) continue;
        if (!opened) {
          rows.push({ kind: 'building', name: building.name });
          opened = true;
        }
        for (const text of orderRemarks(leaf.source.remarks, catalogRemarks)) {
          rows.push({ kind: 'remark', n: ++n, l1: l1.name, leaf: leaf.name, text });
        }
      }
    }
  }
  return rows;
}

// Имя листа xlsx: без запрещённых символов, не длиннее 31.
function sheetName(name: string): string {
  const clean = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim();
  return clean || 'Аудит';
}

// Пользовательские замечания: лист «Замечания», колонки зеркалят лист каталога —
// Категория | Текст | Область (имена через «;») + строка заголовков. Такой файл можно
// дополнить в каталог и загрузить обратно. Категория пишется в каждой строке явно
// (пустая ячейка при импорте означала бы «категория строкой выше»), пустая категория —
// «Прочее». Порядок — как на экране: категории по алфавиту («Прочее» внизу), тексты по алфавиту.
export const USER_REMARKS_HEADER = ['Категория', 'Текст', 'Область'];

export function userRemarksExportRows(userRemarks: Remark[]): string[][] {
  const sorted = [...userRemarks].sort((a, b) => {
    const byCat = categoryCompare(a.category || OTHER_CATEGORY, b.category || OTHER_CATEGORY);
    return byCat !== 0 ? byCat : a.text.localeCompare(b.text, 'ru');
  });
  return sorted.map((r) => [r.category || OTHER_CATEGORY, r.text, r.binding.join('; ')]);
}

export function exportUserRemarksXlsx(userRemarks: Remark[]): Promise<Uint8Array> {
  const sheet: Worksheet = {
    name: 'Замечания',
    columns: [{ type: CellType.LONG_STRING }, { type: CellType.TEXT }, { type: CellType.LONG_STRING }],
    headers: [USER_REMARKS_HEADER.map((value) => ({ value }))],
    data: userRemarksExportRows(userRemarks).map((row) => row.map((value) => ({ value }))),
  };
  return buildXlsxFile([sheet]);
}

export function exportAuditXlsx(audit: Audit, tmpl: HierarchyTemplate, catalogRemarks: Remark[]): Promise<Uint8Array> {
  const data = auditExportRows(audit, tmpl, catalogRemarks).map((row): (Cell | null)[] => {
    if (row.kind === 'building') return [{ value: row.name, type: CellType.LONG_STRING }];
    return [{ value: String(row.n) }, { value: row.l1 }, { value: row.leaf }, { value: row.text }];
  });
  const sheet: Worksheet = {
    name: sheetName(audit.name),
    columns: [
      { type: CellType.INTEGER },
      { type: CellType.LONG_STRING },
      { type: CellType.LONG_STRING },
      { type: CellType.TEXT },
    ],
    headers: [],
    data,
  };
  return buildXlsxFile([sheet]);
}
