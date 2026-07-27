// Бинарная валидация каталога (§5). Ровно две ошибки; остальное не репортим. Каталог применяется
// целиком только если ошибок нет. Здесь — только сбор ошибок; «всё или ничего» решает загрузчик.

import { nameKey } from './normalize.ts';
import type { HierarchyTemplate, Remark } from './types.ts';

// 'hierarchy' | 'binding' — две содержательные ошибки каталога (§5). 'file' добавляет загрузчик,
// если xlsx-файл не читается или в нём нет нужных листов — показывается в том же диалоге,
// старый кэш при этом цел.
export interface CatalogError {
  kind: 'hierarchy' | 'binding' | 'file';
  message: string;
}

function checkOneVariable(levelLabel: string, slots: { type: string }[], errors: CatalogError[]): void {
  const n = slots.filter((s) => s.type === 'variable').length;
  if (n !== 1) {
    errors.push({
      kind: 'hierarchy',
      message: `Иерархия, ${levelLabel}: должен быть ровно один изменяемый элемент (найдено ${n})`,
    });
  }
}

export function validateCatalog(hierarchy: HierarchyTemplate, remarks: Remark[]): CatalogError[] {
  const errors: CatalogError[] = [];

  // Ошибка 1: на каждом уровне (в пределах одного родителя) — ровно один изменяемый слот.
  checkOneVariable('уровень 1', hierarchy.level1, errors);
  for (const slot of hierarchy.level1) {
    checkOneVariable(`уровень «${slot.name}»`, slot.children, errors);
  }

  // Ошибка 2: привязка замечания ссылается на несуществующее имя узла иерархии.
  const nodeNames = new Set<string>();
  for (const s of hierarchy.level1) {
    nodeNames.add(nameKey(s.name));
    for (const c of s.children) nodeNames.add(nameKey(c.name));
  }
  for (const r of remarks) {
    for (const name of r.binding) {
      if (!nodeNames.has(nameKey(name))) {
        errors.push({
          kind: 'binding',
          message: `Замечание «${r.text}»: привязка ссылается на несуществующий элемент «${name}»`,
        });
      }
    }
  }

  return errors;
}
