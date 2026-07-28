import { test, expect } from '@playwright/test';
import { addAndOpen, commitInline, updateCatalog } from './helpers';

// Видимый текст заголовка экрана (без кнопки правки ✎).
const ttl = '.screen__title .ttl';

// §8: создать аудит → добавить узлы → отметить замечания → счётчики → перезагрузка (персист).
test('полный поток: аудит → узлы → отметка → счётчики → персист', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(ttl)).toHaveText('АУДИТОР');
  await updateCatalog(page);

  // Создать аудит (inline) и войти; имя аудита становится заголовком экрана.
  await addAndOpen(page, 'Тестовый аудит');
  await expect(page.locator(ttl)).toHaveText('Тестовый аудит');

  // Добавить здание — его имя становится заголовком.
  await addAndOpen(page, 'Гараж');
  await expect(page.locator(ttl)).toHaveText('Гараж');

  // Фиксированные узлы уровня 1 и группа изменяемого слота «Помещение».
  await expect(page.locator('.row__title', { hasText: 'Документация' })).toBeVisible();
  await expect(page.locator('.row__title', { hasText: 'Общее' })).toBeVisible();
  await expect(page.locator('.section-label', { hasText: 'Помещение' })).toBeVisible();

  // Экземпляр «Помещение».
  await addAndOpen(page, 'Основное строение');
  await expect(page.locator('.row__title', { hasText: 'Помещение' }).first()).toBeVisible(); // фикс-лист
  await expect(page.locator('.section-label', { hasText: 'Щит / панель' })).toBeVisible();

  // Экземпляр «Щит».
  await addAndOpen(page, 'Щит 1');

  // Отметить первое замечание в первой категории.
  const category = page.locator('.row--category').first();
  await category.click();
  const remark = page.locator('.remark-group.open .row--remark').first();
  await remark.click();
  await expect(remark).toHaveClass(/checked/);

  // Счётчик поднимается по иерархии.
  await page.locator('.screen__back').click(); // → уровень 1 «Основное строение»
  await expect(page.locator('li.row').filter({ hasText: 'Щит 1' }).locator('.count')).toHaveText('1');
  await page.locator('.screen__back').click(); // → здание
  await expect(page.locator('li.row').filter({ hasText: 'Основное строение' }).locator('.count')).toHaveText('1');
  await page.locator('.screen__back').click(); // → аудит
  await expect(page.locator('li.row').filter({ hasText: 'Гараж' }).locator('.count')).toHaveText('1');
  await page.locator('.screen__back').click(); // → список аудитов
  await expect(page.locator('li.row').filter({ hasText: 'Тестовый аудит' }).locator('.count')).toHaveText('1');

  // Перезагрузка — данные из IndexedDB.
  await page.reload();
  await expect(page.locator('li.row').filter({ hasText: 'Тестовый аудит' }).locator('.count')).toHaveText('1');
});

// §7: пустой ввод ничего не создаёт; непустой — добавляет и остаётся в списке (без перехода).
test('пустой ввод ничего не создаёт, непустой добавляет в список', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);

  // «Добавить» → нижний бар → пустой ввод → Enter → аудит не создан, бар закрылся.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.inputbar--add input')).toBeVisible();
  await page.locator('.inputbar--add input').press('Enter');
  await expect(page.locator('.inputbar--add input')).toBeHidden();
  await expect(page.getByText('Аудитов пока нет')).toBeVisible();

  // Непустой ввод → аудит создан, остаёмся в списке (внутрь не переходим).
  await commitInline(page, 'Аудит 1');
  await expect(page.locator(ttl)).toHaveText('АУДИТОР');
  await expect(page.locator('li.row').filter({ hasText: 'Аудит 1' })).toBeVisible();
});

// Навигация интегрирована с History API: системная «Назад» ходит по стеку экранов
// и сперва закрывает открытый бар поиска.
test('системная «Назад»: экраны и закрытие поиска', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await addAndOpen(page, 'Аудит 1'); // → аудит
  await addAndOpen(page, 'Гараж');    // → здание
  await expect(page.locator(ttl)).toHaveText('Гараж');

  // Системная «назад» поднимает на экран выше.
  await page.goBack();
  await expect(page.locator(ttl)).toHaveText('Аудит 1');

  // Открытый поиск «назад» закрывает, экран не меняется.
  await page.getByTitle('Поиск').click();
  await expect(page.locator('.inputbar--search input')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.inputbar--search input')).toBeHidden();
  await expect(page.locator(ttl)).toHaveText('Аудит 1');

  // «Назад» уводит на список аудитов.
  await page.goBack();
  await expect(page.locator(ttl)).toHaveText('АУДИТОР');
});

// Правка названия через модалку (✎): сохранение обновляет заголовок; пустое имя блокирует «Сохранить».
test('правка названия через модалку ✎', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await addAndOpen(page, 'Аудит 1'); // → аудит, заголовок «Аудит 1»
  await expect(page.locator(ttl)).toHaveText('Аудит 1');

  // ✎ (у правого края шапки) → модалка с одним полем.
  await page.getByTitle('Изменить название').click();
  await expect(page.locator('.modal-back.open')).toBeVisible();
  await expect(page.locator('.modal .field-input')).toHaveValue('Аудит 1');

  // Esc закрывает диалог без сохранения: заголовок не меняется.
  await page.locator('.modal .field-input').fill('Зря введённое');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-back')).toHaveCount(0);
  await expect(page.locator(ttl)).toHaveText('Аудит 1');

  // Снова ✎ — значение прежнее (правка не сохранилась).
  await page.getByTitle('Изменить название').click();
  await expect(page.locator('.modal .field-input')).toHaveValue('Аудит 1');

  // Пустое имя → «Сохранить» недоступно.
  await page.locator('.modal .field-input').fill('');
  await expect(page.locator('.modal .save')).toBeDisabled();

  // Новое имя → сохранить → заголовок обновился, модалка закрылась.
  await page.locator('.modal .field-input').fill('Переименованный');
  await page.locator('.modal .save').click();
  await expect(page.locator('.modal-back')).toHaveCount(0);
  await expect(page.locator(ttl)).toHaveText('Переименованный');

  // Имя сохранилось в списке аудитов.
  await page.goBack();
  await expect(page.locator('li.row').filter({ hasText: 'Переименованный' })).toBeVisible();
});
