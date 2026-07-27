import { describe, expect, test } from 'bun:test'
import { write } from '../../src/xlsx/serialize'
import { Descriptor } from '../../src/xlsx/descriptor'
import { type XmlMeta, XmlWriter } from '../../src/xlsx/xml'

describe('Serialize XML tests', () => {
  test('Write object with simple properties', () => {
    const o = {
      s: 'foo',
      n: 10,
      b: true,
    }

    const s = Descriptor.create<typeof o, XmlMeta>({}).meta({ name: 'Root' }).string('s').number('n').boolean('b').get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root><s>foo</s><n>10</n><b>true</b></Root>')
  })

  test('Write object with simple properties as attributes', () => {
    const o = {
      s: 'foo',
      n: 10,
      b: true,
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .string('s', { attribute: true })
      .number('n', { attribute: true })
      .boolean('b', { attribute: true })
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root s="foo" n="10" b="true"/>')
  })

  test('Do not write null value', () => {
    const o = {
      s1: null,
      s2: 'foo',
    }

    const s = Descriptor.create<typeof o, XmlMeta>({}).meta({ name: 'Root' }).stringNull('s1').stringNull('s2').get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root><s2>foo</s2></Root>')
  })

  test('Do not write null value as attributes', () => {
    const o = {
      s1: null,
      s2: 'foo',
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .stringNull('s1', { attribute: true })
      .stringNull('s2', { attribute: true })
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root s2="foo"/>')
  })

  test('Mix value and attributes properties', () => {
    const o = {
      a: 'foo',
      v: 'bar',
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .stringNull('a', { attribute: true })
      .stringNull('v', { value: true })
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root a="foo">bar</Root>')
  })

  test('Prefixes for attributes', () => {
    const o = {
      a: 'foo',
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({
        name: 'Root',
        namespaces: [
          {
            prefix: 'r',
            uri: 'https://example.com/r',
          },
        ],
      })
      .stringNull('a', { attribute: true, namespace: 'https://example.com/r' })
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root xmlns:r="https://example.com/r" r:a="foo"/>')
  })

  test('Nested object', () => {
    const o = {
      obj: {
        a: 'foo',
        v: 'bar',
      },
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .object(
        'obj',
        Descriptor.create<(typeof o)['obj'], XmlMeta>({})
          .stringNull('a', { attribute: true })
          .stringNull('v', { value: true })
          .get(),
      )
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root><obj a="foo">bar</obj></Root>')
  })

  test('Pretty format', () => {
    const o = {
      obj: {
        a: 'foo',
        v: 'bar',
      },
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .object(
        'obj',
        Descriptor.create<(typeof o)['obj'], XmlMeta>({})
          .stringNull('a', { attribute: true })
          .stringNull('v', { value: true })
          .get(),
      )
      .get()

    const w = write(o, s, new XmlWriter({ pretty: true }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<Root>\n  <obj a="foo">bar</obj>\n</Root>\n')
  })

  test('Numbers format', () => {
    const o = {
      i: {
        i1: 10,
        i2: 11.11,
      },
      f: {
        f1: 10,
        f2: 11.11,
      },
    }

    const s = Descriptor.create<typeof o, XmlMeta>({})
      .meta({ name: 'Root' })
      .object(
        'i',
        Descriptor.create<(typeof o)['i'], XmlMeta>({}).number('i1', { attribute: true }).number('i2', { attribute: true }).get(),
      )
      .object(
        'f',
        Descriptor.create<(typeof o)['f'], XmlMeta>({})
          .number('f1', { attribute: true, float: true })
          .number('f2', { attribute: true, float: true })
          .get(),
      )
      .get()

    const w = write(o, s, new XmlWriter({ pretty: false }))
    expect(w.flush()).toBe('<?xml version="1.0" encoding="UTF-8"?><Root><i i1="10" i2="11"/><f f1="10.0" f2="11.11"/></Root>')
  })
})
