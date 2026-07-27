// Экран замечаний листа (§6.6). Строит сгруппированный по категориям список замечаний, применимых
// к листу: предопределённые (в порядке каталога), затем пользовательские (по алфавиту). Категория
// в аудите не хранится, а разрешается по совпадению текста; выбранный текст, не найденный среди
// применимых, показывается в «Прочее» как пользовательское (§3.4). Категории сортируются по имени,
// «Прочее» всегда внизу.

import { nameKey } from './normalize.ts';
import { remarkApplies } from './binding.ts';
import { OTHER_CATEGORY, type Remark } from './types.ts';

export interface LeafRemarkItem {
  text: string;
  category: string;
  checked: boolean; // текст присутствует среди выбранных в снимке
  isUser: boolean; // пользовательское (или сирота) — визуально не выделяется, но нужно для правки
}

export interface LeafCategory {
  name: string;
  items: LeafRemarkItem[];
  selected: number;
  total: number;
}

export interface LeafRemarksInput {
  selectedTexts: string[]; // remarks листа из снимка
  predefined: Remark[]; // каталог
  userRemarks: Remark[];
  leafSlotName: string;
  parentSlotName: string;
}

export function categoryCompare(a: string, b: string): number {
  if (a === OTHER_CATEGORY && b !== OTHER_CATEGORY) return 1;
  if (b === OTHER_CATEGORY && a !== OTHER_CATEGORY) return -1;
  return a.localeCompare(b, 'ru');
}

export function resolveLeafRemarks(input: LeafRemarksInput): LeafCategory[] {
  const { selectedTexts, predefined, userRemarks, leafSlotName, parentSlotName } = input;
  const selectedSet = new Set(selectedTexts.map(nameKey));
  const applies = (r: Remark) => remarkApplies(r.binding, leafSlotName, parentSlotName);

  interface Item extends LeafRemarkItem {
    order: number; // порядок каталога для предопределённых
  }
  const items: Item[] = [];
  const represented = new Set<string>();

  // Предопределённые, применимые к листу — в порядке каталога.
  predefined.filter(applies).forEach((r, i) => {
    const key = nameKey(r.text);
    represented.add(key);
    items.push({ text: r.text, category: r.category || OTHER_CATEGORY, checked: selectedSet.has(key), isUser: false, order: i });
  });

  // Пользовательские, применимые к листу — по алфавиту; текст-дубликат предопределённого пропускаем.
  for (const r of userRemarks.filter(applies)) {
    const key = nameKey(r.text);
    if (represented.has(key)) continue;
    represented.add(key);
    items.push({ text: r.text, category: r.category || OTHER_CATEGORY, checked: selectedSet.has(key), isUser: true, order: 0 });
  }

  // Сироты: выбранный текст не найден среди применимых → «Прочее» как пользовательское, отмечено.
  for (const text of selectedTexts) {
    const key = nameKey(text);
    if (represented.has(key)) continue;
    represented.add(key);
    items.push({ text, category: OTHER_CATEGORY, checked: true, isUser: true, order: 0 });
  }

  // Группировка по категории.
  const byCat = new Map<string, Item[]>();
  for (const it of items) {
    const arr = byCat.get(it.category);
    if (arr) arr.push(it);
    else byCat.set(it.category, [it]);
  }

  return [...byCat.keys()].sort(categoryCompare).map((name) => {
    const list = byCat.get(name)!;
    const predef = list.filter((i) => !i.isUser).sort((a, b) => a.order - b.order);
    const user = list.filter((i) => i.isUser).sort((a, b) => a.text.localeCompare(b.text, 'ru'));
    const ordered: LeafRemarkItem[] = [...predef, ...user].map(({ order: _order, ...rest }) => rest);
    return { name, items: ordered, selected: ordered.filter((i) => i.checked).length, total: ordered.length };
  });
}
