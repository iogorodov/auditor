import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { buildXlsxFile, CellType, type Worksheet } from '../../src/xlsx/xlsx';

const catalogXlsxPath = join(import.meta.dirname, '../fixtures/catalog.xlsx');

// Книга каталога из «строк таблицы» — для сценариев с испорченным каталогом.
export async function makeCatalogXlsx(sheets: { name: string; rows: string[][] }[]): Promise<Buffer> {
  const worksheets: Worksheet[] = sheets.map((s) => ({
    name: s.name,
    columns: [{ type: CellType.TEXT }, { type: CellType.TEXT }, { type: CellType.TEXT }],
    headers: [],
    data: s.rows.map((row) => row.map((value) => ({ value }))),
  }));
  return Buffer.from(await buildXlsxFile(worksheets));
}

// Нажать ↻ и выбрать файл каталога (по умолчанию — реальная фикстура catalog.xlsx).
export async function chooseCatalogFile(page: Page, buffer?: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTitle('Обновить каталог').click();
  await (await chooser).setFiles(
    buffer
      ? { name: 'catalog.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer }
      : catalogXlsxPath,
  );
}

// Полное успешное обновление каталога из фикстуры.
export async function updateCatalog(page: Page): Promise<void> {
  await chooseCatalogFile(page);
  await expect(page.getByText('✓ Каталог обновлён')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();
}

const add = (page: Page) => page.getByRole('button', { name: 'Добавить' }).click();
const fillName = (page: Page, value: string) => page.locator('.namebar input').fill(value);

// Быстрый путь: каталог загружен → создан аудит → здание → экземпляр «Помещение» → «Щит»,
// возвращаемся на экране замечаний листа.
export async function gotoNewLeaf(page: Page): Promise<void> {
  await page.goto('/');
  await updateCatalog(page);
  await add(page); await fillName(page, 'Аудит');
  await add(page); await fillName(page, 'Здание');
  await add(page); await fillName(page, 'Помещение 1');
  await add(page); await fillName(page, 'Щит 1');
  await expect(page.locator('.row--category').first()).toBeVisible();
}
