import { test, expect, describe } from 'bun:test';
import { fixtureCatalog } from '../fixtures.ts';
import {
  resolveBuilding,
  resolveLevel1,
  countAudit,
  countBuilding,
  applyReorder,
  type LevelEntry,
} from '../../src/core/merge.ts';
import type { Audit, AuditBuilding, HierarchyTemplate } from '../../src/core/types.ts';

const tmpl = fixtureCatalog().hierarchy;

// helpers
const names = <T extends { name: string }>(entries: LevelEntry<T>[]): string[] =>
  entries.flatMap((e) => (e.kind === 'fixed' ? [e.node.name] : e.instances.map((i) => i.name)));
const kinds = (entries: LevelEntry<unknown>[]) => entries.map((e) => e.kind);

describe('resolveLevel1 — подмешивание пустых фикс-слотов', () => {
  const entries = resolveLevel1([], tmpl);

  test('порядок и вид записей = шаблон (2 фикс + группа изменяемого)', () => {
    expect(kinds(entries)).toEqual(['fixed', 'fixed', 'group']);
    expect(names(entries)).toEqual(['Документация', 'Общее']); // группа Помещение пуста
  });

  test('подпись изменяемой группы — из шаблона', () => {
    const group = entries[2]!;
    expect(group.kind).toBe('group');
    if (group.kind === 'group') {
      expect(group.slotName).toBe('Помещение');
      expect(group.instances).toEqual([]);
    }
  });

  test('пустой фикс-узел «Документация» получает свои листья из шаблона', () => {
    const doc = entries[0]!;
    if (doc.kind !== 'fixed') throw new Error('ожидался fixed');
    expect(kinds(doc.node.leaves)).toEqual(['fixed', 'group']); // Здание(fixed), Другое(group)
    expect(names(doc.node.leaves)).toEqual(['Здание']);
    expect(doc.node.count).toBe(0);
  });
});

describe('resolveBuilding — разрешение имён и счётчики', () => {
  const building: AuditBuilding = {
    name: 'Гараж',
    nodes: [
      {
        name: 'Документация', // → фикс-слот
        nodes: [{ name: 'Здание', remarks: ['Все пропало'] }],
      },
      {
        name: 'Основное строение', // → экземпляр изменяемого слота «Помещение»
        nodes: [
          { name: 'Помещение', remarks: [] }, // фикс-лист
          { name: 'Щит ЧЗНХ №12', remarks: ['Нет заземления', 'Нет бирок'] }, // экземпляр «Щит / панель»
        ],
      },
    ],
  };
  const rb = resolveBuilding(building, tmpl);

  test('«Основное строение» разрешилось в экземпляр группы «Помещение»', () => {
    const group = rb.level1.find((e) => e.kind === 'group');
    if (!group || group.kind !== 'group') throw new Error('нет группы');
    expect(group.slotName).toBe('Помещение');
    expect(group.instances.map((i) => i.name)).toEqual(['Основное строение']);
    expect(group.instances[0]!.type).toBe('variable');
  });

  test('листья экземпляра разрешены по шаблону изменяемого слота', () => {
    const inst = rb.level1.find((e) => e.kind === 'group')!;
    if (inst.kind !== 'group') throw new Error();
    const leaves = inst.instances[0]!.leaves;
    // фикс-лист «Помещение», затем группа «Щит / панель» с экземпляром
    expect(kinds(leaves)).toEqual(['fixed', 'group']);
    expect(names(leaves)).toEqual(['Помещение', 'Щит ЧЗНХ №12']);
  });

  test('агрегация счётчиков: лист→уровень1→здание', () => {
    // Документация: 1 (Все пропало). Основное строение: 0 + 2 = 2. Итого 3.
    const doc = rb.level1[0]!;
    if (doc.kind !== 'fixed') throw new Error();
    expect(doc.node.count).toBe(1);
    const grp = rb.level1.find((e) => e.kind === 'group')!;
    if (grp.kind !== 'group') throw new Error();
    expect(grp.instances[0]!.count).toBe(2);
    expect(rb.count).toBe(3);
    expect(countBuilding(building)).toBe(3);
  });
});

describe('обратимость разрешения имён (§3.4)', () => {
  // Снимок с узлом «Документация», содержащим замечание.
  const building: AuditBuilding = {
    name: 'Дом',
    nodes: [{ name: 'Документация', nodes: [{ name: 'Здание', remarks: ['R1'] }] }],
  };
  // Шаблон, где «Документация» стала изменяемой (фикс-слот пропал), а изменяемый слот — «Документация»?
  // Возьмём шаблон без фикс-«Документация»: один изменяемый слот уровня 1.
  const altTmpl: HierarchyTemplate = {
    level1: [{ name: 'Раздел', type: 'variable', children: [{ name: 'Здание', type: 'fixed' }] }],
  };

  test('пропал фикс-слот → узел становится изменяемым экземпляром, замечания целы', () => {
    const rb = resolveBuilding(building, altTmpl);
    const grp = rb.level1[0]!;
    if (grp.kind !== 'group') throw new Error();
    expect(grp.instances.map((i) => i.name)).toEqual(['Документация']);
    expect(grp.instances[0]!.count).toBe(1); // замечание не потеряно
  });

  test('возврат исходного шаблона → снова фиксированный, содержимое как было', () => {
    const rb = resolveBuilding(building, tmpl);
    const doc = rb.level1[0]!;
    if (doc.kind !== 'fixed') throw new Error();
    expect(doc.node.name).toBe('Документация');
    expect(doc.node.type).toBe('fixed');
    expect(doc.node.count).toBe(1);
  });
});

describe('позиция изменяемой группы — из шаблона (в середине)', () => {
  const midTmpl: HierarchyTemplate = {
    level1: [
      { name: 'A', type: 'fixed', children: [] },
      { name: 'Var', type: 'variable', children: [] },
      { name: 'B', type: 'fixed', children: [] },
    ],
  };
  test('группа между фикс-A и фикс-B', () => {
    const entries = resolveLevel1([{ name: 'x', nodes: [] }], midTmpl);
    expect(kinds(entries)).toEqual(['fixed', 'group', 'fixed']);
    expect(entries[0]!.kind === 'fixed' && entries[0]!.node.name).toBe('A');
    expect(entries[2]!.kind === 'fixed' && entries[2]!.node.name).toBe('B');
  });
});

describe('applyReorder — ручная сортировка экземпляров', () => {
  const fixed = { name: 'Документация' };
  const a = { name: 'Кладовка' };
  const b = { name: 'Подвал' };

  test('экземпляры в новом порядке, остальные узлы как были', () => {
    expect(applyReorder([fixed, a, b], [b, a])).toEqual([fixed, b, a]);
  });

  test('экземпляр с именем фикс-слота не задваивается (сопоставление по идентичности)', () => {
    const dup = { name: 'Документация' }; // экземпляр, названный как фикс-слот
    const next = applyReorder([fixed, dup, a], [a, dup]);
    expect(next).toHaveLength(3);
    expect(next[0]).toBe(fixed);
    expect(next[1]).toBe(a);
    expect(next[2]).toBe(dup);
  });
});

describe('countAudit', () => {
  test('сумма по всем зданиям', () => {
    const audit: Audit = {
      id: '1',
      name: 'A',
      time: 0,
      buildings: [
        { name: 'B1', nodes: [{ name: 'X', nodes: [{ name: 'Y', remarks: ['a', 'b'] }] }] },
        { name: 'B2', nodes: [{ name: 'X', nodes: [{ name: 'Y', remarks: ['c'] }] }] },
      ],
    };
    expect(countAudit(audit)).toBe(3);
  });
});
