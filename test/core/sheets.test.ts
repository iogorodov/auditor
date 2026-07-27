import { test, expect, describe } from 'bun:test';
import { parseHierarchyRows, parseCatalogRows } from '../../src/core/sheets.ts';
import { fixtureCatalog } from '../fixtures.ts';

const HEADER3 = ['Уровень 1', 'Уровень 2', 'Фиксированный'];

describe('parseHierarchyRows (реальная фикстура catalog.xlsx)', () => {
  const h = fixtureCatalog().hierarchy;

  test('три слота уровня 1 в порядке строк', () => {
    expect(h.level1.map((s) => s.name)).toEqual(['Документация', 'Общее', 'Помещение']);
  });

  test('типы слотов уровня 1: Документация/Общее фиксированные, Помещение изменяемый', () => {
    expect(h.level1.map((s) => s.type)).toEqual(['fixed', 'fixed', 'variable']);
  });

  test('дети «Документация» — Здание(fixed), Другое(variable)', () => {
    const doc = h.level1[0]!;
    expect(doc.children).toEqual([
      { name: 'Здание', type: 'fixed' },
      { name: 'Другое', type: 'variable' },
    ]);
  });

  test('дети «Помещение» — Помещение(fixed), Щит / панель(variable)', () => {
    const room = h.level1[2]!;
    expect(room.children).toEqual([
      { name: 'Помещение', type: 'fixed' },
      { name: 'Щит / панель', type: 'variable' },
    ]);
  });
});

describe('parseHierarchyRows (синтетика)', () => {
  test('пробелы в «Фиксированный» и регистр TRUE', () => {
    const h = parseHierarchyRows([HEADER3, ['A', '', ' true '], ['', 'B', ''], ['', 'C', 'TRUE']]);
    expect(h.level1[0]!.type).toBe('fixed'); // " true " → fixed
    expect(h.level1[0]!.children).toEqual([
      { name: 'B', type: 'variable' },
      { name: 'C', type: 'fixed' },
    ]);
  });

  test('лист-сирота без родителя игнорируется', () => {
    const h = parseHierarchyRows([HEADER3, ['', 'Осиротевший', ''], ['Родитель', '', 'TRUE'], ['', 'Ребёнок', 'TRUE']]);
    expect(h.level1.map((s) => s.name)).toEqual(['Родитель']);
    expect(h.level1[0]!.children).toEqual([{ name: 'Ребёнок', type: 'fixed' }]);
  });

  test('короткие и пустые строки не ломают разбор', () => {
    const h = parseHierarchyRows([HEADER3, [], ['A'], [''], ['', 'B']]);
    expect(h.level1.map((s) => s.name)).toEqual(['A']);
    expect(h.level1[0]!.children).toEqual([{ name: 'B', type: 'variable' }]);
  });
});

describe('parseCatalogRows (реальная фикстура catalog.xlsx)', () => {
  const remarks = fixtureCatalog().remarks;

  test('строки с пустым текстом отброшены', () => {
    expect(remarks.length).toBe(10); // в фикстуре 11 строк, одна — с пустым текстом
    expect(remarks.every((r) => r.text.length > 0)).toBe(true);
  });

  test('категория протянута сверху вниз', () => {
    expect(remarks[0]!.category).toBe('Покраска');
    // строка с пустой ячейкой категории наследует категорию строкой выше
    expect(remarks.find((r) => r.text.startsWith('Дверь скрипит'))!.category).toBe('Покраска');
    const cats = new Set(remarks.map((r) => r.category));
    expect(cats.has('Таблички')).toBe(true);
    expect(cats.has('Провода')).toBe(true);
  });

  test('привязка нормализована (все значения — «Помещение»)', () => {
    expect(remarks.every((r) => r.binding.length === 1 && r.binding[0] === 'Помещение')).toBe(true);
  });

  test('текст с запятой не разбился на колонки', () => {
    const r = remarks.find((x) => x.text.startsWith('Табличка'));
    expect(r?.text).toBe('Табличка «Не влезай» висит, а лестницы нет');
  });
});

describe('parseCatalogRows (синтетика)', () => {
  const HEADER = ['Категория', 'Текст', 'Область'];

  test('привязка: split по ;, нормализация, пустая = []', () => {
    const r = parseCatalogRows([
      HEADER,
      ['Кат', 'Замечание с областями', ' Помещение ; Щит / панель '],
      ['', 'Везде', ''],
    ]);
    expect(r[0]!.binding).toEqual(['Помещение', 'Щит / панель']);
    expect(r[1]!.binding).toEqual([]);
  });

  test('нормализация текста: переносы/двойные пробелы схлопываются', () => {
    const r = parseCatalogRows([HEADER, ['К', 'Строка\nвторая   часть', '']]);
    expect(r[0]!.text).toBe('Строка вторая часть');
  });

  test('категория до первого заполнения → Прочее', () => {
    const r = parseCatalogRows([HEADER, ['', 'Без категории', '']]);
    expect(r[0]!.category).toBe('Прочее');
  });
});
