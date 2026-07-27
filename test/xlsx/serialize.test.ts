import { describe, expect, test } from 'bun:test'
import { read, write } from '../../src/xlsx/serialize'
import { Descriptor } from '../../src/xlsx/descriptor'
import { JSONReader, JSONWriter } from '../../src/xlsx/json'

type Schema = {
  sa: string[]
  b: boolean
  bn: boolean | null
  n: number
  nn: number | null
}

const schema = Descriptor.create<Schema>().stringArray('sa').boolean('b').booleanNull('bn').number('n').numberNull('nn').get()

describe('Serialize tests', () => {
  test('Write to JSON', () => {
    const s: Schema = {
      sa: ['a', 'b'],
      b: false,
      bn: null,
      n: 123,
      nn: null,
    }

    const w = new JSONWriter({ pretty: false })
    write(s, schema, w)
    expect(w.flush()).toEqual('{"sa":["a","b"],"b":false,"bn":null,"n":123,"nn":null}')
  })

  test('Read from JSON', () => {
    const s: Schema = {
      sa: [],
      b: false,
      bn: null,
      n: 0,
      nn: null,
    }

    const r = read(s, schema, new JSONReader('{"sa":["a","b"],"b":false,"bn":null,"n":123,"nn":null}'))
    expect(r).toMatchObject({ sa: ['a', 'b'], b: false, bn: null, n: 123, nn: null })
  })
})
