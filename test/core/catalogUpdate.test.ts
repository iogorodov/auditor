import { test, expect, describe } from 'bun:test';
import { updateCatalogFromXlsx } from '../../src/core/catalogUpdate.ts';
import { buildXlsxFile, CellType, type Worksheet } from '../../src/xlsx/xlsx';
import type { Remark } from '../../src/core/types.ts';

import { fixtureBytes as loadFixture } from '../fixtures.ts';

const fixtureBytes = loadFixture('catalog.xlsx');

// Книга из «строк таблицы» (включая заголовки) — для сценариев с испорченным каталогом.
function makeXlsx(sheets: { name: string; rows: string[][] }[]): Promise<Uint8Array> {
  const worksheets: Worksheet[] = sheets.map((s) => ({
    name: s.name,
    columns: [{ type: CellType.TEXT }, { type: CellType.TEXT }, { type: CellType.TEXT }],
    headers: [],
    data: s.rows.map((row) => row.map((value) => ({ value }))),
  }));
  return buildXlsxFile(worksheets);
}

const GOOD_HIERARCHY = [
  ['Уровень 1', 'Уровень 2', 'Фиксированный'],
  ['Общее', '', 'TRUE'],
  ['', 'Прочее', ''],
  ['Помещение', '', ''],
  ['', 'Щит', ''],
];
const GOOD_REMARKS = [
  ['Категория', 'Текст', 'Область'],
  ['К', 'Первое замечание', ''],
];

describe('updateCatalogFromXlsx', () => {
  test('успех на реальной фикстуре (Excel)', () => {
    const res = updateCatalogFromXlsx(fixtureBytes, []);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.catalog.hierarchy.level1.map((s) => s.name)).toEqual(['Документация', 'Общее', 'Помещение']);
      expect(res.catalog.remarks.length).toBe(10);
    }
  });

  test('слияние пользовательского списка при успехе', () => {
    const dupText = 'Покрасить жёлтую дверь в синий цвет'; // есть в каталоге
    const user: Remark[] = [
      { text: dupText, category: 'Моё', binding: [] },
      { text: 'Уникальное моё', category: 'Моё', binding: [] },
    ];
    const res = updateCatalogFromXlsx(fixtureBytes, user);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.userRemarks.map((r) => r.text)).toEqual(['Уникальное моё']);
  });

  test('ошибка структуры иерархии → ok=false, старый кэш решает вызывающий', async () => {
    const badHierarchy = [
      ['Уровень 1', 'Уровень 2', 'Фиксированный'],
      ['A', '', ''],
      ['B', '', ''], // два изменяемых слота уровня 1
    ];
    const xlsx = await makeXlsx([
      { name: 'Иерархия', rows: badHierarchy },
      { name: 'Замечания', rows: GOOD_REMARKS },
    ]);
    const res = updateCatalogFromXlsx(xlsx, []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.kind === 'hierarchy')).toBe(true);
  });

  test('ошибка привязки на несуществующий узел', async () => {
    const badRemarks = [
      ['Категория', 'Текст', 'Область'],
      ['К', 'Замечание', 'Несуществующий узел'],
    ];
    const xlsx = await makeXlsx([
      { name: 'Иерархия', rows: GOOD_HIERARCHY },
      { name: 'Замечания', rows: badRemarks },
    ]);
    const res = updateCatalogFromXlsx(xlsx, []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.kind).toBe('binding');
  });

  test('имена листов — без регистра и лишних пробелов', async () => {
    const xlsx = await makeXlsx([
      { name: '  иерархия ', rows: GOOD_HIERARCHY },
      { name: 'ЗАМЕЧАНИЯ', rows: GOOD_REMARKS },
    ]);
    expect(updateCatalogFromXlsx(xlsx, []).ok).toBe(true);
  });

  test('нет нужных листов → file-ошибка с именами', async () => {
    const xlsx = await makeXlsx([{ name: 'Другой лист', rows: GOOD_REMARKS }]);
    const res = updateCatalogFromXlsx(xlsx, []);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]!.kind).toBe('file');
      expect(res.errors[0]!.message).toContain('Иерархия');
      expect(res.errors[0]!.message).toContain('Замечания');
    }
  });

  test('не-xlsx данные → file-ошибка', () => {
    const res = updateCatalogFromXlsx(new TextEncoder().encode('не файл'), []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.kind).toBe('file');
  });
});
