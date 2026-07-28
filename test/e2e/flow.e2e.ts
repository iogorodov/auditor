import { test, expect } from '@playwright/test';
import { addAndOpen, commitInline, updateCatalog } from './helpers';

// §8: создать аудит → добавить узлы → отметить замечания → счётчики → перезагрузка (персист).
test('полный поток: аудит → узлы → отметка → счётчики → персист', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
  await updateCatalog(page);

  // Создать аудит (inline) и войти; имя проставлено при создании.
  await addAndOpen(page, 'Тестовый аудит');
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await expect(page.locator('.namebar input')).toHaveValue('Тестовый аудит');

  // Добавить здание.
  await addAndOpen(page, 'Гараж');
  await expect(page.locator('.screen__title')).toHaveText('ЗДАНИЕ');

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
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
  await expect(page.locator('li.row').filter({ hasText: 'Аудит 1' })).toBeVisible();
});

// Навигация интегрирована с History API: системная «Назад» ходит по стеку экранов,
// закрывает открытый бар и уважает guard пустого имени.
test('системная «Назад»: экраны, закрытие поиска, guard пустого имени', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await addAndOpen(page, 'Аудит 1'); // → АУДИТ
  await addAndOpen(page, 'Гараж');    // → ЗДАНИЕ
  await expect(page.locator('.screen__title')).toHaveText('ЗДАНИЕ');

  // Системная «назад» поднимает на экран выше.
  await page.goBack();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');

  // Открытый поиск «назад» закрывает, экран не меняется.
  await page.getByTitle('Поиск').click();
  await expect(page.locator('.inputbar--search input')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.inputbar--search input')).toBeHidden();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');

  // Пустое имя блокирует системную «назад».
  await page.locator('.namebar input').fill('');
  await page.goBack();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await expect(page.locator('.namebar input')).toHaveClass(/invalid/);

  // Имя задано — «назад» уводит на список аудитов.
  await page.locator('.namebar input').fill('Аудит 1');
  await page.goBack();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
});

// §7: у элемента с содержимым пустое имя блокирует любой уход — и «назад», и вглубь.
test('пустое имя блокирует назад и переход в дочернюю строку', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await addAndOpen(page, 'Аудит 1'); // создаём аудит и входим
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');

  // Добавляем здание inline (остаёмся на экране аудита).
  await commitInline(page, 'Гараж');
  await expect(page.locator('li.row').filter({ hasText: 'Гараж' })).toBeVisible();

  await page.locator('.namebar input').fill(''); // стёрли имя аудита
  await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ'); // назад заблокирован
  await expect(page.locator('.namebar input')).toHaveClass(/invalid/);
  await page.locator('li.row').filter({ hasText: 'Гараж' }).click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ'); // вглубь тоже нельзя

  await page.locator('.namebar input').fill('Названо');
  await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР'); // теперь ушли
});
