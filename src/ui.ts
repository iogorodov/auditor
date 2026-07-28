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
import { state, persistAudits, persistUserRemarks, persistCatalog, touchAudit, onPersistError } from './state.ts';

// ================= НАВИГАЦИЯ =================

// isNew — экран открыт кнопкой «Добавить»: «назад» с пустого (без имени и содержимого) нового
// элемента отменяет создание вместо блокировки (§7).
type Route =
  | { kind: 'audits' }
  | { kind: 'myremarks' }
  | { kind: 'audit'; audit: Audit; isNew?: boolean }
  | { kind: 'building'; audit: Audit; building: AuditBuilding; isNew?: boolean }
  | { kind: 'l1'; audit: Audit; building: AuditBuilding; node: AuditLevel1Node; slotName: string; fixed: boolean; isNew?: boolean }
  | { kind: 'leaf'; audit: Audit; building: AuditBuilding; l1: AuditLevel1Node; l1SlotName: string; node: AuditLeafNode; slotName: string; fixed: boolean; isNew?: boolean };

let app: HTMLElement;
const stack: Route[] = [{ kind: 'audits' }];

export function startUI(root: HTMLElement): void {
  app = root;
  onPersistError(showPersistError);
  render();
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
  if (!canLeave()) return; // уход вглубь тоже требует заданного имени (§7)
  stack.push(route);
  render();
}

function back(): void {
  if (cancelNewIfUntouched(stack[stack.length - 1]!)) return;
  if (!canLeave()) return;
  if (stack.length > 1) stack.pop();
  render();
}

// «Назад» со свежесозданного элемента без имени и без содержимого = отмена создания:
// элемент убирается из модели, экран закрывается (§7).
function cancelNewIfUntouched(route: Route): boolean {
  switch (route.kind) {
    case 'audit':
      if (!route.isNew || normalize(route.audit.name) || route.audit.buildings.length) return false;
      state.audits = state.audits.filter((a) => a !== route.audit);
      persistAudits();
      break;
    case 'building':
      if (!route.isNew || normalize(route.building.name) || route.building.nodes.length) return false;
      route.audit.buildings = route.audit.buildings.filter((b) => b !== route.building);
      touchAudit(route.audit);
      break;
    case 'l1':
      if (!route.isNew || normalize(route.node.name) || route.node.nodes.length) return false;
      route.building.nodes = route.building.nodes.filter((n) => n !== route.node);
      touchAudit(route.audit);
      break;
    case 'leaf':
      if (!route.isNew || normalize(route.node.name) || route.node.remarks.length) return false;
      route.l1.nodes = route.l1.nodes.filter((n) => n !== route.node);
      touchAudit(route.audit);
      break;
    default:
      return false;
  }
  stack.pop();
  render();
  return true;
}

// Уход с экрана запрещён, пока обязательное имя не задано (§7).
function canLeave(): boolean {
  const input = app.querySelector<HTMLInputElement>('input[data-required]');
  if (input && normalize(input.value) === '') {
    input.classList.add('invalid');
    input.focus();
    return false;
  }
  return true;
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

interface FrameOpts {
  title: string;
  back?: boolean;
  actions?: HTMLElement[];
  content: (Node | null)[];
  onAdd?: () => void;
  searchKind?: 'list' | 'remarks';
}

function screenFrame(opts: FrameOpts): HTMLElement {
  const header = h('header', { class: 'screen__header' }, [
    opts.back ? h('button', { class: 'screen__back', title: 'Назад', text: '‹', onclick: back }) : h('span'),
    h('div', { class: 'screen__title', text: opts.title }),
    h('div', { class: 'screen__hactions' }, opts.actions ?? []),
  ]);

  const content = h('div', { class: 'screen__content' }, opts.content);

  // Плавающие кнопки поверх контента (выделенного футера нет): «Добавить» по центру,
  // небольшой «Поиск» справа. По «Поиск» кнопки прячутся и снизу появляется поле ввода.
  const searchInput = h('input', { placeholder: 'Поиск' }) as HTMLInputElement;
  const clearBtn = h('button', { class: 'clear', text: '✕' });
  const searchWrap = h('span', { class: 'search' }, [searchInput, clearBtn]);
  const cancelBtn = h('button', { class: 'search-cancel', text: 'Отмена' });
  const searchBar = h('div', { class: 'searchbar' }, [searchWrap, cancelBtn]);

  const toggleBtn = h('button', { class: 'fab-search', title: 'Поиск', text: 'Поиск' });
  const addBtn = opts.onAdd ? h('button', { class: 'fab-add', text: 'Добавить', onclick: opts.onAdd }) : null;
  const controls = h('div', { class: 'screen__controls' }, [
    h('div', { class: 'fab-bar' }, [addBtn, toggleBtn]),
    searchBar,
  ]);

  const screen = h('section', { class: 'screen' }, [header, content, controls]);
  wireSearch({ screen, controls, input: searchInput, clearBtn, wrap: searchWrap, toggleBtn, cancelBtn, kind: opts.searchKind ?? 'list' });
  return screen;
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

// ================= ПОЛЕ «НАЗВАНИЕ» =================

interface NameFieldOpts {
  name: string;
  required: boolean;
  onInput: (value: string) => void;
  onDelete: () => void;
}

function nameField(o: NameFieldOpts): HTMLElement {
  const input = h('input', { value: o.name }) as HTMLInputElement;
  if (o.required) input.dataset.required = '1';
  const del = h('button', { class: 'del', title: 'Удалить', text: '🗑', onclick: o.onDelete });
  const syncDel = () => { del.style.display = normalize(input.value) ? '' : 'none'; };
  input.addEventListener('input', () => {
    input.classList.remove('invalid');
    o.onInput(input.value);
    syncDel();
  });
  input.addEventListener('blur', () => {
    const norm = normalize(input.value);
    input.value = norm;
    o.onInput(norm);
    syncDel();
  });
  syncDel();
  return h('div', { class: 'field' }, [
    h('label', { text: 'Название' }),
    h('div', { class: 'namebar' }, [input, del]),
  ]);
}

// ================= ПОИСК =================

interface SearchWiring {
  screen: HTMLElement;
  controls: HTMLElement;
  input: HTMLInputElement;
  clearBtn: HTMLElement;
  wrap: HTMLElement;
  toggleBtn: HTMLElement;
  cancelBtn: HTMLElement;
  kind: 'list' | 'remarks';
}

function wireSearch({ screen, controls, input, clearBtn, wrap, toggleBtn, cancelBtn, kind }: SearchWiring): void {
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    wrap.classList.toggle('has-text', input.value.length > 0);
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
  };
  input.addEventListener('input', apply);
  clearBtn.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  // «Поиск» открывает поле снизу и фокусирует его; «Отмена» — закрывает и сбрасывает фильтр.
  toggleBtn.addEventListener('click', () => { controls.classList.add('searching'); input.focus(); });
  cancelBtn.addEventListener('click', () => { controls.classList.remove('searching'); input.value = ''; apply(); input.blur(); });
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
      const ordered = [...ul.querySelectorAll<HTMLElement>('li')].map((li) => (li as unknown as { __node: T }).__node);
      write(applyReorder(allNodes, ordered));
    },
  });
}

// ================= ЭКРАН: СПИСОК АУДИТОВ (§6.3) =================

function screenAudits(): HTMLElement {
  const star = h('button', { class: 'iconbtn star', title: 'Мои замечания', text: '★', onclick: () => navTo({ kind: 'myremarks' }) });
  const refresh = h('button', { class: 'iconbtn', title: 'Обновить каталог', text: '↻', onclick: () => runCatalogUpdate(refresh) });

  const audits = [...state.audits].sort((a, b) => b.time - a.time);
  const list = h('ul', { class: 'list' }, audits.map((a) =>
    navRow({ title: a.name || '(без названия)', sub: formatDate(a.time), count: countAudit(a), onClick: () => navTo({ kind: 'audit', audit: a }) }),
  ));

  const content: (Node | null)[] = [];
  if (!state.catalog) content.push(h('div', { class: 'empty-note', text: 'Каталог пуст. Нажмите ↻ и выберите файл каталога (.xlsx) с листами «Иерархия» и «Замечания».' }));
  if (audits.length === 0) content.push(h('div', { class: 'empty-note', text: 'Аудитов пока нет. Нажмите «Добавить».' }));
  content.push(list);

  return screenFrame({
    title: 'АУДИТОР',
    actions: [star, refresh],
    content,
    onAdd: () => {
      const audit: Audit = { id: uid(), name: '', time: nowSec(), buildings: [] };
      state.audits.push(audit);
      persistAudits();
      navTo({ kind: 'audit', audit, isNew: true });
    },
  });
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
  const exportBtn = h('button', { class: 'iconbtn', title: 'Экспорт аудита', text: '⤓', onclick: () => void exportAudit(audit) });
  const list = h('ul', { class: 'list' }, audit.buildings.map((b) => {
    const li = navRow({ title: b.name || '(без названия)', count: countBuilding(b), handle: true, onClick: () => navTo({ kind: 'building', audit, building: b }) });
    (li as unknown as { __node: AuditBuilding }).__node = b;
    return li;
  }));
  makeSortable(list, audit.buildings, (next) => { audit.buildings = next; touchAudit(audit); rerender(); });

  return screenFrame({
    title: 'АУДИТ',
    back: true,
    actions: [exportBtn],
    content: [
      nameField({
        name: audit.name,
        required: true,
        onInput: (v) => { audit.name = v; touchAudit(audit); },
        onDelete: () => confirmDelete(`Аудит «${audit.name}» и все вложенные замечания будут удалены.`, () => {
          state.audits = state.audits.filter((a) => a !== audit);
          persistAudits();
          back();
        }),
      }),
      h('div', { class: 'section-label', text: 'Здания' }),
      audit.buildings.length ? list : h('div', { class: 'empty-note', text: 'Зданий пока нет.' }),
    ],
    onAdd: () => {
      if (!canLeave()) return;
      const building: AuditBuilding = { name: '', nodes: [] };
      audit.buildings.push(building);
      touchAudit(audit);
      navTo({ kind: 'building', audit, building, isNew: true });
    },
  });
}

// ================= ЭКРАН: ЗДАНИЕ (уровень 1, §6.5) =================

function screenBuilding(audit: Audit, building: AuditBuilding): HTMLElement {
  const tmpl = state.catalog?.hierarchy;
  const content: (Node | null)[] = [
    nameField({
      name: building.name,
      required: true,
      onInput: (v) => { building.name = v; touchAudit(audit); },
      onDelete: () => confirmDelete(`Здание «${building.name}» и все вложенные замечания будут удалены.`, () => {
        audit.buildings = audit.buildings.filter((b) => b !== building);
        touchAudit(audit);
        back();
      }),
    }),
  ];

  if (!tmpl) {
    content.push(h('div', { class: 'empty-note', text: 'Иерархия не загружена. Обновите каталог (↻ на главном экране).' }));
    return screenFrame({ title: 'ЗДАНИЕ', back: true, content });
  }

  const entries = resolveLevel1(building.nodes, tmpl);
  appendLevel1(content, entries, audit, building);

  return screenFrame({
    title: 'ЗДАНИЕ',
    back: true,
    content,
    onAdd: () => addInstanceL1(audit, building, tmpl),
  });
}

// Рендер записей уровня 1: фикс-узлы строками, изменяемая группа — подпись + drag-список.
function appendLevel1(content: (Node | null)[], entries: LevelEntry<ResolvedL1>[], audit: Audit, building: AuditBuilding): void {
  const fixedRows: HTMLLIElement[] = [];
  const groups: HTMLElement[] = [];
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
      groups.push(h('div', {}, [h('div', { class: 'section-label', text: e.slotName }), ul]));
    }
  }
  if (fixedRows.length) content.push(h('ul', { class: 'list' }, fixedRows));
  content.push(...groups);
}

// Открыть узел уровня 1 (материализуем фикс-узел при необходимости).
function openL1(audit: Audit, building: AuditBuilding, node: ResolvedL1): void {
  if (!canLeave()) return; // не материализуем узел, если уход с экрана запрещён
  let real = node.source;
  if (!real) {
    real = { name: node.slotName, nodes: [] };
    building.nodes.push(real);
    persistAudits();
  }
  navTo({ kind: 'l1', audit, building, node: real, slotName: node.slotName, fixed: node.type === 'fixed' });
}

function addInstanceL1(audit: Audit, building: AuditBuilding, tmpl: HierarchyTemplate): void {
  if (!canLeave()) return;
  const varSlot = tmpl.level1.find((s) => s.type === 'variable');
  if (!varSlot) return;
  const node: AuditLevel1Node = { name: '', nodes: [] };
  building.nodes.push(node);
  touchAudit(audit);
  navTo({ kind: 'l1', audit, building, node, slotName: varSlot.name, fixed: false, isNew: true });
}

// ================= ЭКРАН: УЗЕЛ УРОВНЯ 1 (список листьев, §6.6) =================

function screenL1(route: Route & { kind: 'l1' }): HTMLElement {
  const { audit, building, node, slotName, fixed } = route;
  const tmpl = state.catalog?.hierarchy;
  const content: (Node | null)[] = [];

  if (!fixed) {
    content.push(nameField({
      name: node.name,
      required: true,
      onInput: (v) => { node.name = v; touchAudit(audit); },
      onDelete: () => confirmDelete(`«${node.name}» и все вложенные замечания будут удалены.`, () => {
        building.nodes = building.nodes.filter((n) => n !== node);
        touchAudit(audit);
        back();
      }),
    }));
  }

  const slot = tmpl?.level1.find((s) => nameKey(s.name) === nameKey(slotName));
  const leafSlots = slot ? slot.children : [];
  const entries = resolveLeaves(node.nodes, leafSlots);

  const fixedRows: HTMLLIElement[] = [];
  const groups: HTMLElement[] = [];
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
      groups.push(h('div', {}, [h('div', { class: 'section-label', text: e.slotName }), ul]));
    }
  }
  if (fixedRows.length) content.push(h('ul', { class: 'list' }, fixedRows));
  content.push(...groups);

  return screenFrame({
    title: fixed ? slotName : (node.name || 'Узел'),
    back: true,
    content,
    onAdd: () => {
      if (!canLeave()) return;
      const varSlot = leafSlots.find((s) => s.type === 'variable');
      if (!varSlot) return;
      const leaf: AuditLeafNode = { name: '', remarks: [] };
      node.nodes.push(leaf);
      touchAudit(audit);
      navTo({ kind: 'leaf', audit, building, l1: node, l1SlotName: slotName, node: leaf, slotName: varSlot.name, fixed: false, isNew: true });
    },
  });
}

function openLeaf(audit: Audit, building: AuditBuilding, l1: AuditLevel1Node, l1SlotName: string, leaf: ResolvedLeaf): void {
  if (!canLeave()) return; // не материализуем лист, если уход с экрана запрещён
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

  if (!fixed) {
    content.push(nameField({
      name: node.name,
      required: true,
      onInput: (v) => { node.name = v; touchAudit(audit); },
      onDelete: () => confirmDelete(`«${node.name}» и все вложенные замечания будут удалены.`, () => {
        l1.nodes = l1.nodes.filter((n) => n !== node);
        touchAudit(audit);
        back();
      }),
    }));
  }

  const cats = resolveLeafRemarks({
    selectedTexts: node.remarks,
    predefined: state.catalog?.remarks ?? [],
    userRemarks: state.userRemarks,
    leafSlotName: slotName,
    parentSlotName: l1SlotName,
  });

  if (cats.length === 0) content.push(h('div', { class: 'empty-note', text: 'Нет применимых замечаний. Нажмите «Добавить».' }));
  for (const cat of cats) content.push(renderCategoryBlock(cat.name, cat.items, cat.selected, cat.total, node, audit));

  return screenFrame({
    title: fixed ? slotName : (node.name || 'Лист'),
    back: true,
    content,
    searchKind: 'remarks',
    onAdd: () => openRemarkModal({ mode: 'new', checkInLeaf: node, audit }),
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
    class: 'iconbtn',
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
    actions: [exportBtn],
    content,
    searchKind: 'remarks',
    onAdd: () => openRemarkModal({ mode: 'new' }),
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
  requestAnimationFrame(() => backEl.classList.add('open'));
}

// ================= ДИАЛОГ ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ (§6.9) =================

function confirmDelete(message: string, onConfirm: () => void): void {
  const backEl = h('div', { class: 'alert-back' });
  const close = () => backEl.remove();
  const alert = h('div', { class: 'alert' }, [
    h('div', { class: 'alert__body center' }, [
      h('b', { text: 'Удалить?' }),
      h('p', { text: `${message} Действие необратимо.` }),
    ]),
    h('div', { class: 'alert__acts' }, [
      h('button', { text: 'Отмена', onclick: close }),
      h('button', { class: 'danger', text: 'Удалить', onclick: () => { close(); onConfirm(); } }),
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

function runCatalogUpdate(icon: HTMLElement): void {
  pickXlsxFile((file) => void applyCatalogFile(icon, file));
}

async function applyCatalogFile(icon: HTMLElement, file: File): Promise<void> {
  const backEl = h('div', { class: 'alert-back open' });
  const body = h('div', { class: 'alert__body' });
  const acts = h('div', { class: 'alert__acts' });
  acts.hidden = true;
  backEl.append(h('div', { class: 'alert' }, [body, acts]));
  document.body.append(backEl);
  const close = () => backEl.remove();

  icon.classList.add('spinning');
  body.append(h('div', { class: 'spin' }), h('p', { text: 'Чтение каталога…' }));
  let res: UpdateResult;
  try {
    res = updateCatalogFromXlsx(new Uint8Array(await file.arrayBuffer()), state.userRemarks);
  } catch {
    res = { ok: false, errors: [{ kind: 'file', message: 'Не удалось прочитать файл.' }] };
  }
  icon.classList.remove('spinning');

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
