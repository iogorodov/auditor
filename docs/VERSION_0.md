# Версия 0 — базовый сетап

Цель: запускаемый скелет проекта, на котором дальше растёт Версия 1. Никакой предметной логики —
только каркас, дев-сервер и один проходящий тест.

Стек (общий для всех версий): **Bun + TypeScript + CSS**.

**Почему такой стек.** Приложение — stateful SPA (вложенное дерево аудита, живое слияние снимка с иерархией,
реактивные счётчики, drag, сворачивание категорий). Главный риск — консистентность «состояние → DOM», и его
не решает jQuery (это DOM-помощник, а не управление состоянием) — поэтому не vanilla/jQuery. TypeScript ловит
ошибки на модели слияния/разрешения имён ещё до тестов. Bun даёт бандлер, дев-сервер с HMR и тест-раннер из
коробки — без отдельной инфраструктуры.

## Структура папок

```
auditor/
  index.html            # почти пустой; подключает app.ts и app.css
  package.json          # скрипты start / test, зависимости
  tsconfig.json         # конфиг TypeScript
  src/
    app.ts              # точка входа приложения (пока console.log)
    app.css             # стили (пока минимум)
    core/               # доменная логика без DOM (заготовка, наполняется в V1)
  test/
    hello.test.ts       # hello-world тест (bun test; в V2 заменён реальными тестами)
  fixtures/             # фикстуры для тестов (V2: test/fixtures/*.xlsx)
  docs/                 # эта документация
```

Принцип, заложенный с самого начала: **доменная логика — в `src/core/*.ts` без обращений к DOM/браузеру**,
UI импортирует её. Это делает ядро тестируемым в Bun без браузера (см. Версию 1).

## Содержимое файлов (ориентир)

**`index.html`** — минимальный, подключает стили и точку входа:

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Аудитор</title>
  <link rel="stylesheet" href="/src/app.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/app.ts"></script>
</body>
</html>
```

**`src/app.ts`** — заглушка:

```ts
console.log('Аудитор запущен');
```

**`src/app.css`** — минимум (например, сброс полей и базовый шрифт).

**`test/hello.test.ts`** — тривиальный проход:

```ts
import { test, expect } from 'bun:test';

test('hello world', () => {
  expect(1 + 1).toBe(2);
});
```

**`package.json`** — скрипты:

```json
{
  "name": "auditor",
  "type": "module",
  "scripts": {
    "start": "bun --port 8008 ./index.html",
    "test": "bun test"
  }
}
```

> `bun start` поднимает локальный сервер с горячей перезагрузкой на **порту 8008**
> (`http://localhost:8008`). Флаг `--port` должен идти **перед** entrypoint: в Bun 1.3.x
> форма `bun ./index.html --port 8008` игнорирует флаг и поднимает сервер на `:3000`.

## Критерий готовности

- `bun start` → открывается `http://localhost:8008`, в консоли виден `console.log`, hot reload работает.
- `bun test` → hello-world тест проходит.
- Всё разложено по папкам согласно структуре выше.
