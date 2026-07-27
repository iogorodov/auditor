import { test, expect } from '@playwright/test';
import { gotoNewLeaf } from './helpers';

// §6.6/§6.8: создание замечания из листа — попадает в лист (отмечено) и в «Мои замечания».
test('замечание из листа → отмечено в листе и есть в «Мои замечания»', async ({ page }) => {
  await gotoNewLeaf(page);

  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.modal-back.open')).toBeVisible();
  await page.locator('.modal textarea').fill('Моё уникальное замечание');
  await page.locator('.modal .cat-input').fill('Моя категория');
  await page.locator('.modal .save').click();

  const row = page.locator('.row--remark').filter({ hasText: 'Моё уникальное замечание' });
  await expect(row).toHaveClass(/checked/);

  // Назад к списку аудитов и в «Мои замечания».
  for (let i = 0; i < 4; i++) await page.locator('.screen__back').click();
  await expect(page.locator('.screen__title')).toHaveText('АУДИТОР');
  await page.getByTitle('Мои замечания').click();
  await expect(page.getByText('Моё уникальное замечание')).toBeVisible();
  await expect(page.locator('.row--category').filter({ hasText: 'Моя категория' })).toBeVisible();
});

// §7: поиск на экране замечаний — фильтрация + подсветка, категории с совпадениями раскрыты.
test('поиск на экране замечаний подсвечивает совпадение', async ({ page }) => {
  await gotoNewLeaf(page);
  await page.locator('.search input').fill('провод');
  const hl = page.locator('.row--remark:visible .hl').first();
  await expect(hl).toBeVisible();
  await expect(hl).toContainText('провод');
  // очистка возвращает список
  await page.locator('.search .clear').click();
  await expect(page.locator('.search input')).toHaveValue('');
});

// §6.9: удаление узла через диалог подтверждения.
test('удаление здания через подтверждение', async ({ page }) => {
  await gotoNewLeaf(page);
  // Поднимаемся на экран здания.
  await page.locator('.screen__back').click(); // → уровень 1
  await page.locator('.screen__back').click(); // → здание
  await expect(page.locator('.screen__title')).toHaveText('ЗДАНИЕ');
  await page.locator('.del').click();
  await expect(page.locator('.alert-back.open')).toBeVisible();
  await page.locator('.alert__acts .danger').click();
  // Вернулись на аудит, здания нет.
  await expect(page.locator('.screen__title')).toHaveText('АУДИТ');
  await expect(page.locator('.row__title').filter({ hasText: 'Здание' })).toHaveCount(0);
});
