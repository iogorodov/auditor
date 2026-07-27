// Парсинг двух листов каталога (§4). Позиционные колонки — «именно в таком порядке».
// Вход — «строки таблицы» (string[][], включая заголовок); их даёт xlsx-чтение (src/xlsx/xlsx-read).

import { normalize } from './normalize.ts';
import { OTHER_CATEGORY, type HierarchyTemplate, type Level1Slot, type Remark, type SlotType } from './types.ts';

// Первая строка листа — заголовок; данные с неё не читаем.
function dataRows(rows: string[][]): string[][] {
  return rows.slice(1);
}

function slotType(fixedCell: string): SlotType {
  // «Фиксированный» = TRUE → фиксированный; пусто/иное → изменяемый (§4).
  return normalize(fixedCell).toUpperCase() === 'TRUE' ? 'fixed' : 'variable';
}

// Лист «Иерархия»: порядок строк = структура. Непустой «Уровень 1» открывает узел;
// последующие строки с непустым «Уровень 2» — его дети до следующего «Уровень 1».
export function parseHierarchyRows(rows: string[][]): HierarchyTemplate {
  const level1: Level1Slot[] = [];
  let current: Level1Slot | null = null;
  for (const row of dataRows(rows)) {
    const l1 = normalize(row[0] ?? '');
    const l2 = normalize(row[1] ?? '');
    const type = slotType(row[2] ?? '');
    if (l1) {
      current = { name: l1, type, children: [] };
      level1.push(current);
    } else if (l2 && current) {
      current.children.push({ name: l2, type });
    }
  }
  return { level1 };
}

function splitBinding(area: string): string[] {
  const a = normalize(area);
  if (!a) return []; // пустая привязка = применимо везде (§3.2)
  return a
    .split(';')
    .map((s) => normalize(s))
    .filter((s) => s.length > 0);
}

// Лист «Замечания»: колонки Категория, Текст, Область. «Категория» — с заполнением сверху вниз
// (пустая ячейка = категория строкой выше). Пустой текст — не одна из двух ошибок каталога,
// такие строки просто отбрасываем.
export function parseCatalogRows(rows: string[][]): Remark[] {
  const remarks: Remark[] = [];
  let lastCategory = '';
  for (const row of dataRows(rows)) {
    const cat = normalize(row[0] ?? '');
    const text = normalize(row[1] ?? '');
    if (cat) lastCategory = cat;
    if (!text) continue;
    remarks.push({
      text,
      category: lastCategory || OTHER_CATEGORY,
      binding: splitBinding(row[2] ?? ''),
    });
  }
  return remarks;
}
