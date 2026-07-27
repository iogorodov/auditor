export type Callback<TArgs extends unknown[]> = (...args: TArgs) => void

export type Convert<TValue, TResult> = (value: TValue) => TResult
export type ConvertArray<T, TResult> = (item: T, index: number) => TResult

export type Select<T, P> = { [key in keyof T as T[key] extends P ? key : never]: T[key] }
export type Append<T extends unknown[], P> = [...T, P]

export type IndexTypes = number | string

export type GenericFunction = (...args: unknown[]) => unknown
export type GenericTypes = undefined | object | boolean | number | bigint | string | symbol | GenericFunction
export type GenericTypesNames = 'undefined' | 'object' | 'boolean' | 'number' | 'bigint' | 'string' | 'symbol' | 'function'
export type GenericTypeFromName<T extends GenericTypesNames> = T extends 'undefined'
  ? undefined
  : T extends 'object'
    ? object
    : T extends 'boolean'
      ? boolean
      : T extends 'number'
        ? number
        : T extends 'bigint'
          ? bigint
          : T extends 'string'
            ? string
            : T extends 'symbol'
              ? symbol
              : T extends 'function'
                ? GenericFunction
                : never

export type ObjectWithProperty<K extends string, P extends GenericTypes | unknown> = { [_ in K]: P }

export type PrimitiveTypes = null | boolean | number | string | undefined
export type PrimitiveObject = { [key in string]: PrimitiveTypes }
export type DeepPrimitive = PrimitiveTypes | PrimitiveTypes[] | { [key in string]: DeepPrimitive | DeepPrimitive[] }
export type DeepPrimitiveObject = { [key in string]: DeepPrimitive | DeepPrimitive[] }

export type SimpleType = null | boolean | number | string
export type DeepSimple = SimpleType | SimpleType[] | DeepSimpleObject | DeepSimpleObject[]
export type DeepSimpleObject = { [key: string]: DeepSimple }

export type Promisify<T extends object> = {
  [K in keyof T]: T[K] extends (...args: infer TArgs) => infer TResult ? (...args: TArgs) => Promise<TResult> : never
}

export type EmptyObject<T extends object> = Record<keyof T, never>

export type PartialUnknown<T> = {
  [K in keyof T]?: unknown
}

export function isPartialUnknown<T>(value: unknown): value is PartialUnknown<T> {
  return typeof value === 'object' && value !== null
}

export type ExtractParams<T> = T extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & ExtractParams<Rest>
  : T extends `${string}:${infer Param}`
    ? { [K in Param]: string }
    : T extends `${string}*`
      ? // biome-ignore lint/complexity/noBannedTypes: using {} here intentionally
        {}
      : // biome-ignore lint/complexity/noBannedTypes: using {} here intentionally
        {}

export type ExtractParamsRecord<P extends string> = string extends P ? Record<string, string> : ExtractParams<P>

export type UnlistenCallback = () => void

export type QueryParam = string | number | boolean | string[] | number[]

export class EventsProvider<TArgs extends unknown[]> {
  private id = 0
  private readonly handlers: { id: number; f: (...args: TArgs) => void }[] = []

  private remove(id: number): void {
    const index = this.handlers.findIndex(it => it.id === id)
    if (index >= 0) this.handlers.splice(id, 1)
  }

  add(f: (...args: TArgs) => void): UnlistenCallback {
    const id = ++this.id
    this.handlers.push({ id, f })
    return () => {
      this.remove(id)
    }
  }

  emit(...args: TArgs): void {
    this.handlers.forEach(({ f }) => {
      f(...args)
    })
  }
}

export function isKeyOf<T extends object>(value: string | number | symbol, obj: T): value is keyof T {
  return value in obj
}

export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

export function hasAnyProperty<K extends string>(value: object, name: K): value is ObjectWithProperty<K, unknown> {
  return isKeyOf(name, value)
}

export function hasProperty<K extends string, P extends GenericTypesNames>(
  value: object,
  name: K,
  type: P,
): value is ObjectWithProperty<K, GenericTypeFromName<P>> {
  return isKeyOf(name, value) && typeof value[name] === type
}

export function hasObject<P extends object, K extends string = string>(
  value: object,
  name: K,
): value is ObjectWithProperty<K, P> {
  return isKeyOf(name, value) && typeof value[name] === 'object'
}

export function hasFunction<K extends string>(value: object, name: K): value is ObjectWithProperty<K, GenericFunction> {
  return isKeyOf(name, value) && typeof value[name] === 'function'
}

export function hasField<T, K extends keyof T>(obj: T, key: K): obj is T & Required<Pick<T, K>> {
  return obj[key] !== undefined
}

export function isDate(value: unknown): value is Date {
  return isObject(value) && hasFunction(value, 'getTime')
}

export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return isObject(value) && hasFunction(value, 'then') && hasFunction(value, 'catch')
}

export function isNotNull<T>(value: T | null): value is T {
  return value !== null
}

export function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

export function isError(value: unknown): value is Error {
  return isObject(value) && hasProperty(value, 'name', 'string') && hasProperty(value, 'message', 'string')
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
}

export function getObjectKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

export function getDictKeys(obj: { [key: string]: unknown }): string[] {
  return Object.keys(obj) as string[]
}

export function pushToRecord<TKey extends string | number | symbol, TValue>(
  obj: Record<TKey, TValue[]>,
  key: TKey,
  value: TValue,
): Record<TKey, TValue[]> {
  const values = obj[key]
  if (values) {
    values.push(value)
  } else {
    obj[key] = [value]
  }

  return obj
}

export function ensureError(error: unknown): Error {
  if (isError(error)) return error
  if (isObject(error)) return new Error(JSON.stringify(error))
  return new Error(String(error))
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message
  if (isObject(error)) return JSON.stringify(error)
  return String(error)
}

export function printError(log: (...args: unknown[]) => void, error: unknown, format: Convert<Error, string>): void {
  log(format(ensureError(error)))
}

export function ensurePromise<T>(value: T | Promise<T>): Promise<T> {
  if (isPromise(value)) return value
  return Promise.resolve(value)
}

/** Clone first level of specified properties of the object
 * @param obj Object to clone
 * @param keys Array of properties to clone
 * @returns Cloned object or null if no properties are cloned
 */
export function clonePartial<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> | null {
  return keys.reduce(
    (result, key) => {
      if (!isKeyOf(key, obj)) return result
      const value = obj[key]
      if (!result) return { [key]: value } as Partial<T>
      result[key] = value
      return result
    },
    null as Partial<T> | null,
  )
}

function getPartObject<T extends object>(result: T, part: string): unknown | null {
  if (!isKeyOf(part, result)) return null
  const next = result[part]

  if (typeof next === 'function') return next.call(result)
  if (typeof next === 'undefined') return null

  return next
}

function getPartString(result: string, part: string): unknown | null {
  if (part === 'length') return result.length

  const index = Number.parseInt(part)
  if (!Number.isNaN(index)) return result[index]

  return null
}

function getNextValue(result: unknown, part: string): unknown | null {
  if (result === null) return null
  if (typeof result === 'object') return getPartObject(result, part)
  if (typeof result === 'string') return getPartString(result, part)

  return null
}

export function getValue(context: unknown, value: string, start = 0): unknown {
  let s = start
  let result = context
  while (result !== null) {
    const p = value.indexOf('.', s)
    if (p < 0) return getNextValue(result, value.substring(s))
    result = getNextValue(result, value.substring(s, p))
    s = p + 1
  }
  return result
}

export function forEachRecord<Key extends IndexTypes, Value>(
  obj: Record<Key, Value>,
  callback: (key: Key, value: Value) => void,
): void {
  getObjectKeys(obj).forEach(key => {
    callback(key, obj[key])
  })
}

export function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}
