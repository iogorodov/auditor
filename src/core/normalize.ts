// Нормализация строк (§4): все space-like → пробел, схлопывание повторов, обрезка краёв.
// Применяется и к данным из CSV, и к пользовательскому вводу — чтобы сравнение по тексту
// было предсказуемым.

export function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Ключ для сравнения имён/текстов: нормализация + нижний регистр (§3.2, §3.4).
export function nameKey(s: string): string {
  return normalize(s).toLowerCase();
}

export function namesEqual(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}
