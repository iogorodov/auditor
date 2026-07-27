import { test, expect } from '@playwright/test';
import { chooseCatalogFile, makeCatalogXlsx, updateCatalog } from './helpers';

// §5 (V2): успешное обновление каталога из xlsx-файла.
test('обновление каталога: успех', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Каталог пуст', { exact: false })).toBeVisible();
  await updateCatalog(page);

  // После успеха иерархия доступна — на экране здания видны шаблонные узлы.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Аудит');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Здание');
  await expect(page.locator('.row__title', { hasText: 'Документация' })).toBeVisible();
});

const GOOD_REMARKS = [
  ['Категория', 'Текст', 'Область'],
  ['К', 'Первое замечание', ''],
];

// §5: бинарная ошибка иерархии → каталог не применён; «Выбрать файл» даёт повторить.
test('обновление каталога: ошибка структуры иерархии и повтор', async ({ page }) => {
  const bad = await makeCatalogXlsx([
    {
      name: 'Иерархия',
      rows: [
        ['Уровень 1', 'Уровень 2', 'Фиксированный'],
        ['A', '', ''],
        ['B', '', ''], // два изменяемых слота уровня 1
      ],
    },
    { name: 'Замечания', rows: GOOD_REMARKS },
  ]);
  await page.goto('/');
  await chooseCatalogFile(page, bad);
  await expect(page.getByText('Каталог не обновлён')).toBeVisible();
  // Ошибка структуры иерархии идёт первой в списке.
  await expect(page.locator('.upd-errs li').first()).toContainText('изменяемый');

  // «Выбрать файл» → хороший файл → каталог обновлён.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Выбрать файл' }).click();
  await (await chooser).setFiles(new URL('../fixtures/catalog.xlsx', import.meta.url).pathname);
  await expect(page.getByText('✓ Каталог обновлён')).toBeVisible();
});

// §5: ошибка привязки на несуществующий узел; прежний (пустой) каталог цел.
test('обновление каталога: ошибка привязки', async ({ page }) => {
  const bad = await makeCatalogXlsx([
    {
      name: 'Иерархия',
      rows: [
        ['Уровень 1', 'Уровень 2', 'Фиксированный'],
        ['Общее', '', 'TRUE'],
        ['', 'Прочее', ''],
        ['Помещение', '', ''],
        ['', 'Щит', ''],
      ],
    },
    {
      name: 'Замечания',
      rows: [
        ['Категория', 'Текст', 'Область'],
        ['К', 'Замечание', 'Несуществующий узел'],
      ],
    },
  ]);
  await page.goto('/');
  await chooseCatalogFile(page, bad);
  await expect(page.getByText('Каталог не обновлён')).toBeVisible();
  await expect(page.locator('.upd-errs li')).toContainText('несуществующий элемент');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByText('Каталог пуст', { exact: false })).toBeVisible();
});

// V2: файл без нужных листов → file-ошибка.
test('обновление каталога: нет нужных листов', async ({ page }) => {
  const bad = await makeCatalogXlsx([{ name: 'Другой лист', rows: GOOD_REMARKS }]);
  await page.goto('/');
  await chooseCatalogFile(page, bad);
  await expect(page.getByText('Каталог не обновлён')).toBeVisible();
  await expect(page.locator('.upd-errs li')).toContainText('нет листа');
});
