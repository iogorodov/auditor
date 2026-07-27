import type { SimpleType } from './type-utils'
import type { ObjectProperty, Property } from './descriptor'
import type { Writer } from './serialize'

export type XmlNamespace = {
  prefix: string
  uri: string
}

export type XmlAttribute = {
  namespace?: string
  name: string
  value: string
}

export type XmlMetaCommon = {
  // Use this name instead of property key
  name?: string

  // Store number as float
  float?: true
}

// Meta for the root element
export type XmlMetaRoot = {
  // Add standalone attribute to XML header
  standalone?: 'yes' | 'no'

  // Name of the root element
  name: string

  // Default namespace (xmlns attribute)
  namespace?: string

  // Namespaces with prefixes
  namespaces?: XmlNamespace[]

  // Attributes
  attributes?: XmlAttribute[]
}

export type XmlMetaAttribute = XmlMetaCommon & {
  // (Simple types only) Store this value as attribute
  attribute: true

  // Specify namespace uri for the attribute. Get prefix from document namespaces
  namespace?: string
}

export type XmlMetaNonAttribute = XmlMetaCommon & {
  // Store value of this property as node value
  value?: true

  // (Arrays only) use this localName as node name for items in array
  localName?: string
}

export type XmlMeta = XmlMetaRoot | XmlMetaAttribute | XmlMetaNonAttribute

export type XmlWriterFormat = {
  pretty: boolean
  indent: string
}

const XML_WRITER_DEFAULTS: XmlWriterFormat = {
  pretty: true,
  indent: '  ',
}

type Attribute = {
  name: string
  value: string
}

type Node = {
  name: string
  attributes: Attribute[]
  value: string
  children: Node[]
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function hasChildren(node: Node): boolean {
  return node.children.length > 0 || !!node.value
}

function getXml(indent: string, node: Node, format: { newLine: string; indent: string }): string {
  return [
    indent,
    `<${node.name}`,
    node.attributes.map(attr => ` ${attr.name}="${escapeXml(attr.value)}"`),
    hasChildren(node) ? '>' : [],
    node.children.length > 0 ? format.newLine : [],
    node.value ? escapeXml(node.value) : [],
    node.children.map(child => getXml(indent + format.indent, child, format)),
    node.children.length > 0 ? indent : [],
    hasChildren(node) ? `</${node.name}>` : '/>',
    format.newLine,
  ]
    .flat()
    .join('')
}

function buildAttribute(attr: XmlAttribute, namespaces: XmlNamespace[] | undefined): Attribute {
  if (!attr.namespace) return attr
  if (!namespaces) return { name: attr.name, value: attr.value }
  const ns = namespaces.find(ns => ns.uri === attr.namespace)
  if (!ns) return { name: attr.name, value: attr.value }
  return { name: `${ns.prefix}:${attr.name}`, value: attr.value }
}

function buildRootAttributes(namespace: string, namespaces: XmlNamespace[], attributes: XmlAttribute[]): Attribute[] {
  return attributes
    .map(attr => buildAttribute(attr, namespaces))
    .concat(namespace ? [{ name: 'xmlns', value: namespace }] : [])
    .concat(namespaces.map(ns => ({ name: `xmlns:${ns.prefix}`, value: ns.uri })))
}

function formatBoolean(value: boolean): string {
  return value ? 'true' : 'false'
}

function formatNumber(value: number, float: boolean): string {
  if (!float) return value.toFixed(0)
  return value
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '.0')
}

function buildValue(value: SimpleType, meta: XmlMetaCommon): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return formatBoolean(value)
  if (typeof value === 'number') return formatNumber(value, meta.float || false)
  return value
}

function isPropertyAttribute(property: Property<XmlMeta>): property is Property<XmlMetaAttribute> {
  return 'attribute' in property.meta
}

function isPropertyNonAttribute(property: Property<XmlMeta>): property is Property<XmlMetaNonAttribute> {
  return !('attribute' in property.meta)
}

function isPropertyRoot(property: Property<XmlMeta>): property is Property<XmlMetaRoot> {
  return 'name' in property.meta
}

function buildValueAttribute(
  property: Property<XmlMetaAttribute>,
  value: SimpleType,
  namespaces: XmlNamespace[] | undefined,
): Attribute {
  const name = property.meta.name || property.key
  return buildAttribute({ namespace: property.meta.namespace, name, value: buildValue(value, property.meta) }, namespaces)
}

function buildValueNode(property: Property<XmlMetaNonAttribute>, value: SimpleType): Node {
  const name = (property.isArray ? property.meta.localName : property.meta.name) || property.key
  return {
    name,
    attributes: [],
    value: buildValue(value, property.meta),
    children: [],
  }
}

function buildRootNode(property: Property<XmlMetaRoot>): Node {
  return {
    name: property.meta.name,
    attributes: buildRootAttributes(
      property.meta.namespace || '',
      property.meta.namespaces || [],
      property.meta.attributes || [],
    ),
    value: '',
    children: [],
  }
}

function buildNode(property: Property<XmlMetaNonAttribute>, useName = false): Node {
  const name = (property.isArray && !useName ? property.meta.localName : property.meta.name) || property.key
  return {
    name,
    attributes: [],
    value: '',
    children: [],
  }
}

function getXmlHeader(format: { standalone?: 'yes' | 'no'; newLine: string }): string {
  const standalone = format.standalone ? ` standalone="${format.standalone}"` : ''
  return `<?xml version="1.0" encoding="UTF-8"${standalone}?>${format.newLine}`
}

export class XmlWriter implements Writer<XmlMeta> {
  private readonly stack: Node[] = []
  private root: {
    node: Node
    meta: XmlMetaRoot
  } | null = null

  private readonly format: {
    newLine: string
    indent: string
  }

  constructor(format: Partial<XmlWriterFormat> = {}) {
    const f = { ...XML_WRITER_DEFAULTS, ...format }
    this.format = f.pretty ? { newLine: '\n', indent: f.indent } : { newLine: '', indent: '' }
  }

  private getNode(): Node {
    return this.stack[this.stack.length - 1]
  }

  add(property: Property<XmlMeta>, _index: number, value: SimpleType): void {
    if (!this.root) throw new Error('Root node not defined')
    if (value === null) return
    const node = this.getNode()
    if (isPropertyAttribute(property)) {
      if (property.isArray) throw new Error('Array cannot be serialized as attribute')
      node.attributes.push(buildValueAttribute(property, value, this.root.meta.namespaces))
    } else if (isPropertyNonAttribute(property)) {
      if (property.meta.value) {
        node.value = buildValue(value, property.meta)
      } else {
        node.children.push(buildValueNode(property, value))
      }
    }
  }

  startArray(property: Property<XmlMeta>, _index: number, _length: number): void {
    if (!this.root) throw new Error('Root node not defined')
    if (!isPropertyNonAttribute(property)) throw new Error('Array cannot be serialized as attribute')
    if (!property.meta.value) {
      const node = this.getNode()
      const newNode = buildNode(property, true)
      node.children.push(newNode)
      this.stack.push(newNode)
    }
  }

  endArray(property: Property<XmlMeta>): void {
    if (!isPropertyNonAttribute(property)) throw new Error('Array cannot be serialized as attribute')
    if (!property.meta.value) {
      this.stack.pop()
    }
  }

  startObject(property: ObjectProperty<XmlMeta>, _index: number): void {
    if (!property.key) {
      if (!isPropertyRoot(property)) throw new Error("Root property doesn't have propert meta")
      this.root = {
        node: buildRootNode(property),
        meta: property.meta,
      }
      this.stack.push(this.root.node)
      return
    }

    if (!isPropertyNonAttribute(property)) throw new Error('Object cannot be serialized as attribute')
    const node = this.getNode()
    const newNode = buildNode(property)
    node.children.push(newNode)
    this.stack.push(newNode)
  }

  endObject(_property: ObjectProperty<XmlMeta>): void {
    this.stack.pop()
  }

  flush(): string {
    if (!this.root) throw new Error('Root node not defined')
    const headerOptions = { standalone: this.root.meta.standalone, newLine: this.format.newLine }
    return getXmlHeader(headerOptions) + getXml('', this.root.node, this.format)
  }

  bytes(): Uint8Array {
    return new TextEncoder().encode(this.flush())
  }
}
