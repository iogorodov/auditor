// Правило привязки (§3.2). Замечание применимо к листу уровня 2, если его привязка содержит имя,
// совпадающее с ШАБЛОННЫМ именем самого листа ИЛИ его родителя (уровень 1). Сравнение — по nameKey
// (без регистра, обрезка). Пустая привязка = применимо везде. Имена — шаблонные, не имена
// пользовательских экземпляров.

import { nameKey } from './normalize.ts';
import type { Remark } from './types.ts';

export function remarkApplies(binding: string[], leafSlotName: string, parentSlotName: string): boolean {
  if (binding.length === 0) return true;
  const wanted = new Set(binding.map(nameKey));
  return wanted.has(nameKey(leafSlotName)) || wanted.has(nameKey(parentSlotName));
}

export function remarksForLeaf(remarks: Remark[], leafSlotName: string, parentSlotName: string): Remark[] {
  return remarks.filter((r) => remarkApplies(r.binding, leafSlotName, parentSlotName));
}
