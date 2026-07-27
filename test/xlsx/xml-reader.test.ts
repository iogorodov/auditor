import { describe, expect, test } from 'bun:test'
import { read, write } from '../../src/xlsx/serialize'
import { Descriptor } from '../../src/xlsx/descriptor'
import { type XmlMeta, XmlWriter } from '../../src/xlsx/xml'
import { parseXml } from '../../src/xlsx/xml-parse'
import { XmlReader } from '../../src/xlsx/xml-reader'

type Item = {
  id: string
  n: number | null
  flag: boolean
  note: string | null
}

const ITEM_SCHEMA = Descriptor.create<Item, XmlMeta>({})
  .string('id', { attribute: true })
  .numberNull('n', { attribute: true })
  .boolean('flag', { attribute: true })
  .stringNull('note')
  .get()

type Doc = {
  title: string
  items: Item[]
  tags: string[]
  opt: Item | null
}

const DOC_SCHEMA = Descriptor.create<Doc, XmlMeta>({})
  .meta({ name: 'doc' })
  .string('title', { attribute: true })
  .objectArray('items', ITEM_SCHEMA, { localName: 'item' })
  .stringArray('tags', { localName: 'tag' })
  .objectNull('opt', ITEM_SCHEMA)
  .get()

const DOC_DEFAULTS: Doc = { title: '', items: [], tags: [], opt: null }

function roundTrip(doc: Doc): Doc {
  const xml = write(doc, DOC_SCHEMA, new XmlWriter()).flush()
  return read(DOC_DEFAULTS, DOC_SCHEMA, new XmlReader(parseXml(xml)))
}

describe('XmlReader — round-trip с XmlWriter', () => {
  test('атрибуты, вложенные объекты, массивы, значения-узлы', () => {
    const doc: Doc = {
      title: 'Заголовок & «текст»',
      items: [
        { id: 'a', n: 5, flag: true, note: 'многострочная\nзаметка' },
        { id: 'b', n: null, flag: false, note: null },
      ],
      tags: ['x', 'y <z>'],
      opt: { id: 'c', n: 0, flag: true, note: '' },
    }
    expect(roundTrip(doc)).toEqual(doc)
  })

  test('null-поля: writer пропускает, reader возвращает null', () => {
    const doc: Doc = { title: 't', items: [{ id: 'a', n: null, flag: false, note: null }], tags: [], opt: null }
    expect(roundTrip(doc)).toEqual(doc)
  })

  test('несовпадающее имя корня -> defaults', () => {
    const r = read(DOC_DEFAULTS, DOC_SCHEMA, new XmlReader(parseXml('<other/>')))
    expect(r).toEqual(DOC_DEFAULTS)
  })

  test('лишние элементы и атрибуты игнорируются', () => {
    const xml =
      '<doc title="t" junk="1"><extra/><items><item id="a" flag="true" more="x"><f>формула</f></item></items></doc>'
    const r = read(DOC_DEFAULTS, DOC_SCHEMA, new XmlReader(parseXml(xml)))
    expect(r.title).toBe('t')
    expect(r.items).toEqual([{ id: 'a', n: null, flag: true, note: null }])
  })

  test('boolean из "1"/"0" (стиль xlsx)', () => {
    const xml = '<doc title="t"><items><item id="a" flag="1"/><item id="b" flag="0"/></items></doc>'
    const r = read(DOC_DEFAULTS, DOC_SCHEMA, new XmlReader(parseXml(xml)))
    expect(r.items.map(it => it.flag)).toEqual([true, false])
  })
})
