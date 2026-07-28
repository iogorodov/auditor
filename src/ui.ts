// UI-слой (§6–7). Ядро (src/core) чистое; здесь — навигация, экраны, модалка, диалоги. Всё
// рендерится в #app. Единый источник истины — снимок аудита в state; экраны читают его через
// разрешение с шаблоном (core/merge). Безопасный рендер — через dom.h / textContent.

import Sortable from 'sortablejs';
import { normalize, nameKey } from './core/normalize.ts';
import { resolveLevel1, resolveLeaves, countBuilding, countAudit, applyReorder, type LevelEntry, type ResolvedL1, type ResolvedLeaf } from './core/merge.ts';
import { resolveLeafRemarks, categoryCompare } from './core/leafview.ts';
import { updateCatalogFromXlsx, type UpdateResult } from './core/catalogUpdate.ts';
import { exportAuditXlsx, exportUserRemarksXlsx } from './core/export.ts';
import { OTHER_CATEGORY, type Audit, type AuditBuilding, type AuditLeafNode, type AuditLevel1Node, type HierarchyTemplate, type Remark } from './core/types.ts';
import { h, clear, highlightInto, matchesQuery, uid, nowSec, formatDate } from './dom.ts';
import { state, persistAudits, persistUserRemarks, persistCatalog, clearCatalog, touchAudit, onPersistError } from './state.ts';

// ================= НАВИГАЦИЯ =================

// Элементы создаются inline-строкой прямо в списке (см. startInlineAdd) — пустой узел в модель
// не попадает, поэтому «нового пустого» экрана больше нет.
type Route =
  | { kind: 'audits' }
  | { kind: 'myremarks' }
  | { kind: 'audit'; audit: Audit }
  | { kind: 'building'; audit: Audit; building: AuditBuilding }
  | { kind: 'l1'; audit: Audit; building: AuditBuilding; node: AuditLevel1Node; slotName: string; fixed: boolean }
  | { kind: 'leaf'; audit: Audit; building: AuditBuilding; l1: AuditLevel1Node; l1SlotName: string; node: AuditLeafNode; slotName: string; fixed: boolean };

let app: HTMLElement;
const stack: Route[] = [{ kind: 'audits' }];
// Закрытие открытого нижнего бара (поиск/добавление) текущего экрана — задаётся в screenFrame.
// Нужно, чтобы системная «Назад» сперва закрывала бар/оверлей, а не проваливала экран.
let activeCloseBars: () => boolean = () => false;

export function startUI(root: HTMLElement): void {
  app = root;
  onPersistError(showPersistError);
  // Навигация синхронизирована с History API: одна запись истории на экран (URL не меняем —
  // остаётся /auditor/). Системная/аппаратная «Назад» приходит через popstate.
  history.replaceState({ depth: stack.length }, '');
  window.addEventListener('popstate', onPopState);
  window.addEventListener('keydown', onKeydown);
  render();
}

// Esc закрывает верхний диалог — как клик по подложке (модалка правки/замечания, подтверждение,
// меню), то есть без сохранения. Информационный диалог без закрытия по клику мимо (обновление
// каталога) не трогаем — только его кнопки. Оверлеев нет — сворачиваем нижний бар (поиск/добавление).
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const overlays = document.querySelectorAll<HTMLElement>('.modal-back, .alert-back, .menu-back');
  const top = overlays[overlays.length - 1];
  if (top) { e.preventDefault(); top.click(); return; }
  if (activeCloseBars()) e.preventDefault();
}

// Системная «Назад»/«Вперёд». Сначала гасим открытый оверлей (модалка/диалог/бар), «съедая» шаг.
// Иначе — попытка подняться на экран выше с тем же guard, что и внутренняя кнопка.
function onPopState(e: PopStateEvent): void {
  if (closeTopOverlay()) { history.pushState({ depth: stack.length }, ''); return; }
  const targetDepth = (e.state && typeof (e.state as { depth?: number }).depth === 'number')
    ? (e.state as { depth: number }).depth : 1;
  if (targetDepth >= stack.length) return; // не «назад» (вперёд/корень) — форвард-навигацию не восстанавливаем
  while (stack.length > targetDepth && stack.length > 1) stack.pop();
  render();
}

// Закрыть верхний оверлей, если открыт. Порядок: модалка/диалог/меню (в body) → нижний бар экрана.
function closeTopOverlay(): boolean {
  const overlays = document.querySelectorAll('.modal-back, .alert-back, .menu-back');
  const top = overlays[overlays.length - 1];
  if (top) { top.remove(); return true; }
  return activeCloseBars();
}

// Баннер о сбое автосохранения (§7): данные под угрозой, сообщение висит, пока не закрыто.
function showPersistError(): void {
  if (document.querySelector('.persist-error')) return;
  const dismiss = h('button', { text: '✕', title: 'Скрыть' });
  const bar = h('div', { class: 'persist-error' }, [
    h('span', { text: 'Не удалось сохранить данные. Последние изменения могут быть потеряны.' }),
    dismiss,
  ]);
  dismiss.addEventListener('click', () => bar.remove());
  document.body.append(bar);
}

function navTo(route: Route): void {
  stack.push(route);
  history.pushState({ depth: stack.length }, '');
  render();
}

// Внутренняя кнопка ‹ и программные возвраты после удаления — через историю: единый путь,
// pop живёт в onPopState.
function back(): void {
  history.back();
}

function render(): void {
  const route = stack[stack.length - 1]!;
  clear(app);
  app.append(renderRoute(route));
}

function rerender(): void {
  render();
}

function renderRoute(route: Route): HTMLElement {
  switch (route.kind) {
    case 'audits': return screenAudits();
    case 'myremarks': return screenMyRemarks();
    case 'audit': return screenAudit(route.audit);
    case 'building': return screenBuilding(route.audit, route.building);
    case 'l1': return screenL1(route);
    case 'leaf': return screenLeaf(route);
  }
}

// ================= КАРКАС ЭКРАНА =================

// Действие кнопки «Добавить»: либо inline-ввод имени в нижнем баре (create), либо открытие
// модалки (open — для замечаний).
type AddSpec =
  | { kind: 'inline'; create: (name: string) => void }
  | { kind: 'modal'; open: () => void };

interface FrameOpts {
  title: string;
  back?: boolean;
  onEdit?: () => void; // ✎ у правого края шапки — правка названия текущего элемента (модалка)
  content: (Node | null)[];
  onAdd?: AddSpec; // синяя кнопка «Добавить» внизу по центру
  fabLeft?: HTMLElement | null; // круглая кнопка слева от «Добавить» (экспорт / меню)
  actionsDisabled?: boolean; // блокирует «Добавить» и поиск (напр. пока нет каталога); fabLeft активен
  searchKind?: 'list' | 'remarks';
}

function screenFrame(opts: FrameOpts): HTMLElement {
  const title = h('div', { class: 'screen__title' }, [h('span', { class: 'ttl', text: opts.title })]);
  const editBtn = opts.onEdit
    ? h('button', { class: 'iconbtn iconbtn--edit', title: 'Изменить название', text: '✎', onclick: opts.onEdit })
    : null;
  const header = h('header', { class: 'screen__header' }, [
    opts.back ? h('button', { class: 'screen__back', title: 'Назад', text: '‹', onclick: back }) : h('span'),
    title,
    h('div', { class: 'screen__hactions' }, editBtn ? [editBtn] : []),
  ]);

  const content = h('div', { class: 'screen__content' }, opts.content);
  const searchKind = opts.searchKind ?? 'list';

  // Плавающий оверлей: синяя «Добавить» по центру + круглая лупа справа. Клавиатуры у них нет,
  // поэтому абсолютное позиционирование им безопасно.
  const lupa = h('button', { class: 'fab-search', title: 'Поиск', text: '⌕' });
  const addPill = opts.onAdd ? h('button', { class: 'fab-add', text: 'Добавить' }) : null;
  if (opts.actionsDisabled) { lupa.disabled = true; if (addPill) addPill.disabled = true; }
  const overlay = h('div', { class: 'screen__overlay' }, [
    opts.fabLeft ?? null,
    addPill ? h('div', { class: 'fab-bar' }, [addPill]) : null,
    lupa,
  ]);

  // Нижние бары ввода (поиск и добавление) — в потоке flex-колонки, а не оверлеем: тогда
  // экранная клавиатура на iOS штатно поджимает их через --app-height (см. src/viewport.ts),
  // без «прокрутки окна» к абсолютному инпуту.
  const searchInput = h('input', { placeholder: 'Поиск' }) as HTMLInputElement;
  const searchCancel = h('button', { class: 'bar-cancel', title: 'Закрыть', text: '✕' });
  const searchBar = h('div', { class: 'inputbar inputbar--search' }, [h('span', { class: 'search' }, [searchInput]), searchCancel]);

  const addInput = h('input', { placeholder: 'Название' }) as HTMLInputElement;
  const addCancel = h('button', { class: 'bar-cancel', title: 'Отмена', text: '✕' });
  const addBar = h('div', { class: 'inputbar inputbar--add' }, [addInput, addCancel]);

  const screen = h('section', { class: 'screen' }, [header, content, overlay, searchBar, addBar]);

  // --- поиск ---
  const runFilter = () => applySearchFilter(screen, searchInput, searchKind);
  searchInput.addEventListener('input', runFilter);
  // preventScroll — чтобы iOS не подкручивал страницу к полю (иначе поле «прыгает» вверх, потом вниз).
  lupa.addEventListener('click', () => { screen.classList.add('searching'); searchInput.focus({ preventScroll: true }); });
  const closeSearch = () => { screen.classList.remove('searching'); searchInput.value = ''; runFilter(); searchInput.blur(); };
  searchCancel.addEventListener('click', closeSearch);

  // --- добавление ---
  let cancelAdd = () => {}; // отмена открытого бара добавления (для «Назад»)
  if (opts.onAdd && addPill) {
    const spec = opts.onAdd;
    if (spec.kind === 'modal') {
      addPill.addEventListener('click', spec.open);
    } else {
      let done = false;
      let cancelled = false;
      const finish = () => {
        if (done) return; // Enter → blur; клик по «Отмена» → тоже один проход
        done = true;
        const name = normalize(addInput.value);
        screen.classList.remove('adding');
        if (name && !cancelled) { spec.create(name); rerender(); }
      };
      cancelAdd = () => { cancelled = true; finish(); };
      addPill.addEventListener('click', () => {
        addInput.value = ''; done = false; cancelled = false;
        screen.classList.add('adding'); addInput.focus({ preventScroll: true });
      });
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addInput.blur(); } });
      addInput.addEventListener('blur', finish);
      // Крестик отменяет: флаг ставим на pointerdown (до blur), плюс явный обработчик — Safari
      // не переводит фокус на кнопку по клику, так что blur может и не сработать.
      addCancel.addEventListener('pointerdown', () => { cancelled = true; });
      addCancel.addEventListener('click', () => { cancelled = true; finish(); });
    }
  }

  // Закрытие открытого нижнего бара по «Назад» (см. onPopState → closeTopOverlay).
  activeCloseBars = () => {
    if (screen.classList.contains('searching')) { closeSearch(); return true; }
    if (screen.classList.contains('adding')) { cancelAdd(); return true; }
    return false;
  };

  return screen;
}

// ================= СЕКЦИИ =================

// Заголовок секции (просто подпись). Добавление живёт в кнопке «Добавить» внизу (screenFrame).
function sectionHeader(label: string): HTMLElement {
  return h('div', { class: 'section-label' }, [h('span', { text: label })]);
}

// ================= СТРОКИ =================

function rowTitle(text: string): HTMLElement {
  const t = h('div', { class: 'row__title' });
  t.textContent = text;
  t.dataset.text = text;
  return t;
}

interface NavRowOpts {
  title: string;
  sub?: string;
  count?: number | string;
  handle?: boolean;
  onClick?: () => void;
}

function navRow(o: NavRowOpts): HTMLLIElement {
  const main = h('div', { class: 'row__main' }, [rowTitle(o.title), o.sub != null ? h('div', { class: 'row__sub', text: o.sub }) : null]);
  const li = h('li', { class: 'row', onclick: o.onClick }, [
    o.handle ? h('span', { class: 'row__handle', text: '⠿' }) : null,
    main,
    o.count != null ? h('span', { class: 'count', text: String(o.count) }) : null,
  ]);
  return li;
}

// ================= ПОИСК =================

// Один проход фильтрации текущего экрана по подстроке (списки строк или категории замечаний).
function applySearchFilter(screen: HTMLElement, input: HTMLInputElement, kind: 'list' | 'remarks'): void {
  const q = input.value.trim().toLowerCase();
  if (kind === 'list') {
    screen.querySelectorAll<HTMLElement>('.screen__content .row').forEach((r) => {
      const t = r.querySelector<HTMLElement>('.row__title');
      if (!t) return;
      const text = t.dataset.text ?? '';
      r.style.display = matchesQuery(text, q) ? '' : 'none';
      highlightInto(t, text, q);
    });
  } else {
    screen.querySelectorAll<HTMLElement>('.cat-block').forEach((block) => {
      const catRow = block.querySelector<HTMLElement>('.row--category')!;
      const group = block.querySelector<HTMLElement>('.remark-group')!;
      let anyVisible = false;
      block.querySelectorAll<HTMLElement>('.row--remark').forEach((r) => {
        const t = r.querySelector<HTMLElement>('.row__title')!;
        const text = t.dataset.text ?? '';
        const ok = matchesQuery(text, q);
        r.style.display = ok ? '' : 'none';
        if (ok) anyVisible = true;
        highlightInto(t, text, q);
      });
      if (q) {
        block.style.display = anyVisible ? '' : 'none';
        catRow.classList.toggle('open', anyVisible); // категории с совпадениями раскрыты (§7)
        group.classList.toggle('open', anyVisible);
      } else {
        block.style.display = '';
      }
    });
  }
}

// ================= DRAG =================

// Перетаскивание изменяемых экземпляров. После reorder переписываем массив узлов через
// core/applyReorder: экземпляры — в новом порядке, остальные — как есть (их позиция в массиве
// не влияет на отображение, порядок задаёт шаблон при разрешении).
function makeSortable<T>(ul: HTMLElement, allNodes: T[], write: (next: T[]) => void): void {
  Sortable.create(ul, {
    handle: '.row__handle',
    animation: 150,
    onEnd: () => {
      const ordered = [...ul.querySelectorAll<HTMLElement>('li')]
        .map((li) => (li as unknown as { __node?: T }).__node)
        .filter((n): n is T => n != null); // пропускаем возможную inline-строку добавления
      write(applyReorder(allNodes, ordered));
    },
  });
}

// ================= ЭКРАН: СПИСОК АУДИТОВ (§6.3) =================

function screenAudits(): HTMLElement {
  const hasCatalog = !!state.catalog;

  const menuBtn = h('button', { class: 'fab-left fab-left--menu', title: 'Меню' }, [h('span', { class: 'burger' })]);
  const menuItems = [
    { label: 'Мои замечания', onClick: () => navTo({ kind: 'myremarks' }) },
    { label: 'Обновить каталог', onClick: () => runCatalogUpdate() },
  ];
  // «Очистить каталог» — только когда есть что чистить.
  if (hasCatalog) menuItems.push({ label: 'Очистить каталог', onClick: () => confirmClearCatalog() });
  menuBtn.addEventListener('click', () => openMenu(menuBtn, menuItems));

  // «Добавить» присутствует всегда (чтобы её было видно заблокированной без каталога).
  const onAdd: AddSpec = { kind: 'inline', create: (name) => {
    state.audits.push({ id: uid(), name, time: nowSec(), buildings: [] }); // самый свежий → в начало списка
    persistAudits();
  } };

  const content: (Node | null)[] = [];

  // Без каталога приложение не работает: показываем только красный баннер, аудиты скрыты,
  // «Добавить»/поиск заблокированы (actionsDisabled). Меню остаётся активным — им и грузят каталог.
  if (!hasCatalog) {
    content.push(h('div', { class: 'catalog-missing', text: 'Каталог пуст. Откройте меню (☰) → «Обновить каталог» и выберите файл (.xlsx) с листами «Иерархия» и «Замечания».' }));
    return screenFrame({ title: 'АУДИТОР', fabLeft: menuBtn, content, onAdd, actionsDisabled: true });
  }

  const audits = [...state.audits].sort((a, b) => b.time - a.time);
  const list = h('ul', { class: 'list' }, audits.map((a) =>
    navRow({ title: a.name || '(без названия)', sub: formatDate(a.time), count: countAudit(a), onClick: () => navTo({ kind: 'audit', audit: a }) }),
  ));
  content.push(sectionHeader('Аудиты'));
  if (audits.length === 0) content.push(h('div', { class: 'empty-note', text: 'Аудитов пока нет. Нажмите «Добавить».' }));
  content.push(list);

  return screenFrame({ title: 'АУДИТОР', fabLeft: menuBtn, content, onAdd });
}

// Очистка каталога с подтверждением. Пользовательские замечания сохраняются.
function confirmClearCatalog(): void {
  confirmDelete(
    'Каталог будет удалён. Пользовательские замечания сохранятся.',
    () => { clearCatalog(); rerender(); },
    { title: 'Очистить каталог?', confirmLabel: 'Очистить', suffix: '' },
  );
}

// ================= ЭКРАН: АУДИТ (список зданий, §6.4) =================

// Скачивание файла на устройство: Blob + временная ссылка.
function downloadFile(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = h('a') as HTMLAnchorElement;
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function fileName(name: string): string {
  const clean = normalize(name.replace(/[\\/:*?"<>|]/g, ' '));
  return `${clean || 'Аудит'}.xlsx`;
}

async function exportAudit(audit: Audit): Promise<void> {
  const bytes = await exportAuditXlsx(audit, state.catalog?.hierarchy ?? { level1: [] }, state.catalog?.remarks ?? []);
  downloadFile(bytes, fileName(audit.name));
}

function screenAudit(audit: Audit): HTMLElement {
  const exportBtn = h('button', { class: 'fab-left', title: 'Экспорт аудита', text: '⤓', onclick: () => void exportAudit(audit) });
  const list = h('ul', { class: 'list' }, audit.buildings.map((b) => {
    const li = navRow({ title: b.name || '(без названия)', count: countBuilding(b), handle: true, onClick: () => navTo({ kind: 'building', audit, building: b }) });
    (li as unknown as { __node: AuditBuilding }).__node = b;
    return li;
  }));
  makeSortable(list, audit.buildings, (next) => { audit.buildings = next; touchAudit(audit); rerender(); });

  return screenFrame({
    title: audit.name || 'Аудит',
    back: true,
    onEdit: () => openNameModal({
      name: audit.name,
      onSave: (v) => { audit.name = v; touchAudit(audit); },
      onDelete: () => { state.audits = state.audits.filter((a) => a !== audit); persistAudits(); back(); },
      deleteMessage: `Аудит «${audit.name}» и все вложенные замечания будут удалены.`,
    }),
    fabLeft: exportBtn,
    onAdd: { kind: 'inline', create: (name) => { audit.buildings.push({ name, nodes: [] }); touchAudit(audit); } },
    content: [
      sectionHeader('Здания'),
      audit.buildings.length ? null : h('div', { class: 'empty-note', text: 'Зданий пока нет.' }),
      list,
    ],
  });
}

// ================= ЭКРАН: ЗДАНИЕ (уровень 1, §6.5) =================

function screenBuilding(audit: Audit, building: AuditBuilding): HTMLElement {
  const tmpl = state.catalog?.hierarchy;
  const onEdit = () => openNameModal({
    name: building.name,
    onSave: (v) => { building.name = v; touchAudit(audit); },
    onDelete: () => { audit.buildings = audit.buildings.filter((b) => b !== building); touchAudit(audit); back(); },
    deleteMessage: `Здание «${building.name}» и все вложенные замечания будут удалены.`,
  });
  const content: (Node | null)[] = [];

  if (!tmpl) {
    content.push(h('div', { class: 'empty-note', text: 'Иерархия не загружена. Обновите каталог (☰ → «Обновить каталог» на главном экране).' }));
    return screenFrame({ title: building.name || 'Здание', back: true, onEdit, content });
  }

  const entries = resolveLevel1(building.nodes, tmpl);
  const create = appendLevel1(content, entries, audit, building);

  return screenFrame({ title: building.name || 'Здание', back: true, onEdit, content, onAdd: create ? { kind: 'inline', create } : undefined });
}

// Рендер записей уровня 1: фикс-узлы строками, изменяемая группа — подпись + drag-список.
// Возвращает функцию создания экземпляра изменяемой группы (для кнопки «Добавить» внизу).
function appendLevel1(content: (Node | null)[], entries: LevelEntry<ResolvedL1>[], audit: Audit, building: AuditBuilding): ((name: string) => void) | undefined {
  const fixedRows: HTMLLIElement[] = [];
  const groups: HTMLElement[] = [];
  let create: ((name: string) => void) | undefined;
  for (const e of entries) {
    if (e.kind === 'fixed') {
      fixedRows.push(navRow({ title: e.node.name, count: e.node.count, onClick: () => openL1(audit, building, e.node) }));
    } else {
      const ul = h('ul', { class: 'list' }, e.instances.map((inst) => {
        const li = navRow({ title: inst.name || '(без названия)', count: inst.count, handle: true, onClick: () => openL1(audit, building, inst) });
        (li as unknown as { __node: AuditLevel1Node }).__node = inst.source!;
        return li;
      }));
      makeSortable(ul, building.nodes, (next) => { building.nodes = next; touchAudit(audit); rerender(); });
      create = (name) => { building.nodes.push({ name, nodes: [] }); touchAudit(audit); };
      groups.push(h('div', {}, [sectionHeader(e.slotName), ul]));
    }
  }
  if (fixedRows.length) content.push(h('ul', { class: 'list' }, fixedRows));
  content.push(...groups);
  return create;
}

// Открыть узел уровня 1 (материализуем фикс-узел при необходимости).
function openL1(audit: Audit, building: AuditBuilding, node: ResolvedL1): void {
  let real = node.source;
  if (!real) {
    real = { name: node.slotName, nodes: [] };
    building.nodes.push(real);
    persistAudits();
  }
  navTo({ kind: 'l1', audit, building, node: real, slotName: node.slotName, fixed: node.type === 'fixed' });
}

// ================= ЭКРАН: УЗЕЛ УРОВНЯ 1 (список листьев, §6.6) =================

function screenL1(route: Route & { kind: 'l1' }): HTMLElement {
  const { audit, building, node, slotName, fixed } = route;
  const tmpl = state.catalog?.hierarchy;
  const content: (Node | null)[] = [];

  const onEdit = fixed ? undefined : () => openNameModal({
    name: node.name,
    onSave: (v) => { node.name = v; touchAudit(audit); },
    onDelete: () => { building.nodes = building.nodes.filter((n) => n !== node); touchAudit(audit); back(); },
    deleteMessage: `«${node.name}» и все вложенные замечания будут удалены.`,
  });

  const slot = tmpl?.level1.find((s) => nameKey(s.name) === nameKey(slotName));
  const leafSlots = slot ? slot.children : [];
  const entries = resolveLeaves(node.nodes, leafSlots);

  const fixedRows: HTMLLIElement[] = [];
  const groups: HTMLElement[] = [];
  let create: ((name: string) => void) | undefined;
  for (const e of entries) {
    if (e.kind === 'fixed') {
      fixedRows.push(navRow({ title: e.node.name, count: e.node.count, onClick: () => openLeaf(audit, building, node, slotName, e.node) }));
    } else {
      const ul = h('ul', { class: 'list' }, e.instances.map((inst) => {
        const li = navRow({ title: inst.name || '(без названия)', count: inst.count, handle: true, onClick: () => openLeaf(audit, building, node, slotName, inst) });
        (li as unknown as { __node: AuditLeafNode }).__node = inst.source!;
        return li;
      }));
      makeSortable(ul, node.nodes, (next) => { node.nodes = next; touchAudit(audit); rerender(); });
      create = (name) => { node.nodes.push({ name, remarks: [] }); touchAudit(audit); };
      groups.push(h('div', {}, [sectionHeader(e.slotName), ul]));
    }
  }
  if (fixedRows.length) content.push(h('ul', { class: 'list' }, fixedRows));
  content.push(...groups);

  return screenFrame({ title: fixed ? slotName : (node.name || 'Узел'), back: true, onEdit, content, onAdd: create ? { kind: 'inline', create } : undefined });
}

function openLeaf(audit: Audit, building: AuditBuilding, l1: AuditLevel1Node, l1SlotName: string, leaf: ResolvedLeaf): void {
  let real = leaf.source;
  if (!real) {
    real = { name: leaf.slotName, remarks: [] };
    l1.nodes.push(real);
    persistAudits();
  }
  navTo({ kind: 'leaf', audit, building, l1, l1SlotName, node: real, slotName: leaf.slotName, fixed: leaf.type === 'fixed' });
}

// ================= ЭКРАН: ЛИСТ (замечания, §6.6) =================

function screenLeaf(route: Route & { kind: 'leaf' }): HTMLElement {
  const { audit, l1, node, slotName, l1SlotName, fixed } = route;
  const content: (Node | null)[] = [];

  const onEdit = fixed ? undefined : () => openNameModal({
    name: node.name,
    onSave: (v) => { node.name = v; touchAudit(audit); },
    onDelete: () => { l1.nodes = l1.nodes.filter((n) => n !== node); touchAudit(audit); back(); },
    deleteMessage: `«${node.name}» и все вложенные замечания будут удалены.`,
  });

  const cats = resolveLeafRemarks({
    selectedTexts: node.remarks,
    predefined: state.catalog?.remarks ?? [],
    userRemarks: state.userRemarks,
    leafSlotName: slotName,
    parentSlotName: l1SlotName,
  });

  content.push(sectionHeader('Замечания'));
  if (cats.length === 0) content.push(h('div', { class: 'empty-note', text: 'Нет применимых замечаний. Нажмите «Добавить».' }));
  for (const cat of cats) content.push(renderCategoryBlock(cat.name, cat.items, cat.selected, cat.total, node, audit));

  return screenFrame({
    title: fixed ? slotName : (node.name || 'Лист'),
    back: true,
    onEdit,
    content,
    searchKind: 'remarks',
    onAdd: { kind: 'modal', open: () => openRemarkModal({ mode: 'new', checkInLeaf: node, audit }) },
  });
}

// Блок категории: сворачиваемая строка + группа замечаний с чекбоксами.
function renderCategoryBlock(
  name: string,
  items: { text: string; checked: boolean }[],
  selected: number,
  total: number,
  leaf: AuditLeafNode,
  audit: Audit,
): HTMLElement {
  const countEl = h('span', { class: 'count', text: `${selected}/${total}` });
  const catRow = h('li', { class: 'row row--category' }, [
    h('span', { class: 'chev', text: '▸' }),
    h('div', { class: 'row__main' }, [rowTitle(name)]),
    countEl,
  ]);
  const group: HTMLElement = h('div', { class: 'remark-group' });
  const countChecked = () => group.querySelectorAll('.row--remark.checked').length;
  group.append(h('ul', { class: 'list' }, items.map((it) => renderRemarkRow(it, leaf, audit, countEl, countChecked))));
  catRow.addEventListener('click', () => {
    const open = catRow.classList.toggle('open');
    group.classList.toggle('open', open);
  });
  return h('div', { class: 'cat-block' }, [h('ul', { class: 'list' }, [catRow]), group]);
}

function renderRemarkRow(
  it: { text: string; checked: boolean },
  leaf: AuditLeafNode,
  audit: Audit,
  countEl: HTMLElement,
  countChecked: () => number,
): HTMLElement {
  const check = h('span', { class: 'check', text: it.checked ? '✓' : '' });
  const row = h('li', { class: `row row--remark${it.checked ? ' checked' : ''}` }, [check, h('div', { class: 'row__main' }, [rowTitle(it.text)])]);
  row.addEventListener('click', () => {
    const on = row.classList.toggle('checked');
    check.textContent = on ? '✓' : '';
    const key = nameKey(it.text);
    if (on) {
      if (!leaf.remarks.some((t) => nameKey(t) === key)) leaf.remarks.push(it.text);
    } else {
      leaf.remarks = leaf.remarks.filter((t) => nameKey(t) !== key);
    }
    // обновляем счётчик категории на месте (без полного ре-рендера — сохраняем раскрытие)
    const sel = countChecked();
    countEl.textContent = `${sel}/${countEl.textContent!.split('/')[1]}`;
    touchAudit(audit);
  });
  return row;
}

// ================= ЭКРАН: МОИ ЗАМЕЧАНИЯ (§6.7) =================

function screenMyRemarks(): HTMLElement {
  const exportBtn = h('button', {
    class: 'fab-left',
    title: 'Экспорт замечаний',
    text: '⤓',
    onclick: () => void exportUserRemarksXlsx(state.userRemarks).then((bytes) => downloadFile(bytes, 'Мои замечания.xlsx')),
  });
  const content: (Node | null)[] = [];
  const byCat = new Map<string, Remark[]>();
  for (const r of state.userRemarks) {
    const cat = r.category || OTHER_CATEGORY;
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(r);
  }
  const cats = [...byCat.keys()].sort(categoryCompare);

  content.push(sectionHeader('Замечания'));
  if (state.userRemarks.length === 0) content.push(h('div', { class: 'empty-note', text: 'Пользовательских замечаний пока нет.' }));

  for (const cat of cats) {
    const remarks = byCat.get(cat)!.sort((a, b) => a.text.localeCompare(b.text, 'ru'));
    const catRow = h('li', { class: 'row row--category open' }, [
      h('span', { class: 'chev', text: '▸' }),
      h('div', { class: 'row__main' }, [rowTitle(cat)]),
      h('span', { class: 'count', text: String(remarks.length) }),
    ]);
    const group = h('div', { class: 'remark-group open' }, [
      h('ul', { class: 'list' }, remarks.map((r) => {
        const row = h('li', { class: 'row row--remark' }, [h('div', { class: 'row__main' }, [rowTitle(r.text)])]);
        row.addEventListener('click', () => openRemarkModal({ mode: 'edit', remark: r }));
        return row;
      })),
    ]);
    catRow.addEventListener('click', () => {
      const open = catRow.classList.toggle('open');
      group.classList.toggle('open', open);
    });
    content.push(h('div', { class: 'cat-block' }, [h('ul', { class: 'list' }, [catRow]), group]));
  }

  return screenFrame({
    title: 'Мои замечания',
    back: true,
    fabLeft: exportBtn,
    content,
    searchKind: 'remarks',
    onAdd: { kind: 'modal', open: () => openRemarkModal({ mode: 'new' }) },
  });
}

// ================= МОДАЛКА ЗАМЕЧАНИЯ (§6.8) =================

function allNodeNames(tmpl: HierarchyTemplate | undefined): string[] {
  const set = new Map<string, string>();
  for (const s of tmpl?.level1 ?? []) {
    set.set(nameKey(s.name), s.name);
    for (const c of s.children) set.set(nameKey(c.name), c.name);
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'ru'));
}

function allCategories(): string[] {
  const set = new Set<string>();
  for (const r of state.catalog?.remarks ?? []) set.add(r.category);
  for (const r of state.userRemarks) set.add(r.category);
  return [...set].sort(categoryCompare);
}

type ModalOpts =
  | { mode: 'new'; checkInLeaf?: AuditLeafNode; audit?: Audit }
  | { mode: 'edit'; remark: Remark };

function openRemarkModal(opts: ModalOpts): void {
  const tmpl = state.catalog?.hierarchy;
  const names = allNodeNames(tmpl);
  const editing = opts.mode === 'edit' ? opts.remark : null;

  // Начальный выбор «Применимо к»: правка → привязка замечания; создание → память сессии или все.
  const initialAreas: Set<string> | null = editing
    ? (editing.binding.length ? new Set(editing.binding.map(nameKey)) : null)
    : (state.modalAreas ? new Set(state.modalAreas.map(nameKey)) : null);
  const isChecked = (name: string) => initialAreas === null || initialAreas.has(nameKey(name));

  const textArea = h('textarea', { placeholder: 'Текст замечания (можно в несколько строк)' }) as HTMLTextAreaElement;
  if (editing) textArea.value = editing.text;

  const catInput = h('input', { class: 'cat-input', placeholder: 'Выберите или введите' }) as HTMLInputElement;
  catInput.setAttribute('list', 'cat-list');
  if (editing) catInput.value = editing.category;
  const datalist = h('datalist', {}, allCategories().map((c) => h('option', { value: c }))) as HTMLDataListElement;
  datalist.id = 'cat-list';

  const boxes: HTMLInputElement[] = [];
  const checkboxes = names.map((name) => {
    const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = isChecked(name);
    cb.dataset.name = name;
    // Состояния «нигде» не существует (пустая привязка = «везде»), поэтому последняя галочка не снимается.
    cb.addEventListener('change', () => {
      if (!boxes.some((b) => b.checked)) cb.checked = true;
    });
    boxes.push(cb);
    return h('label', {}, [cb, ` ${name}`]);
  });

  const saveBtn = h('button', { class: 'save', text: 'Сохранить' }) as HTMLButtonElement;
  const syncSave = () => { saveBtn.disabled = normalize(textArea.value) === ''; };
  textArea.addEventListener('input', syncSave);

  const delBtn = h('button', { class: 'delete', text: 'Удалить' });
  delBtn.style.display = editing ? '' : 'none';

  const backEl = h('div', { class: 'modal-back' });
  const close = () => backEl.remove();

  saveBtn.addEventListener('click', () => {
    const text = normalize(textArea.value);
    if (!text) return;
    const category = normalize(catInput.value) || OTHER_CATEGORY;
    const checkedNames = names.filter((_, i) => boxes[i]!.checked);
    const binding = checkedNames.length === names.length ? [] : checkedNames; // все = применимо везде
    state.modalAreas = checkedNames.length === names.length ? null : checkedNames;

    if (editing) {
      editing.text = text;
      editing.category = category;
      editing.binding = binding;
    } else {
      const remark: Remark = { text, category, binding };
      // не задваиваем: если такой текст уже есть в пользовательском списке — обновляем его
      const existing = state.userRemarks.find((r) => nameKey(r.text) === nameKey(text));
      if (existing) { existing.category = category; existing.binding = binding; }
      else state.userRemarks.push(remark);
      if (opts.mode === 'new' && opts.checkInLeaf && !opts.checkInLeaf.remarks.some((t) => nameKey(t) === nameKey(text))) {
        opts.checkInLeaf.remarks.push(text);
        if (opts.audit) touchAudit(opts.audit);
      }
    }
    persistUserRemarks();
    close();
    rerender();
  });

  delBtn.addEventListener('click', () => {
    if (!editing) return;
    state.userRemarks = state.userRemarks.filter((r) => r !== editing);
    persistUserRemarks();
    close();
    rerender();
  });

  const modal = h('div', { class: 'modal' }, [
    h('div', { class: 'modal__head' }, [
      h('button', { text: 'Отмена', onclick: close }),
      h('b', { text: editing ? 'Замечание' : 'Новое замечание' }),
      h('span'),
    ]),
    h('div', { class: 'modal__body' }, [
      h('div', { class: 'mlabel', text: 'Текст' }),
      textArea,
      h('div', { class: 'mlabel', text: 'Категория' }),
      catInput,
      datalist,
      h('div', { class: 'mlabel', text: 'Применимо к' }),
      h('div', { class: 'checks' }, checkboxes),
    ]),
    h('div', { class: 'modal__foot' }, [delBtn, saveBtn]),
  ]);
  backEl.append(modal);
  backEl.addEventListener('click', (e) => { if (e.target === backEl) close(); });
  document.body.append(backEl);
  syncSave();
  // Фокус на текст замечания + выделение всего (после .open — до него контейнер в display:none).
  requestAnimationFrame(() => { backEl.classList.add('open'); textArea.focus(); textArea.select(); });
}

// ================= МОДАЛКА ПРАВКИ НАЗВАНИЯ =================

// Правка названия элемента (аудит/здание/узел/лист). Одно поле; «Удалить» — с подтверждением.
// Каркас тот же, что у модалки замечания (§6.8). onDelete — «сырое» удаление (мутация + back).
function openNameModal(o: {
  name: string;
  onSave: (name: string) => void;
  onDelete: () => void;
  deleteMessage: string;
}): void {
  const input = h('input', { class: 'field-input', value: o.name }) as HTMLInputElement;

  const saveBtn = h('button', { class: 'save', text: 'Сохранить' }) as HTMLButtonElement;
  const syncSave = () => { saveBtn.disabled = normalize(input.value) === ''; };
  input.addEventListener('input', syncSave);

  const delBtn = h('button', { class: 'delete', text: 'Удалить' });

  const backEl = h('div', { class: 'modal-back' });
  const close = () => backEl.remove();

  saveBtn.addEventListener('click', () => {
    const name = normalize(input.value);
    if (!name) return;
    o.onSave(name);
    close();
    rerender();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!saveBtn.disabled) saveBtn.click(); } });

  delBtn.addEventListener('click', () => confirmDelete(o.deleteMessage, () => { close(); o.onDelete(); }));

  const modal = h('div', { class: 'modal' }, [
    h('div', { class: 'modal__head' }, [
      h('button', { text: 'Отмена', onclick: close }),
      h('b', { text: 'Название' }),
      h('span'),
    ]),
    h('div', { class: 'modal__body' }, [
      h('div', { class: 'mlabel', text: 'Название' }),
      input,
    ]),
    h('div', { class: 'modal__foot' }, [delBtn, saveBtn]),
  ]);
  backEl.append(modal);
  backEl.addEventListener('click', (e) => { if (e.target === backEl) close(); });
  document.body.append(backEl);
  syncSave();
  // Фокус + выделение всего текста — только после .open (до него .modal-back в display:none).
  requestAnimationFrame(() => { backEl.classList.add('open'); input.focus(); input.select(); });
}

// ================= ВЫПАДАЮЩЕЕ МЕНЮ =================

// Поповер у кнопки-якоря. Прозрачный бэкдроп ловит клик мимо и «Назад». Раскрытие — вверх/вниз
// в зависимости от того, где якорь (для нижнего FAB — вверх); по горизонтали выравниваем по левому
// краю якоря с клампом к экрану.
function openMenu(anchor: HTMLElement, items: { label: string; onClick: () => void }[]): void {
  const backEl = h('div', { class: 'menu-back' });
  const close = () => backEl.remove();
  const menu = h('div', { class: 'menu' }, items.map((it) =>
    h('button', { text: it.label, onclick: () => { close(); it.onClick(); } }),
  ));
  const r = anchor.getBoundingClientRect();
  if (r.top > window.innerHeight / 2) menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
  else menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 8 - 220))}px`;
  backEl.append(menu);
  backEl.addEventListener('click', (e) => { if (e.target === backEl) close(); });
  document.body.append(backEl);
  requestAnimationFrame(() => backEl.classList.add('open'));
}

// ================= ДИАЛОГ ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ (§6.9) =================

function confirmDelete(
  message: string,
  onConfirm: () => void,
  opts?: { title?: string; confirmLabel?: string; suffix?: string },
): void {
  const backEl = h('div', { class: 'alert-back' });
  const close = () => backEl.remove();
  const suffix = opts?.suffix ?? 'Действие необратимо.';
  const alert = h('div', { class: 'alert' }, [
    h('div', { class: 'alert__body center' }, [
      h('b', { text: opts?.title ?? 'Удалить?' }),
      h('p', { text: [message, suffix].filter(Boolean).join(' ') }),
    ]),
    h('div', { class: 'alert__acts' }, [
      h('button', { text: 'Отмена', onclick: close }),
      h('button', { class: 'danger', text: opts?.confirmLabel ?? 'Удалить', onclick: () => { close(); onConfirm(); } }),
    ]),
  ]);
  backEl.append(alert);
  backEl.addEventListener('click', (e) => { if (e.target === backEl) close(); });
  document.body.append(backEl);
  requestAnimationFrame(() => backEl.classList.add('open'));
}

// ================= ДИАЛОГ ОБНОВЛЕНИЯ КАТАЛОГА (§5, V2 — из xlsx-файла) =================

// Открыть системный выбор файла. Вызывается синхронно из клика (иначе браузер не покажет диалог);
// input добавляется в DOM (Safari) и убирается по выбору/отмене.
function pickXlsxFile(onPick: (file: File) => void): void {
  const input = h('input', { type: 'file' }) as HTMLInputElement;
  input.accept = '.xlsx';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) onPick(file);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.append(input);
  input.click();
}

function runCatalogUpdate(icon?: HTMLElement): void {
  pickXlsxFile((file) => void applyCatalogFile(icon, file));
}

async function applyCatalogFile(icon: HTMLElement | undefined, file: File): Promise<void> {
  const backEl = h('div', { class: 'alert-back open' });
  const body = h('div', { class: 'alert__body' });
  const acts = h('div', { class: 'alert__acts' });
  acts.hidden = true;
  backEl.append(h('div', { class: 'alert' }, [body, acts]));
  document.body.append(backEl);
  const close = () => backEl.remove();

  icon?.classList.add('spinning');
  body.append(h('div', { class: 'spin' }), h('p', { text: 'Чтение каталога…' }));
  let res: UpdateResult;
  try {
    res = updateCatalogFromXlsx(new Uint8Array(await file.arrayBuffer()), state.userRemarks);
  } catch {
    res = { ok: false, errors: [{ kind: 'file', message: 'Не удалось прочитать файл.' }] };
  }
  icon?.classList.remove('spinning');

  clear(body); clear(acts); acts.hidden = false;
  if (res.ok) {
    state.catalog = res.catalog;
    state.userRemarks = res.userRemarks;
    persistCatalog();
    persistUserRemarks();
    body.append(h('b', {}, [h('span', { class: 'ok-badge', text: '✓ Каталог обновлён' })]));
    acts.append(h('button', { text: 'Закрыть', onclick: () => { close(); rerender(); } }));
  } else {
    body.append(
      h('b', { text: 'Каталог не обновлён' }),
      h('p', { text: 'Оставлен прежний каталог.' }),
      h('div', { class: 'upd-errs' }, [
        h('div', { class: 'mlabel', text: 'Ошибки' }),
        h('ul', {}, res.errors.map((e) => h('li', { text: e.message }))),
      ]),
    );
    acts.append(
      h('button', { text: 'Закрыть', onclick: close }),
      h('button', { text: 'Выбрать файл', onclick: () => { close(); runCatalogUpdate(icon); } }),
    );
  }
}
