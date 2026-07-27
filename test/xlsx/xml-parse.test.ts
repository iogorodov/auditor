import { describe, expect, test } from 'bun:test'
import { parseXml } from '../../src/xlsx/xml-parse'

describe('Mini XML parser', () => {
  test('элементы, атрибуты, текст', () => {
    const el = parseXml('<a x="1" y="two"><b>text</b><c/></a>')
    expect(el.name).toBe('a')
    expect(el.attributes).toEqual({ x: '1', y: 'two' })
    expect(el.children.map(c => c.name)).toEqual(['b', 'c'])
    expect(el.children[0]!.text).toBe('text')
    expect(el.children[1]!.children).toEqual([])
  })

  test('префиксы неймспейсов срезаются у элементов и атрибутов', () => {
    const el = parseXml('<w:doc xmlns:w="urn:w" xmlns:r="urn:r"><w:item r:id="rId1"/></w:doc>')
    expect(el.name).toBe('doc')
    expect(el.children[0]!.name).toBe('item')
    expect(el.children[0]!.attributes['id']).toBe('rId1')
  })

  test('entities в тексте и атрибутах', () => {
    const el = parseXml('<a t="&quot;x&quot; &amp; y"><t>1 &lt; 2 &gt; 0; &#10; &#x410;&apos;</t></a>')
    expect(el.attributes['t']).toBe('"x" & y')
    expect(el.children[0]!.text).toBe("1 < 2 > 0; \n А'")
  })

  test('текст сохраняется как есть (переносы и пробелы)', () => {
    const el = parseXml('<t xml:space="preserve">  a\nb  </t>')
    expect(el.text).toBe('  a\nb  ')
  })

  test('пролог, DOCTYPE, комментарии, PI и CDATA', () => {
    const el = parseXml(
      '﻿<?xml version="1.0"?><!DOCTYPE a><!-- пролог --><a><!-- внутри --><b/><?pi data?><![CDATA[x < y & z]]></a>',
    )
    expect(el.name).toBe('a')
    expect(el.children.map(c => c.name)).toEqual(['b'])
    expect(el.text).toBe('x < y & z')
  })

  test('смешанное содержимое: текст первого уровня конкатенируется', () => {
    const el = parseXml('<a>one<b>skip</b>two</a>')
    expect(el.text).toBe('onetwo')
  })

  test('ошибки: незакрытый тег и несовпадающий закрывающий', () => {
    expect(() => parseXml('<a><b></a>')).toThrow()
    expect(() => parseXml('<a>')).toThrow()
    expect(() => parseXml('нет элемента')).toThrow()
  })
})
