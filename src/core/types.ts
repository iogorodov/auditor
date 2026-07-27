// Доменные типы (без DOM). §3 модели данных.

export const OTHER_CATEGORY = 'Прочее';

export type SlotType = 'fixed' | 'variable';

// Слот шаблона уровня 2 (лист).
export interface LeafSlot {
  name: string;
  type: SlotType;
}

// Слот шаблона уровня 1 (контейнер) со своим списком слотов уровня 2.
export interface Level1Slot {
  name: string;
  type: SlotType;
  children: LeafSlot[];
}

// Иерархия (шаблон), ровно два уровня (§3.1).
export interface HierarchyTemplate {
  level1: Level1Slot[];
}

// Замечание каталога или пользовательское (§3.2, §3.3): текст + категория + привязка.
// Привязка — список шаблонных имён слотов; пустой список = применимо везде.
export interface Remark {
  text: string;
  category: string;
  binding: string[];
}

// Каталог = иерархия + предопределённые замечания (грузятся и заменяются вместе, §5).
export interface Catalog {
  hierarchy: HierarchyTemplate;
  remarks: Remark[];
}

// Аудит-снимок (§3.4). Узлы хранятся явно, включая фиксированные; порядок = ручной.
export interface AuditLeafNode {
  name: string;
  remarks: string[]; // множество выбранных ТЕКСТОВ замечаний
}

export interface AuditLevel1Node {
  name: string;
  nodes: AuditLeafNode[];
}

export interface AuditBuilding {
  name: string;
  nodes: AuditLevel1Node[];
}

export interface Audit {
  id: string; // ключ хранения (не доменный ID; связь с каталогом — только по тексту)
  name: string;
  time: number; // unix-секунды последнего изменения
  buildings: AuditBuilding[];
}
