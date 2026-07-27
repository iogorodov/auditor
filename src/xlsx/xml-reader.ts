// XmlReader — реализация Reader<XmlMeta> поверх дерева xml-parse (по образцу JSONReader).
// Читает по тем же схемам-дескрипторам, что и XmlWriter пишет. Терпимость к чужим файлам:
// поиск элементов и атрибутов по локальным именам, лишние элементы/атрибуты игнорируются,
// отсутствующее значение -> undefined (драйвер read превращает его в null для *Null-полей).

import type { ObjectProperty, Property } from './descriptor'
import type { Reader } from './serialize'
import type { SimpleType } from './type-utils'
import type { XmlMeta, XmlMetaNonAttribute, XmlMetaRoot } from './xml'
import type { XmlElement } from './xml-parse'

type Frame = {
  el: XmlElement
  items: XmlElement[] | null // элементы текущего массива (между startArray и endArray)
}

function isMetaRoot(meta: XmlMeta): meta is XmlMetaRoot {
  return 'name' in meta && !('attribute' in meta) && !('value' in meta) && !('localName' in meta)
}

function isMetaAttribute(meta: XmlMeta): boolean {
  return 'attribute' in meta
}

function nodeName(property: Property<XmlMeta>, useName: boolean): string {
  const meta = property.meta as XmlMetaNonAttribute
  return (property.isArray && !useName ? meta.localName : meta.name) || property.key
}

function findChild(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find(child => child.name === name)
}

function convert(property: Property<XmlMeta>, raw: string): SimpleType | undefined {
  if (property.type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }
  if (property.type === 'boolean') {
    if (raw === 'true' || raw === '1') return true
    if (raw === 'false' || raw === '0') return false
    return undefined
  }
  return raw
}

export class XmlReader implements Reader<XmlMeta> {
  private readonly stack: Frame[] = []

  constructor(private readonly root: XmlElement) {}

  private top(): Frame {
    const frame = this.stack[this.stack.length - 1]
    if (!frame) throw new Error('XmlReader: чтение вне корневого объекта')
    return frame
  }

  add(property: Property<XmlMeta>, index: number): SimpleType | undefined {
    if (property.type === 'object') return undefined
    const frame = this.top()

    // Элемент простого массива: текст i-го элемента.
    if (property.isArray) {
      const item = frame.items?.[index]
      return item === undefined ? undefined : convert(property, item.text)
    }

    const meta = property.meta
    if (isMetaAttribute(meta)) {
      const name = ('name' in meta && meta.name) || property.key
      const raw = frame.el.attributes[name]
      return raw === undefined ? undefined : convert(property, raw)
    }
    if ('value' in meta && meta.value) return convert(property, frame.el.text)
    const child = findChild(frame.el, nodeName(property, false))
    return child === undefined ? undefined : convert(property, child.text)
  }

  startArray(property: Property<XmlMeta>, _index: number): number | undefined {
    if (isMetaAttribute(property.meta)) throw new Error('Массив не может читаться из атрибута')
    const meta = property.meta as XmlMetaNonAttribute
    const itemName = nodeName(property, false)

    // value: true — элементы массива лежат прямо в текущем узле; иначе — в узле-контейнере.
    let container = this.top().el
    if (!meta.value) {
      const found = findChild(container, nodeName(property, true))
      if (!found) return undefined
      container = found
    }
    const items = container.children.filter(child => child.name === itemName)
    this.stack.push({ el: container, items })
    return items.length
  }

  endArray(_property: Property<XmlMeta>): void {
    this.stack.pop()
  }

  startObject(property: ObjectProperty<XmlMeta>, index: number): true | undefined {
    // Корень: сверяем имя корневого элемента со схемой.
    if (!property.key) {
      if (!isMetaRoot(property.meta) || this.root.name !== property.meta.name) return undefined
      this.stack.push({ el: this.root, items: null })
      return true
    }

    if (property.isArray) {
      const item = this.top().items?.[index]
      if (!item) return undefined
      this.stack.push({ el: item, items: null })
      return true
    }

    const child = findChild(this.top().el, nodeName(property, false))
    if (!child) return undefined
    this.stack.push({ el: child, items: null })
    return true
  }

  endObject(_property: ObjectProperty<XmlMeta>): void {
    this.stack.pop()
  }
}
