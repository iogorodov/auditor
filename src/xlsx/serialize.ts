import type { DeepSimpleObject, SimpleType } from './type-utils'
import type { Descriptor, ObjectProperty, Property } from './descriptor'

export interface Writer<Meta = undefined> {
  add(property: Property<Meta>, index: number, value: SimpleType): void
  startArray(property: Property<Meta>, index: number, length: number): void
  endArray(property: Property<Meta>): void
  startObject(property: ObjectProperty<Meta>, index: number): void
  endObject(property: ObjectProperty<Meta>): void
}

export interface Reader<Meta = undefined> {
  add(property: Property<Meta>, index: number): SimpleType | undefined
  startArray(property: Property<Meta>, index: number): number | undefined
  endArray(property: Property<Meta>): void
  startObject(property: ObjectProperty<Meta>, index: number): true | undefined
  endObject(property: ObjectProperty<Meta>): void
}

function getRootProperty<T extends DeepSimpleObject, Meta>(desc: Descriptor<T, Meta>): ObjectProperty<Meta> {
  return {
    type: 'object',
    key: '',
    isNull: false,
    isArray: false,
    meta: desc.getMeta(),
    properties: desc.getProperties() as Property<Meta>[],
  }
}

function writeItem<Meta>(
  property: Property<Meta>,
  index: number,
  value: SimpleType | DeepSimpleObject,
  writer: Writer<Meta>,
): void {
  if (property.type === 'object') {
    writer.startObject(property, index)
    writeObject(value as DeepSimpleObject, property.properties, writer)
    writer.endObject(property)
  } else if (property.type === 'string' && property.cb) {
    writer.add(property, index, property.cb(value))
  } else {
    writer.add(property, index, value as SimpleType)
  }
}

function writeObject<Meta>(value: DeepSimpleObject, properties: Property<Meta>[], writer: Writer<Meta>): void {
  properties.forEach((property, index) => {
    const k = property.key
    const v = value[k]
    if (v === null) {
      writer.add(property, index, null)
    } else if (property.isArray) {
      const va = v as (SimpleType | DeepSimpleObject)[]
      writer.startArray(property, index, va.length)
      va.forEach((it, i) => {
        writeItem(property, i, it, writer)
      })
      writer.endArray(property)
    } else {
      writeItem(property, index, v as SimpleType | DeepSimpleObject, writer)
    }
  })
}

function readItem<Meta>(
  property: Property<Meta>,
  index: number,
  reader: Reader<Meta>,
): SimpleType | DeepSimpleObject | undefined {
  if (property.type === 'object') {
    const hasObject = reader.startObject(property, index)
    if (!hasObject) return undefined
    const result = readObject(undefined, property.properties, reader)
    reader.endObject(property)
    return result
  }
  return reader.add(property, index)
}

function readProperty<Meta>(
  property: Property<Meta>,
  index: number,
  reader: Reader<Meta>,
): SimpleType | DeepSimpleObject | SimpleType[] | DeepSimpleObject[] | undefined {
  if (property.isArray) {
    const length = reader.startArray(property, index)
    if (length === undefined) return undefined

    const a: (SimpleType | DeepSimpleObject)[] = []
    for (let i = 0; i < length; i++) {
      const v = readItem(property, i, reader)
      if (v !== undefined) a.push(v)
    }
    reader.endArray(property)

    return a as SimpleType[] | DeepSimpleObject[]
  }
  return readItem(property, index, reader)
}

function readObject<Meta>(
  defaults: DeepSimpleObject | undefined,
  properties: Property<Meta>[],
  reader: Reader<Meta>,
): DeepSimpleObject | undefined {
  return properties.reduce(
    (result, property, index) => {
      if (!result) return undefined
      const v = readProperty(property, index, reader)
      if (v === undefined) {
        // Writer пропускает null-значения при записи, поэтому отсутствующее nullable-поле
        // читается как null (иначе весь объект без defaults был бы отброшен).
        if (property.isNull) {
          result[property.key] = null
        } else if (!defaults) {
          return undefined
        } else {
          result[property.key] = defaults[property.key]
        }
      } else {
        result[property.key] = v
      }

      return result
    },
    {} as DeepSimpleObject | undefined,
  )
}

export function write<T extends DeepSimpleObject, Meta, TWriter extends Writer<Meta>>(
  value: T,
  desc: Descriptor<T, Meta>,
  writer: TWriter,
): TWriter {
  writeItem(getRootProperty(desc), 0, value, writer)
  return writer
}

export function read<T extends DeepSimpleObject, Meta>(defaults: T, desc: Descriptor<T, Meta>, reader: Reader<Meta>): T {
  const rootProperty = getRootProperty(desc)
  const hasObject = reader.startObject(rootProperty, 0)
  if (!hasObject) return defaults
  const result = readObject(defaults, rootProperty.properties, reader) as T | undefined
  reader.endObject(rootProperty)
  return result || defaults
}
