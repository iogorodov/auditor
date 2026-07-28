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

// Открыть меню (☰) на списке аудитов и выбрать пункт по подписи.
export async function openMenuItem(page: Page, label: string): Promise<void> {
  await page.getByTitle('Меню').click();
  await page.getByRole('button', { name: label }).click();
}

// Меню → «Обновить каталог» → выбрать файл (по умолчанию — реальная фикстура catalog.xlsx).
export async function chooseCatalogFile(page: Page, buffer?: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await openMenuItem(page, 'Обновить каталог');
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

// «Добавить» → нижний бар ввода имени → Enter (коммит).
export async function commitInline(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: 'Добавить' }).click();
  const input = page.locator('.inputbar--add input');
  await input.fill(value);
  await input.press('Enter');
}

// Добавить элемент inline и войти в него (тап по строке).
export async function addAndOpen(page: Page, value: string): Promise<void> {
  await commitInline(page, value);
  await page.locator('li.row').filter({ hasText: value }).first().click();
}

// Быстрый путь: каталог загружен → создан аудит → здание → экземпляр «Помещение» → «Щит»,
// возвращаемся на экране замечаний листа.
export async function gotoNewLeaf(page: Page): Promise<void> {
  await page.goto('/');
  await updateCatalog(page);
  await addAndOpen(page, 'Аудит');
  await addAndOpen(page, 'Здание');
  await addAndOpen(page, 'Помещение 1');
  await addAndOpen(page, 'Щит 1');
  await expect(page.locator('.row--category').first()).toBeVisible();
}
