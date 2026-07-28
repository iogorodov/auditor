# Версия 3 — прод-сборка, деплой, PWA

Выводит приложение из `localhost` в прод. Опирается на Версии 1–2. Делается **двумя этапами**,
каждый — своим промптом на чистом контексте:

- **3а — online-версия:** прод-сборка + CI + деплой на GitHub Pages. Приложение полноценно работает
  по HTTPS на телефоне (каталог из файла, IndexedDB, экспорты); для открытия страницы нужна сеть.
- **3б — PWA:** manifest + Service Worker + офлайн-запуск + установка на телефон.

Контекст после V2: приложение — **чистая статика без единого сетевого запроса** (каталог загружается
из локального xlsx-файла, данные в IndexedDB). Бэкенда, секретов и переменных окружения нет.

## Решения по инфраструктуре (приняты)

- **Хостинг — GitHub Pages** репозитория `github.com/iogorodov/auditor` (публичный; чувствительные
  данные вычищены, история переначата). URL: `https://iogorodov.github.io/auditor/`.
- **Ветка — `master`**, деплой на каждый push (CI: тесты → сборка → деплой; красные тесты = нет деплоя).
- Кастомный домен не нужен.
- Заголовками HTTP на Pages управлять нельзя — для нас это приемлемо: дефолтный кэш Pages (~10 минут)
  лишь задерживает выкатку; браузеры со ~2018 игнорируют HTTP-кэш для скрипта Service Worker
  (`updateViaCache: 'imports'`), так что «залипание» SW нам не грозит.
- **Подпуть `/auditor/`** — все ссылки на ассеты в сборке должны быть **относительными**
  (никаких абсолютных `/app.js`); то же касается будущих manifest/иконок/SW-scope.

## Этап 3а — online-версия

### Прод-сборка (Bun) — сделано

- Вход — `index.html` (тянет `src/app.ts` и `src/app.css`). Скрипт `bun run build` =
  `rm -rf dist && bun build ./index.html --outdir dist --minify`; результат в `dist/`
  (в `.gitignore` уже есть).
- Имена выходов — дефолт Bun для HTML-входа: `index-[hash].js` + `index-[hash].css`
  (не `app.[hash]`; флаг `--entry-naming` пробовать нельзя — он переименовывает сам
  `index.html` и ломает стабильное имя входа). `index.html` — стабильное имя, без хэша.
- **Относительные пути подтверждены:** Bun пишет `./index-[hash].js|css` (без ведущего `/`).
  Проверено локальным статик-сервером с подпутём `/auditor/` — страница и оба ассета отдают 200.
  В коде нет ни `fetch`, ни абсолютных путей, ни `url()` в CSS — под подпутём ничего не сломается.

```
dist/
  index.html          (стабильное имя)
  index-[hash].js
  index-[hash].css
```

### CI / деплой (GitHub Actions) — сделано

`.github/workflows/deploy.yml`, один workflow на push в `master` (+ `workflow_dispatch`).
Два джоба: `build` гоняет всё и грузит артефакт, `deploy` зависит от `build`
(красные тесты → нет деплоя). `permissions: pages/id-token: write`, `concurrency: pages`.

Джоб `build` (`oven-sh/setup-bun` + `actions/setup-node`):

1. `bun install --frozen-lockfile`
2. `bunx tsc --noEmit` (typescript закреплён в `package.json`/lockfile — иначе `bunx` тянул бы его мимо frozen-lockfile)
3. `bun test`
4. E2E: `bunx playwright install --with-deps chromium` + `bunx playwright test`
   (Playwright сам поднимает dev-сервер `bun start` через `webServer` в конфиге)
5. `bun run build`
6. `actions/upload-pages-artifact@v3` (path: `dist`)

Джоб `deploy`: `actions/deploy-pages@v4`, environment `github-pages`
(в настройках репозитория: Pages → Source: GitHub Actions).

**Известный необязательный хвост:** E2E гоняются против dev-сервера, не против `dist/`.
Прогон E2E поверх прод-сборки (доступ к `dist/` под подпутём) — по желанию, не сделан.

### Проверка этапа 3а

- CI зелёный, страница открывается по `https://iogorodov.github.io/auditor/`.
- Полный ручной поток на телефоне по HTTPS: загрузка каталога из файла → аудит → замечания →
  экспорт xlsx; перезагрузка страницы — данные на месте (IndexedDB).
- Известное ограничение этапа: без сети страница не откроется (решает 3б).

## Этап 3б — PWA — сделано

### Сборка: `scripts/build.ts` (`bun run build`)

Один проход, всё через `Bun.build` API:

| Вход | Выход | Опции |
|---|---|---|
| `index.html` | `chunk-[hash].js` + `chunk-[hash].css` | минификация, относительные пути (как в 3а) |
| `src/sw.ts` | `sw.js` | **без хэша**, стабильное имя, `target: 'browser'` |

- Порядок: собрать `index.html` → скопировать статику `public/*` (манифест+иконки) **мимо
  бандлера** (иначе Bun хэширует и манифест, и иконки, но НЕ переписывает пути к иконкам ВНУТРИ
  манифеста → рассинхрон) → вставить ссылки `manifest`/`apple-touch-icon` в собранный `index.html`
  → собрать `sw.ts`.
- **Список пред-кэша и версия кэша** внедряются в `sw.ts` через `define` (`__PRECACHE__`,
  `__CACHE_VERSION__`), собранные из **реального содержимого `dist`** (реальные `chunk-[hash].*`).
- Цепочка обновления: правка кода → меняется `chunk-[hash].js` → меняются список пред-кэша и версия
  внутри `sw.js` → меняются байты `sw.js` → браузер видит новый SW → перекэширует оболочку.

### PWA-механика

- **Web App Manifest** (`public/manifest.webmanifest`, стабильное имя) — `name`/`short_name`
  «Аудитор», `display: standalone`, `start_url`/`scope` = `.` (относительно манифеста → `/auditor/`),
  `theme_color`/`background_color` белые, иконки 192/512 `purpose: any maskable`. Ссылка вставляется
  в `index.html` на сборке.
- **Иконки** — заглушка (акцентный фон + белая «молния»), PNG 192/512, генератор
  `scripts/gen-icons.ts` (через `fflate`), лежат в `public/`. Разово перегенерировать:
  `bun run scripts/gen-icons.ts`. **Заменить на реальный логотип при случае.**
- **Service Worker** (`src/sw.ts` → `sw.js`) — install пред-кэширует оболочку (`./`, `index.html`,
  `chunk-[hash].js/css`, манифест, иконки), activate чистит старые кэши, fetch — cache-first,
  для навигаций офлайн-фолбэк на кэшированный `index.html`. Сетевых данных нет (V2), стратегий кроме
  пред-кэша не нужно. Регистрация из `app.ts`: `navigator.serviceWorker.register('./sw.js')` (scope
  внутри `/auditor/`; в dev sw.js нет — регистрация тихо отваливается).
- **theme-color** — два `<meta>` с `media` (light `#ffffff` / dark `#000000`).
- **IndexedDB** — уже с V1, SW его не касается.

### Проверка этапа 3б

- **Офлайн подтверждён локально:** dist поднят на localhost под `/auditor/`, Playwright
  `context.setOffline(true)` → перезагрузка открывает приложение, app-бандл и иконка отдаются из
  кэша. (Автотест в CI не добавляли — проверка ручная/локальная.)
- **Проверить на телефоне:** открыть прод по HTTPS → авиарежим → перезагрузка (открывается, данные
  на месте) → Add to Home Screen → запуск в standalone.
- Обновление доезжает: правка → push → в течение ~10 минут новый SW перекэшировал оболочку.
