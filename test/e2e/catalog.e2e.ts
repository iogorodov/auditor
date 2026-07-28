import { test, expect } from '@playwright/test';
import { addAndOpen, chooseCatalogFile, commitInline, makeCatalogXlsx, openMenuItem, updateCatalog } from './helpers';

// §5 (V2): успешное обновление каталога из xlsx-файла.
test('обновление каталога: успех', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Каталог пуст', { exact: false })).toBeVisible();
  await updateCatalog(page);

  // После успеха иерархия доступна — на экране здания видны шаблонные узлы.
  await addAndOpen(page, 'Аудит');
  await addAndOpen(page, 'Здание');
  await expect(page.locator('.row__title', { hasText: 'Документация' })).toBeVisible();
});

// Без каталога приложение заблокировано; «Очистить каталог» удаляет каталог (замечания целы).
test('очистка каталога: экран заблокирован, замечания сохранены, аудиты скрыты', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);

  // Пользовательское замечание — должно пережить очистку каталога.
  await openMenuItem(page, 'Мои замечания');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.modal textarea').fill('Замечание сохраняется');
  await page.locator('.modal .save').click();
  await page.locator('.screen__back').click(); // → список аудитов

  // Аудит — чтобы проверить, что без каталога он скрыт.
  await commitInline(page, 'Аудит 1');
  await expect(page.locator('li.row').filter({ hasText: 'Аудит 1' })).toBeVisible();

  // Очистка — с подтверждением.
  await page.getByTitle('Меню').click();
  await page.getByRole('button', { name: 'Очистить каталог' }).click();
  await expect(page.locator('.alert-back.open')).toBeVisible();
  await page.locator('.alert__acts .danger').click();

  // Экран заблокирован: красный баннер, аудиты скрыты, «Добавить»/поиск недоступны.
  await expect(page.locator('.catalog-missing')).toBeVisible();
  await expect(page.locator('li.row').filter({ hasText: 'Аудит 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  await expect(page.getByTitle('Поиск')).toBeDisabled();

  // Замечание уцелело.
  await openMenuItem(page, 'Мои замечания');
  await expect(page.getByText('Замечание сохраняется')).toBeVisible();
  await page.locator('.screen__back').click();

  // Вернули каталог — аудит снова виден, кнопки активны.
  await updateCatalog(page);
  await expect(page.locator('li.row').filter({ hasText: 'Аудит 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить' })).toBeEnabled();
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
