import { test, expect, describe } from 'bun:test';
import { mergeUserList } from '../../src/core/userlist.ts';
import type { Remark } from '../../src/core/types.ts';

const r = (text: string): Remark => ({ text, category: 'К', binding: [] });

describe('mergeUserList (§5)', () => {
  test('удаляет пользовательское, совпавшее по тексту с предопределённым (без регистра/пробелов)', () => {
    const user = [r('Нет заземления'), r('Своё замечание'), r('  нет   заземления ')];
    const predefined = [r('Нет заземления')];
    expect(mergeUserList(user, predefined).map((x) => x.text)).toEqual(['Своё замечание']);
  });

  test('без совпадений список не меняется', () => {
    const user = [r('A'), r('B')];
    expect(mergeUserList(user, [r('C')])).toEqual(user);
  });
});
