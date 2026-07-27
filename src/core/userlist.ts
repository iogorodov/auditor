// Слияние пользовательского списка при успешном обновлении каталога (§5). Если текст
// пользовательского замечания совпадает (без регистра, обрезка) с текстом какого-то
// предопределённого — пользовательское удаляется (его категория/привязка теряются). Выбранные в
// аудитах замечания не затрагиваются (они хранятся снимком по тексту).

import { nameKey } from './normalize.ts';
import type { Remark } from './types.ts';

export function mergeUserList(userRemarks: Remark[], predefined: Remark[]): Remark[] {
  const predefTexts = new Set(predefined.map((r) => nameKey(r.text)));
  return userRemarks.filter((u) => !predefTexts.has(nameKey(u.text)));
}
