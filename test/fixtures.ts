// Общий доступ к xlsx-фикстурам каталога для юнит-тестов.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsxSheets, type SheetRows } from '../src/xlsx/xlsx-read';
import { parseHierarchyRows, parseCatalogRows } from '../src/core/sheets.ts';
import type { HierarchyTemplate, Remark } from '../src/core/types.ts';

export const fixturePath = (name: string) => join(import.meta.dir, 'fixtures', name);

export const fixtureBytes = (name: string) => new Uint8Array(readFileSync(fixturePath(name)));

export function catalogSheets(name = 'catalog.xlsx'): SheetRows[] {
  return readXlsxSheets(fixtureBytes(name));
}

export function sheetRows(sheets: SheetRows[], sheetName: string): string[][] {
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`В фикстуре нет листа «${sheetName}»`);
  return sheet.rows;
}

// Каталог из фикстуры целиком: иерархия + замечания.
export function fixtureCatalog(name = 'catalog.xlsx'): { hierarchy: HierarchyTemplate; remarks: Remark[] } {
  const sheets = catalogSheets(name);
  return {
    hierarchy: parseHierarchyRows(sheetRows(sheets, 'Иерархия')),
    remarks: parseCatalogRows(sheetRows(sheets, 'Замечания')),
  };
}
