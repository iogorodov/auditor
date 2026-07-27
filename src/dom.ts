// Небольшие DOM-помощники. Безопасный рендер (§7): строки пользователя/CSV — только через
// textContent / createTextNode, никакого innerHTML с сырой строкой.

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string; // безопасно через textContent
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onkeydown?: (e: KeyboardEvent) => void;
  dataset?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  if (props.title != null) el.title = props.title;
  if (props.type != null) el.setAttribute('type', props.type);
  if (props.placeholder != null) (el as HTMLInputElement).placeholder = props.placeholder;
  if (props.value != null) (el as HTMLInputElement).value = props.value;
  if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  if (props.oninput) el.addEventListener('input', props.oninput as EventListener);
  if (props.onkeydown) el.addEventListener('keydown', props.onkeydown as EventListener);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

// Подсветка совпадения поиска: строит содержимое из текстовых узлов + <span class="hl"> —
// безопасно к символу «<» и пр.
export function highlightInto(el: HTMLElement, text: string, query: string): void {
  el.replaceChildren();
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) {
    el.textContent = text;
    return;
  }
  el.append(document.createTextNode(text.slice(0, i)));
  const mark = h('span', { class: 'hl', text: text.slice(i, i + q.length) });
  el.append(mark);
  el.append(document.createTextNode(text.slice(i + q.length)));
}

export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === '' || text.toLowerCase().includes(q);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Дата в списке аудитов: относительная для недавнего, абсолютная для старого (как в макете).
export function formatDate(unixSec: number, now: number = nowSec()): string {
  const diff = now - unixSec;
  if (diff < 60) return 'только что';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} ${pluralRu(m, 'минуту', 'минуты', 'минут')} назад`;
  }
  if (diff < 86400) {
    const hrs = Math.floor(diff / 3600);
    return `${hrs} ${pluralRu(hrs, 'час', 'часа', 'часов')} назад`;
  }
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`;
  const d = new Date(unixSec * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
