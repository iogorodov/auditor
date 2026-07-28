import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoNewLeaf, openMenuItem, updateCatalog } from './helpers';
import { readXlsxSheets } from '../../src/xlsx/xlsx-read';

// V2: экспорт аудита в xlsx — скачанный файл читается и содержит строки формата заказчика.
test('экспорт аудита в xlsx', async ({ page }) => {
  await gotoNewLeaf(page); // Аудит → Здание → Помещение 1 → Щит 1, открыт экран замечаний

  // Отметить первое замечание первой категории.
  await page.locator('.row--category').first().click();
  const remark = page.locator('.remark-group.open .row--remark').first();
  const remarkText = (await remark.locator('.row__title').textContent())!;
  await remark.click();

  // Назад на экран аудита (лист → узел → здание → аудит) и экспорт.
  for (let i = 0; i < 3; i++) await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title .ttl')).toHaveText('Аудит');
  const downloadEvent = page.waitForEvent('download');
  await page.getByTitle('Экспорт аудита').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Аудит.xlsx');

  const path = await download.path();
  const sheets = readXlsxSheets(new Uint8Array(readFileSync(path)));
  expect(sheets.map((s) => s.name)).toEqual(['Аудит']);
  expect(sheets[0]!.rows).toEqual([
    ['Здание'],
    ['1', 'Помещение 1', 'Щит 1', remarkText],
  ]);
});

// V2: выгрузка «Моих замечаний» — колонки зеркалят лист каталога.
test('экспорт пользовательских замечаний в xlsx', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await openMenuItem(page, 'Мои замечания');

  // Создать пользовательское замечание.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.modal textarea').fill('Моё замечание для выгрузки');
  await page.locator('.cat-input').fill('Моя категория');
  await page.locator('.modal .save').click();

  const downloadEvent = page.waitForEvent('download');
  await page.getByTitle('Экспорт замечаний').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Мои замечания.xlsx');

  const sheets = readXlsxSheets(new Uint8Array(readFileSync(await download.path())));
  expect(sheets.map((s) => s.name)).toEqual(['Замечания']);
  expect(sheets[0]!.rows).toEqual([
    ['Категория', 'Текст', 'Область'],
    ['Моя категория', 'Моё замечание для выгрузки', ''],
  ]);
});
