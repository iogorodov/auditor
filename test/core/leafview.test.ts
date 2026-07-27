import { test, expect, describe } from 'bun:test';
import { resolveLeafRemarks, categoryCompare } from '../../src/core/leafview.ts';
import type { Remark } from '../../src/core/types.ts';

const r = (text: string, category: string, binding: string[] = []): Remark => ({ text, category, binding });

describe('categoryCompare — «Прочее» всегда внизу', () => {
  test('сортировка', () => {
    expect(['Прочее', 'Электрика', 'Аварии'].sort(categoryCompare)).toEqual(['Аварии', 'Электрика', 'Прочее']);
  });
});

describe('resolveLeafRemarks', () => {
  const predefined: Remark[] = [
    r('Нет схемы', 'Документация', ['Помещение']),
    r('Нет заземления', 'Электрика', ['Помещение']),
    r('Нет выключателя', 'Электрика', ['Помещение']),
    r('Только для документации', 'Документация', ['Документация']), // не применимо к щиту
  ];

  test('фильтр по применимости к листу (щит, родитель Помещение)', () => {
    const cats = resolveLeafRemarks({
      selectedTexts: [],
      predefined,
      userRemarks: [],
      leafSlotName: 'Щит / панель',
      parentSlotName: 'Помещение',
    });
    const allTexts = cats.flatMap((c) => c.items.map((i) => i.text));
    expect(allTexts).toContain('Нет заземления');
    expect(allTexts).not.toContain('Только для документации');
  });

  test('порядок категорий и подсчёт selected/total', () => {
    const cats = resolveLeafRemarks({
      selectedTexts: ['Нет заземления'],
      predefined,
      userRemarks: [],
      leafSlotName: 'Щит / панель',
      parentSlotName: 'Помещение',
    });
    expect(cats.map((c) => c.name)).toEqual(['Документация', 'Электрика']); // по алфавиту
    const el = cats.find((c) => c.name === 'Электрика')!;
    expect(el.total).toBe(2);
    expect(el.selected).toBe(1);
    expect(el.items.find((i) => i.text === 'Нет заземления')!.checked).toBe(true);
  });

  test('пользовательские идут после предопределённых внутри категории, по алфавиту', () => {
    const user: Remark[] = [r('Яблоко', 'Электрика', []), r('Арбуз', 'Электрика', [])];
    const cats = resolveLeafRemarks({
      selectedTexts: [],
      predefined,
      userRemarks: user,
      leafSlotName: 'Щит / панель',
      parentSlotName: 'Помещение',
    });
    const el = cats.find((c) => c.name === 'Электрика')!;
    expect(el.items.map((i) => i.text)).toEqual(['Нет заземления', 'Нет выключателя', 'Арбуз', 'Яблоко']);
    expect(el.items.map((i) => i.isUser)).toEqual([false, false, true, true]);
  });

  test('сирота-замечание → «Прочее» как пользовательское, отмечено', () => {
    const cats = resolveLeafRemarks({
      selectedTexts: ['Замечание которого нет в каталоге'],
      predefined,
      userRemarks: [],
      leafSlotName: 'Щит / панель',
      parentSlotName: 'Помещение',
    });
    const other = cats.find((c) => c.name === 'Прочее')!;
    expect(other).toBeDefined();
    const orphan = other.items.find((i) => i.text === 'Замечание которого нет в каталоге')!;
    expect(orphan.checked).toBe(true);
    expect(orphan.isUser).toBe(true);
  });

  test('дубликат текста (пользовательское = предопределённое) не задваивается', () => {
    const user: Remark[] = [r('нет заземления', 'Прочее', [])]; // тот же текст, иной регистр
    const cats = resolveLeafRemarks({
      selectedTexts: [],
      predefined,
      userRemarks: user,
      leafSlotName: 'Щит / панель',
      parentSlotName: 'Помещение',
    });
    const all = cats.flatMap((c) => c.items.map((i) => i.text.toLowerCase()));
    expect(all.filter((t) => t === 'нет заземления').length).toBe(1);
  });
});
