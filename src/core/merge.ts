// Слияние снимка аудита с текущей иерархией (§3.4). Чистая функция (snapshot, template) → дерево
// для отображения. Разрешение имён: имя, совпавшее с фиксированным слотом уровня → этот фикс-узел;
// иначе → экземпляр единственного изменяемого слота (сохранённое имя = его название). Фиксированные
// слоты, которых нет в снимке, подмешиваются пустыми. Порядок: фикс-узлы и позиция изменяемой группы —
// из шаблона; порядок экземпляров — из массива снимка. Поведение обратимо: правки иерархии
// перекладывают замечания между узлами (замечания живут в снимке), откат возвращает как было.

import { nameKey } from './normalize.ts';
import type {
  Audit,
  AuditBuilding,
  AuditLeafNode,
  AuditLevel1Node,
  HierarchyTemplate,
  LeafSlot,
  SlotType,
} from './types.ts';

// Запись уровня для UI: либо фиксированный узел, либо изменяемая группа (подпись + экземпляры).
export type LevelEntry<T> =
  | { kind: 'fixed'; node: T }
  | { kind: 'group'; slotName: string; instances: T[] };

export interface ResolvedLeaf {
  name: string; // отображаемое имя
  slotName: string; // шаблонное имя слота (для привязки замечаний)
  type: SlotType;
  source: AuditLeafNode | null; // узел снимка; null — подмешанный пустой фикс-лист
  count: number; // число выбранных замечаний в листе
}

export interface ResolvedL1 {
  name: string;
  slotName: string;
  type: SlotType;
  source: AuditLevel1Node | null;
  leaves: LevelEntry<ResolvedLeaf>[];
  count: number; // агрегат по листьям
}

export interface ResolvedBuilding {
  name: string;
  source: AuditBuilding;
  level1: LevelEntry<ResolvedL1>[];
  count: number; // агрегат по узлам уровня 1
}

interface BuildArgs<TSaved> {
  displayName: string;
  slotName: string;
  type: SlotType;
  source: TSaved | null;
}

// Общий разрешатель одного уровня: раскладывает сохранённые узлы по слотам шаблона и строит
// упорядоченный список записей.
function orderLevel<TSaved extends { name: string }, TResolved>(
  slots: { name: string; type: SlotType }[],
  saved: TSaved[],
  build: (args: BuildArgs<TSaved>) => TResolved,
): LevelEntry<TResolved>[] {
  const fixedKeys = new Set(slots.filter((s) => s.type === 'fixed').map((s) => nameKey(s.name)));
  const usedFixed = new Map<string, TSaved>();
  const instances: TSaved[] = [];
  for (const node of saved) {
    const k = nameKey(node.name);
    if (fixedKeys.has(k) && !usedFixed.has(k)) usedFixed.set(k, node);
    else instances.push(node); // не фикс (или дубликат фикс-имени) → изменяемый экземпляр
  }

  const entries: LevelEntry<TResolved>[] = [];
  let placedInstances = false;
  for (const slot of slots) {
    if (slot.type === 'fixed') {
      const source = usedFixed.get(nameKey(slot.name)) ?? null;
      entries.push({ kind: 'fixed', node: build({ displayName: slot.name, slotName: slot.name, type: 'fixed', source }) });
    } else {
      // Единственный изменяемый слот держит все экземпляры (позиция группы — из шаблона).
      const list = placedInstances ? [] : instances;
      placedInstances = true;
      entries.push({
        kind: 'group',
        slotName: slot.name,
        instances: list.map((inst) => build({ displayName: inst.name, slotName: slot.name, type: 'variable', source: inst })),
      });
    }
  }
  // Защитно: в шаблоне нет изменяемого слота, но экземпляры есть — не теряем их.
  if (!placedInstances && instances.length) {
    entries.push({
      kind: 'group',
      slotName: '',
      instances: instances.map((inst) => build({ displayName: inst.name, slotName: '', type: 'variable', source: inst })),
    });
  }
  return entries;
}

function sumEntries<T>(entries: LevelEntry<T>[], get: (t: T) => number): number {
  let n = 0;
  for (const e of entries) {
    if (e.kind === 'fixed') n += get(e.node);
    else for (const it of e.instances) n += get(it);
  }
  return n;
}

export function resolveLeaves(leafNodes: AuditLeafNode[], leafSlots: LeafSlot[]): LevelEntry<ResolvedLeaf>[] {
  return orderLevel(leafSlots, leafNodes, ({ displayName, slotName, type, source }) => ({
    name: displayName,
    slotName,
    type,
    source,
    count: source ? source.remarks.length : 0,
  }));
}

export function resolveLevel1(l1Nodes: AuditLevel1Node[], tmpl: HierarchyTemplate): LevelEntry<ResolvedL1>[] {
  return orderLevel(tmpl.level1, l1Nodes, ({ displayName, slotName, type, source }) => {
    // Шаблон листьев для этого узла — дети слота, к которому он разрешился.
    const slot = tmpl.level1.find((s) => nameKey(s.name) === nameKey(slotName));
    const leaves = resolveLeaves(source ? source.nodes : [], slot ? slot.children : []);
    return { name: displayName, slotName, type, source, leaves, count: sumEntries(leaves, (l) => l.count) };
  });
}

export function resolveBuilding(b: AuditBuilding, tmpl: HierarchyTemplate): ResolvedBuilding {
  const level1 = resolveLevel1(b.nodes, tmpl);
  return { name: b.name, source: b, level1, count: sumEntries(level1, (n) => n.count) };
}

// Применение ручной сортировки (drag): перетащенные экземпляры — в новом порядке в конце массива,
// остальные узлы — как были. Сопоставление по идентичности, а не по имени: экземпляр может носить
// имя фиксированного слота (orderLevel считает такой узел дубликатом-экземпляром), и фильтр по
// имени задвоил бы его.
export function applyReorder<T>(allNodes: T[], orderedInstances: T[]): T[] {
  const moved = new Set(orderedInstances);
  return [...allNodes.filter((n) => !moved.has(n)), ...orderedInstances];
}

// Счётчики берутся прямо из снимка (число сохранённых текстов замечаний); шаблон для подсчёта
// не нужен — подмешанные пустые узлы дают 0, и суммы совпадают с разрешённым деревом.
export function countLeafNode(n: AuditLeafNode): number {
  return n.remarks.length;
}
export function countL1Node(n: AuditLevel1Node): number {
  return n.nodes.reduce((s, l) => s + l.remarks.length, 0);
}
export function countBuilding(b: AuditBuilding): number {
  return b.nodes.reduce((s, n) => s + countL1Node(n), 0);
}
export function countAudit(a: Audit): number {
  return a.buildings.reduce((s, b) => s + countBuilding(b), 0);
}
