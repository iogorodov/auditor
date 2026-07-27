import type { DeepSimpleObject } from './type-utils'

export type PropertyCommon<Meta = undefined> = {
  key: string
  isNull: boolean
  isArray: boolean
  meta: Meta
}

export type SimpleProperty<Meta = undefined> = PropertyCommon<Meta> & {
  type: 'number' | 'boolean'
}

export type StringProperty<Meta = undefined> = PropertyCommon<Meta> & {
  type: 'string'
  cb?: (v: unknown) => string
}

export type ObjectProperty<Meta = undefined> = PropertyCommon<Meta> & {
  type: 'object'
  properties: Property<Meta>[]
}

export type Property<Meta = undefined> = SimpleProperty<Meta> | StringProperty<Meta> | ObjectProperty<Meta>
export type TypedProperty<T extends DeepSimpleObject, Meta = undefined> = Omit<Property<Meta>, 'key'> & { key: keyof T }

type AvailableKey<S extends DeepSimpleObject, T extends DeepSimpleObject, V> = Exclude<
  {
    [K in keyof S & string]: S[K] extends V ? K : never
  }[keyof S & string],
  keyof T
>

type AllPropertiesDeclared<S extends DeepSimpleObject, T extends DeepSimpleObject> = keyof S extends keyof T
  ? keyof T extends keyof S
    ? true
    : false
  : false

type BuilderWithProperty<S extends DeepSimpleObject, Meta, T extends DeepSimpleObject, K extends string, V> = Builder<
  S,
  Meta,
  T & { [P in K]: V }
>

type BuilderMethods<S extends DeepSimpleObject, Meta, T extends DeepSimpleObject> = {
  meta(meta: Partial<Meta>): BuilderMethods<S, Meta, T>
  boolean<K extends AvailableKey<S, T, boolean>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, boolean>
  number<K extends AvailableKey<S, T, number>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, number>
  string<K extends AvailableKey<S, T, string>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, string>
  booleanNull<K extends AvailableKey<S, T, boolean | null>>(
    key: K,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, boolean | null>
  numberNull<K extends AvailableKey<S, T, number | null>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, number | null>
  stringNull<K extends AvailableKey<S, T, string | null>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, string | null>
  numberArray<K extends AvailableKey<S, T, number[]>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, number[]>
  stringArray<K extends AvailableKey<S, T, string[]>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, string[]>
  stringCallback<K extends AvailableKey<S, T, R>, R>(
    key: K,
    cb: (v: R) => string,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, R>
  object<K extends AvailableKey<S, T, E>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E>
  objectNull<K extends AvailableKey<S, T, E | null>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E | null>
  objectArray<K extends AvailableKey<S, T, E[]>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E[]>
  objectArrayNull<K extends AvailableKey<S, T, E[] | null>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E[] | null>
}

type CompleteMethods<S extends DeepSimpleObject, Meta> = {
  get(): Descriptor<S, Meta>
}

type Builder<S extends DeepSimpleObject, Meta, T extends DeepSimpleObject> =
  AllPropertiesDeclared<S, T> extends true ? CompleteMethods<S, Meta> : BuilderMethods<S, Meta, T>

class BuilderImpl<S extends DeepSimpleObject, Meta, T extends DeepSimpleObject = Record<never, never>> {
  private rootMeta: Meta
  private properties: Property<Meta>[] = []

  constructor(private readonly m: Meta) {
    this.rootMeta = { ...this.m }
  }

  meta(meta: Meta): BuilderMethods<S, Meta, T> {
    this.rootMeta = meta
    return this as BuilderMethods<S, Meta, T>
  }

  boolean<K extends AvailableKey<S, T, boolean>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, boolean> {
    this.properties.push({ key, type: 'boolean', isNull: false, isArray: false, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, boolean>
  }

  number<K extends AvailableKey<S, T, number>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, number> {
    this.properties.push({ key, type: 'number', isNull: false, isArray: false, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, number>
  }

  string<K extends AvailableKey<S, T, string>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, string> {
    this.properties.push({
      key,
      type: 'string',
      isNull: false,
      isArray: false,
      meta: meta || this.m,
    })
    return this as BuilderWithProperty<S, Meta, T, K, string>
  }

  booleanNull<K extends AvailableKey<S, T, boolean | null>>(
    key: K,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, boolean | null> {
    this.properties.push({ key, type: 'boolean', isNull: true, isArray: false, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, boolean | null>
  }

  numberNull<K extends AvailableKey<S, T, number | null>>(
    key: K,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, number | null> {
    this.properties.push({ key, type: 'number', isNull: true, isArray: false, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, number | null>
  }

  stringNull<K extends AvailableKey<S, T, string | null>>(
    key: K,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, string | null> {
    this.properties.push({ key, type: 'string', isNull: true, isArray: false, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, string | null>
  }

  numberArray<K extends AvailableKey<S, T, number[]>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, number[]> {
    this.properties.push({ key, type: 'number', isNull: false, isArray: true, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, number[]>
  }

  stringArray<K extends AvailableKey<S, T, string[]>>(key: K, meta?: Meta): BuilderWithProperty<S, Meta, T, K, string[]> {
    this.properties.push({ key, type: 'string', isNull: false, isArray: true, meta: meta || this.m })
    return this as BuilderWithProperty<S, Meta, T, K, string[]>
  }

  stringCallback<K extends AvailableKey<S, T, R>, R>(
    key: K,
    cb: (v: R) => string,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, R> {
    this.properties.push({
      key,
      type: 'string',
      isNull: false,
      isArray: false,
      cb: cb as (v: unknown) => string,
      meta: meta || this.m,
    })
    return this as unknown as BuilderWithProperty<S, Meta, T, K, R>
  }

  object<K extends AvailableKey<S, T, E>, E extends NonNullable<DeepSimpleObject>>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E> {
    this.properties.push({
      key,
      type: 'object',
      isNull: false,
      isArray: false,
      meta: meta || this.m,
      properties: desc.getProperties() as Property<Meta>[],
    })
    return this as unknown as BuilderWithProperty<S, Meta, T, K, E>
  }

  objectNull<K extends AvailableKey<S, T, E | null>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E | null> {
    this.properties.push({
      key,
      type: 'object',
      isNull: true,
      isArray: false,
      meta: meta || this.m,
      properties: desc.getProperties() as Property<Meta>[],
    })
    return this as BuilderWithProperty<S, Meta, T, K, E | null>
  }

  objectArray<K extends AvailableKey<S, T, E[]>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E[]> {
    this.properties.push({
      key,
      type: 'object',
      isNull: false,
      isArray: true,
      meta: meta || this.m,
      properties: desc.getProperties() as Property<Meta>[],
    })
    return this as unknown as BuilderWithProperty<S, Meta, T, K, E[]>
  }

  objectArrayNull<K extends AvailableKey<S, T, E[] | null>, E extends DeepSimpleObject>(
    key: K,
    desc: Descriptor<E, Meta>,
    meta?: Meta,
  ): BuilderWithProperty<S, Meta, T, K, E[] | null> {
    this.properties.push({
      key,
      type: 'object',
      isNull: true,
      isArray: true,
      meta: meta || this.m,
      properties: desc.getProperties() as Property<Meta>[],
    })
    return this as unknown as BuilderWithProperty<S, Meta, T, K, E[] | null>
  }

  get(): Descriptor<S, Meta> {
    return new Descriptor<S, Meta>(this.properties, this.rootMeta)
  }
}

export class Descriptor<S extends DeepSimpleObject, Meta = undefined> {
  constructor(
    private readonly properties: TypedProperty<S, Meta>[],
    private readonly meta: Meta,
  ) {}

  getMeta(): Meta {
    return this.meta
  }

  getProperties(): TypedProperty<S, Meta>[] {
    return this.properties
  }

  static create<S extends DeepSimpleObject>(): Builder<S, undefined, Record<never, never>>
  static create<S extends DeepSimpleObject, Meta>(meta: Meta): Builder<S, Meta, Record<never, never>>
  static create<S extends DeepSimpleObject, Meta>(meta?: Meta): Builder<S, Meta, Record<never, never>> {
    return new BuilderImpl<S, Meta>(meta as Meta) as Builder<S, Meta, Record<never, never>>
  }
}
