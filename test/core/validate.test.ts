import { test, expect, describe } from 'bun:test';
import { validateCatalog } from '../../src/core/validate.ts';
import { fixtureCatalog } from '../fixtures.ts';
import type { HierarchyTemplate, Remark } from '../../src/core/types.ts';

const { hierarchy: realHierarchy, remarks: realRemarks } = fixtureCatalog();

describe('validateCatalog — реальные данные валидны', () => {
  test('нет ошибок', () => {
    expect(validateCatalog(realHierarchy, realRemarks)).toEqual([]);
  });
});

describe('ошибка иерархии: не ровно один изменяемый слот', () => {
  test('два изменяемых на уровне 1', () => {
    const h: HierarchyTemplate = {
      level1: [
        { name: 'A', type: 'variable', children: [{ name: 'x', type: 'variable' }] },
        { name: 'B', type: 'variable', children: [{ name: 'y', type: 'variable' }] },
      ],
    };
    const errs = validateCatalog(h, []);
    expect(errs.some((e) => e.kind === 'hierarchy' && e.message.includes('уровень 1') && e.message.includes('найдено 2'))).toBe(true);
  });

  test('ноль изменяемых среди детей родителя', () => {
    const h: HierarchyTemplate = {
      level1: [{ name: 'Родитель', type: 'variable', children: [{ name: 'x', type: 'fixed' }] }],
    };
    const errs = validateCatalog(h, []);
    expect(errs.some((e) => e.message.includes('уровень «Родитель»') && e.message.includes('найдено 0'))).toBe(true);
  });
});

describe('ошибка привязки: несуществующий узел', () => {
  const h: HierarchyTemplate = {
    level1: [{ name: 'Помещение', type: 'variable', children: [{ name: 'Щит / панель', type: 'variable' }] }],
  };

  test('ссылка на «Шкаф» репортится', () => {
    const remarks: Remark[] = [{ text: 'Нет заземления', category: 'Э', binding: ['Шкаф'] }];
    const errs = validateCatalog(h, remarks);
    expect(errs).toContainEqual({
      kind: 'binding',
      message: 'Замечание «Нет заземления»: привязка ссылается на несуществующий элемент «Шкаф»',
    });
  });

  test('существующее имя (без регистра) — не ошибка; пустая привязка — не ошибка', () => {
    const remarks: Remark[] = [
      { text: 'A', category: 'К', binding: ['щит / ПАНЕЛЬ'] },
      { text: 'B', category: 'К', binding: [] },
    ];
    expect(validateCatalog(h, remarks)).toEqual([]);
  });
});
