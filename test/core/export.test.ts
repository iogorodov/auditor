import { test, expect, describe } from 'bun:test';
import {
  auditExportRows,
  exportAuditXlsx,
  exportUserRemarksXlsx,
  orderRemarks,
  USER_REMARKS_HEADER,
  userRemarksExportRows,
} from '../../src/core/export.ts';
import { parseCatalogRows } from '../../src/core/sheets.ts';
import { readXlsxSheets } from '../../src/xlsx/xlsx-read';
import type { Audit, HierarchyTemplate, Remark } from '../../src/core/types.ts';

// Шаблон в духе реального каталога: 2 фикс-узла уровня 1 + изменяемое «Помещение».
const tmpl: HierarchyTemplate = {
  level1: [
    { name: 'Документация', type: 'fixed', children: [{ name: 'Здание', type: 'fixed' }, { name: 'Другое', type: 'variable' }] },
    { name: 'Общее', type: 'fixed', children: [{ name: 'Другое', type: 'variable' }] },
    { name: 'Помещение', type: 'variable', children: [{ name: 'Помещение', type: 'fixed' }, { name: 'Щит / панель', type: 'variable' }] },
  ],
};

const catalogRemarks: Remark[] = [
  { text: 'Слишком красный цвет', category: 'К', binding: [] },
  { text: 'Нет крыши', category: 'К', binding: [] },
  { text: 'Нет заземления', category: 'К', binding: [] },
];

// Аудит из примера заказчика: Гараж (2 замечания в разных узлах) и Сарай (1 замечание в щите).
const audit: Audit = {
  id: '1',
  name: 'Проверка базы',
  time: 0,
  buildings: [
    {
      name: 'Гараж',
      nodes: [
        { name: 'Документация', nodes: [{ name: 'Здание', remarks: ['Слишком красный цвет'] }] },
        { name: 'Общее', nodes: [{ name: 'Нет крыши — узел', remarks: [] }, { name: 'Другое', remarks: ['Нет крыши'] }] },
      ],
    },
    { name: 'Пустой', nodes: [{ name: 'Документация', nodes: [{ name: 'Здание', remarks: [] }] }] },
    {
      name: 'Сарай',
      nodes: [{ name: 'Помещение 1', nodes: [{ name: 'Щит ЧЗНХ 1', remarks: ['Нет заземления'] }] }],
    },
  ],
};

describe('auditExportRows', () => {
  test('строки как в примере: здание-разделитель, сквозная нумерация, пустые узлы и здания пропущены', () => {
    expect(auditExportRows(audit, tmpl, catalogRemarks)).toEqual([
      { kind: 'building', name: 'Гараж' },
      { kind: 'remark', n: 1, l1: 'Документация', leaf: 'Здание', text: 'Слишком красный цвет' },
      { kind: 'remark', n: 2, l1: 'Общее', leaf: 'Другое', text: 'Нет крыши' },
      { kind: 'building', name: 'Сарай' },
      { kind: 'remark', n: 3, l1: 'Помещение 1', leaf: 'Щит ЧЗНХ 1', text: 'Нет заземления' },
    ]);
  });

  test('без каталога (пустой шаблон) данные не теряются', () => {
    const rows = auditExportRows(audit, { level1: [] }, []);
    expect(rows.filter((r) => r.kind === 'remark')).toHaveLength(3);
  });
});

describe('orderRemarks — порядок каталога, не порядок отметки', () => {
  test('каталожные по позиции в каталоге, прочие в конце по алфавиту', () => {
    const selected = ['Своё Б', 'Нет заземления', 'Своё А', 'Слишком красный цвет'];
    expect(orderRemarks(selected, catalogRemarks)).toEqual([
      'Слишком красный цвет',
      'Нет заземления',
      'Своё А',
      'Своё Б',
    ]);
  });

  test('сравнение с каталогом — без регистра и лишних пробелов', () => {
    expect(orderRemarks(['нет  крыши', 'СЛИШКОМ КРАСНЫЙ ЦВЕТ'], catalogRemarks)).toEqual([
      'СЛИШКОМ КРАСНЫЙ ЦВЕТ',
      'нет  крыши',
    ]);
  });
});

describe('exportAuditXlsx — round-trip через собственный reader', () => {
  test('файл открывается, лист назван по аудиту, ячейки на местах', async () => {
    const sheets = readXlsxSheets(await exportAuditXlsx(audit, tmpl, catalogRemarks));
    expect(sheets.map((s) => s.name)).toEqual(['Проверка базы']);
    expect(sheets[0]!.rows).toEqual([
      ['Гараж'],
      ['1', 'Документация', 'Здание', 'Слишком красный цвет'],
      ['2', 'Общее', 'Другое', 'Нет крыши'],
      ['Сарай'],
      ['3', 'Помещение 1', 'Щит ЧЗНХ 1', 'Нет заземления'],
    ]);
  });

  test('недопустимые символы и длина имени листа', async () => {
    const bad: Audit = { ...audit, name: 'Осень/зима: очень длинное название аудита [2026]*?' };
    const sheets = readXlsxSheets(await exportAuditXlsx(bad, tmpl, catalogRemarks));
    expect(sheets[0]!.name.length).toBeLessThanOrEqual(31);
    expect(sheets[0]!.name).not.toMatch(/[\\/?*[\]:]/);
  });
});

describe('экспорт пользовательских замечаний', () => {
  const user: Remark[] = [
    { text: 'Б-текст', category: 'Маркировка', binding: ['Щит / панель', 'Помещение'] },
    { text: 'Без категории', category: '', binding: [] },
    { text: 'А-текст', category: 'Маркировка', binding: [] },
    { text: 'Всюду', category: 'Прочее', binding: [] },
  ];

  test('строки: категории по алфавиту («Прочее» внизу), тексты по алфавиту, привязка через «;»', () => {
    expect(userRemarksExportRows(user)).toEqual([
      ['Маркировка', 'А-текст', ''],
      ['Маркировка', 'Б-текст', 'Щит / панель; Помещение'],
      ['Прочее', 'Без категории', ''],
      ['Прочее', 'Всюду', ''],
    ]);
  });

  test('round-trip: выгрузка читается parseCatalogRows в исходный список', async () => {
    const sheets = readXlsxSheets(await exportUserRemarksXlsx(user));
    expect(sheets.map((s) => s.name)).toEqual(['Замечания']);
    expect(sheets[0]!.rows[0]).toEqual(USER_REMARKS_HEADER);
    const parsed = parseCatalogRows(sheets[0]!.rows);
    expect(parsed).toEqual([
      { text: 'А-текст', category: 'Маркировка', binding: [] },
      { text: 'Б-текст', category: 'Маркировка', binding: ['Щит / панель', 'Помещение'] },
      { text: 'Без категории', category: 'Прочее', binding: [] },
      { text: 'Всюду', category: 'Прочее', binding: [] },
    ]);
  });

  test('пустой список — только заголовок', async () => {
    const sheets = readXlsxSheets(await exportUserRemarksXlsx([]));
    expect(sheets[0]!.rows).toEqual([USER_REMARKS_HEADER]);
  });
});
