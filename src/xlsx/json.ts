import type { DeepSimple, DeepSimpleObject, SimpleType } from './type-utils'
import type { ObjectProperty, Property } from './descriptor'
import type { Reader, Writer } from './serialize'

export type JSONWriterFormat = {
  pretty: boolean
  ident: string
}

const JSON_WRITER_DEFAULTS = {
  pretty: true,
  ident: '  ',
}

export class JSONWriter implements Writer {
  private result = ''
  private ident: string

  private readonly format: {
    newLine: string
    ident: string
    valueSpace: string
  }

  constructor(format: Partial<JSONWriterFormat> = {}) {
    const f = { ...JSON_WRITER_DEFAULTS, ...format }
    this.format = {
      newLine: f.pretty ? '\n' : '',
      ident: f.pretty ? f.ident : '',
      valueSpace: f.pretty ? ' ' : '',
    }

    this.ident = this.format.newLine + this.format.ident
  }

  private addItem(key: string | null, value: string, index: number): void {
    if (index > 0) this.result += ','
    this.result += this.ident
    if (key) this.result += `"${key}":${this.format.valueSpace}`
    this.result += value
  }

  private endContainer(closeSymbol: string): void {
    this.ident = this.ident.slice(0, -this.format.ident.length)
    this.result += this.ident
    this.result += closeSymbol
  }

  private getStringValue(property: Property, value: SimpleType): string {
    if (value === null) {
      return 'null'
    }
    if (property.type === 'boolean') {
      return (value as boolean) ? 'true' : 'false'
    }
    if (property.type === 'number') {
      return (value as number).toString()
    }
    if (property.type === 'string') {
      return JSON.stringify(value as string)
    }
    return ''
  }

  add(property: Property, index: number, value: SimpleType): void {
    this.addItem(!property.isArray ? property.key : null, this.getStringValue(property, value), index)
  }

  startArray(property: Property, index: number, _length: number): void {
    this.addItem(property.key, '[', index)
    this.ident += this.format.ident
  }

  endArray(_property: Property): void {
    this.endContainer(']')
  }

  startObject(property: ObjectProperty, index: number): void {
    this.addItem(property.key, '{', index)
    this.ident += this.format.ident
  }

  endObject(_property: ObjectProperty): void {
    this.endContainer('}')
  }

  flush(): string {
    return this.result
  }
}

export class JSONReader implements Reader {
  private readonly value: DeepSimpleObject
  private readonly stack: (DeepSimpleObject | (DeepSimpleObject | SimpleType)[])[] = []

  constructor(str: string) {
    this.value = JSON.parse(str)
  }

  private getContext(): DeepSimpleObject | (DeepSimpleObject | SimpleType)[] {
    return this.stack[this.stack.length - 1]
  }

  private getItemFromContext(property: Property, index: number): DeepSimple | undefined {
    const context = this.getContext()
    if (property.isArray && index >= 0) {
      if (!Array.isArray(context)) return undefined
      if (index >= context.length) return undefined
      return (context as (SimpleType | DeepSimpleObject)[])[index]
    }

    if (Array.isArray(context)) return undefined
    if (!(property.key in context)) return undefined

    const result = (context as DeepSimpleObject)[property.key]
    if (result === null) return property.isNull ? result : undefined
    if (Array.isArray(result)) return property.isArray ? result : undefined

    return property.type === typeof result ? result : undefined
  }

  add(property: Property, index: number): SimpleType | undefined {
    if (property.type === 'object') return undefined

    return this.getItemFromContext(property, index) as SimpleType
  }

  startArray(property: Property, _index: number): number | undefined {
    const item = this.getItemFromContext(property, -1) as (DeepSimpleObject | SimpleType)[] | undefined
    if (!item) return undefined
    this.stack.push(item)
    return item.length
  }

  endArray(_property: Property): void {
    this.stack.pop()
  }

  startObject(property: ObjectProperty, _index: number): true | undefined {
    const item = property.key ? (this.getItemFromContext(property, -1) as DeepSimpleObject | undefined) : this.value
    if (!item) return undefined
    this.stack.push(item)
    return true
  }

  endObject(_property: ObjectProperty): void {
    this.stack.pop()
  }
}
