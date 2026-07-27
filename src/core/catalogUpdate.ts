// Оркестрация «Обновить каталог» из xlsx-файла (V2; правила обновления — из V1 §5: бинарная
// валидация, «всё или ничего»). Без DOM: на входе байты файла, выбранного пользователем.
// Успех → новый каталог + слитый пользовательский список. Любая ошибка (файл/структура/привязка) →
// результат-ошибка; вызывающий сохраняет старый кэш.

import { readXlsxSheets, XlsxReadError, type SheetRows } from '../xlsx/xlsx-read';
import { parseHierarchyRows, parseCatalogRows } from './sheets.ts';
import { validateCatalog, type CatalogError } from './validate.ts';
import { mergeUserList } from './userlist.ts';
import { nameKey } from './normalize.ts';
import type { Catalog, Remark } from './types.ts';

// Листы каталога ищутся по этим именам (без регистра/пробелов, как все имена).
export const HIERARCHY_SHEET_NAME = 'Иерархия';
export const REMARKS_SHEET_NAME = 'Замечания';

export interface UpdateSuccess {
  ok: true;
  catalog: Catalog;
  userRemarks: Remark[]; // слитый список (совпавшие с предопределёнными удалены)
}
export interface UpdateFailure {
  ok: false;
  errors: CatalogError[];
}
export type UpdateResult = UpdateSuccess | UpdateFailure;

function findSheet(sheets: SheetRows[], name: string): SheetRows | undefined {
  return sheets.find((s) => nameKey(s.name) === nameKey(name));
}

function fileError(message: string): UpdateFailure {
  return { ok: false, errors: [{ kind: 'file', message }] };
}

export function updateCatalogFromXlsx(data: Uint8Array, currentUserRemarks: Remark[]): UpdateResult {
  let sheets: SheetRows[];
  try {
    sheets = readXlsxSheets(data);
  } catch (e) {
    return fileError(e instanceof XlsxReadError ? e.message : 'Не удалось прочитать файл.');
  }

  const hierarchySheet = findSheet(sheets, HIERARCHY_SHEET_NAME);
  const remarksSheet = findSheet(sheets, REMARKS_SHEET_NAME);
  if (!hierarchySheet || !remarksSheet) {
    const missing = [
      hierarchySheet ? null : `«${HIERARCHY_SHEET_NAME}»`,
      remarksSheet ? null : `«${REMARKS_SHEET_NAME}»`,
    ].filter((s) => s !== null);
    return fileError(`В файле нет листа ${missing.join(' и листа ')}`);
  }

  const hierarchy = parseHierarchyRows(hierarchySheet.rows);
  const remarks = parseCatalogRows(remarksSheet.rows);
  const errors = validateCatalog(hierarchy, remarks);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    catalog: { hierarchy, remarks },
    userRemarks: mergeUserList(currentUserRemarks, remarks),
  };
}
