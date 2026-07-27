import { test, expect } from '@playwright/test';
import { updateCatalog } from './helpers';

// §8: создать аудит → добавить узлы → отметить замечания → счётчики → перезагрузка (персист).
test('полный поток: аудит → узлы → отметка → счётчики → персист', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
  await updateCatalog(page);

  // Создать аудит.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await page.locator('.namebar input').fill('Тестовый аудит');

  // Добавить здание.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.screen__title')).toHaveText('ЗДАНИЕ');
  await page.locator('.namebar input').fill('Гараж');

  // Фиксированные узлы уровня 1 и группа изменяемого слота «Помещение».
  await expect(page.locator('.row__title', { hasText: 'Документация' })).toBeVisible();
  await expect(page.locator('.row__title', { hasText: 'Общее' })).toBeVisible();
  await expect(page.locator('.section-label', { hasText: 'Помещение' })).toBeVisible();

  // Экземпляр «Помещение».
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Основное строение');
  await expect(page.locator('.row__title', { hasText: 'Помещение' }).first()).toBeVisible(); // фикс-лист
  await expect(page.locator('.section-label', { hasText: 'Щит / панель' })).toBeVisible();

  // Экземпляр «Щит».
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Щит 1');

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

// §7: «назад» со свежесозданного элемента без имени и содержимого отменяет создание.
test('назад из нового элемента без имени отменяет создание', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);

  // Новый аудит без имени → назад → аудит не добавлен.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
  await expect(page.getByText('Аудитов пока нет')).toBeVisible();

  // Новое здание без имени → назад → здание не добавлено.
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Аудит 1');
  await page.getByRole('button', { name: 'Добавить' }).click(); // новое здание
  await expect(page.locator('.screen__title')).toHaveText('ЗДАНИЕ');
  await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await expect(page.getByText('Зданий пока нет')).toBeVisible();
});

// §7: у элемента с содержимым пустое имя блокирует любой уход — и «назад», и вглубь.
test('пустое имя блокирует назад и переход в дочернюю строку', async ({ page }) => {
  await page.goto('/');
  await updateCatalog(page);
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Аудит 1');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.locator('.namebar input').fill('Гараж');
  await page.locator('.screen__back').click(); // → экран аудита со зданием «Гараж»
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');

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
