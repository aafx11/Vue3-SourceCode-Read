import { isObject, toRawType, def } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers
} from './collectionHandlers'
import type { UnwrapRefSimple, Ref, RawSymbol } from './ref'

export const enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  IS_SHALLOW = '__v_isShallow',
  RAW = '__v_raw'
}

export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.IS_SHALLOW]?: boolean
  [ReactiveFlags.RAW]?: any
}

export const reactiveMap = new WeakMap<Target, any>()
export const shallowReactiveMap = new WeakMap<Target, any>()
export const readonlyMap = new WeakMap<Target, any>()
export const shallowReadonlyMap = new WeakMap<Target, any>()

const enum TargetType {
  INVALID = 0,
  COMMON = 1,
  COLLECTION = 2
}

// 根据字符串判断类型
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON // 对象类型
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION // 集合类型
    default:
      return TargetType.INVALID // 无效的类型，无法被代理
  }
}

/**
 * 获取 value 的类型，用于判断 target 能否被代理
 * @param value 目标对象
 * @returns 
 */
function getTargetType(value: Target) {
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? TargetType.INVALID // 如果value上有__v_skip这个属性 或者 该对象不能被拓展(不能添加新属性) ,则返回 TargetType.INVALID （枚举0），表示该对象不能被代理
    : targetTypeMap(toRawType(value)) // 返回枚举 1对象类型，2集合类型，0无效的类型
}

// only unwrap nested ref
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>

/**
 * Creates a reactive copy of the original object.
 *
 * The reactive conversion is "deep"—it affects all nested properties. In the
 * ES2015 Proxy based implementation, the returned proxy is **not** equal to the
 * original object. It is recommended to work exclusively with the reactive
 * proxy and avoid relying on the original object.
 *
 * A reactive object also automatically unwraps refs contained in it, so you
 * don't need to use `.value` when accessing and mutating their value:
 *
 * ```js
 * const count = ref(0)
 * const obj = reactive({
 *   count
 * })
 *
 * obj.count++
 * obj.count // -> 1
 * count.value // -> 1
 * ```
 */
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  /**
   * 如果这个对象已经被 readonly 代理过了，直接返回该对象。
   * isReadonly 函数先判断 target 是否存在，然后会取 target 上的 __v_isReadonly 属性，
   * 如果target 已经被 readonly 代理过了，就会触发 get 
   * (./baseHandlers.ts 的 createGetter 函数)
   *  if(key === ReactiveFlags.IS_READONLY) return isReadonly,
   * 所以 target 已经被 readonly 代理过了的话，isReadonly函数会返回true,直接返回该对象
   */
  /* isReadonly 函数
  export function isReadonly(value: unknown): boolean {
      return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
    } 
  */
  if (isReadonly(target)) {
    return target
  }
  // 创建响应式对象
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  )
}

export declare const ShallowReactiveMarker: unique symbol

export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true }

/**
 * Return a shallowly-reactive copy of the original object, where only the root
 * level properties are reactive. It also does not auto-unwrap refs (even at the
 * root level).
 */
export function shallowReactive<T extends object>(
  target: T
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  )
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlyMap<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends WeakMap<infer K, infer V>
  ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends Set<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends ReadonlySet<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends WeakSet<infer U>
  ? WeakSet<DeepReadonly<U>>
  : T extends Promise<infer U>
  ? Promise<DeepReadonly<U>>
  : T extends Ref<infer U>
  ? Readonly<Ref<DeepReadonly<U>>>
  : T extends {}
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : Readonly<T>

/**
 * Creates a readonly copy of the original object. Note the returned copy is not
 * made reactive, but `readonly` can be called on an already reactive object.
 */
export function readonly<T extends object>(
  target: T
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  )
}

/**
 * Returns a reactive-copy of the original object, where only the root level
 * properties are readonly, and does NOT unwrap refs nor recursively convert
 * returned properties.
 * This is used for creating the props proxy object for stateful components.
 */
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  )
}


/**
 * 创建响应式对象
 * @param target 目标对象arr，obj，set，map
 * @param isReadonly 是否只读
 * @param baseHandlers new proxy(traget,handler) 中的 handler 处理器，处理arr，obj
 * @param collectionHandlers 集合处理器 new proxy(traget,handler) 中的 handler 拦截器，处理map,set
 * @param proxyMap 用来存储响应式对象的 WeakMap，包括 reactiveMap ，shallowReactiveMap ，readonlyMap ，shallowReadonlyMap ，用于存储不同类型的响应式对象
 * @returns 
 */
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>
) {
  if (!isObject(target)) { // 只接受对象类型，如果是原始数据类型，直接return target
    if (__DEV__) {// 开发模式下，会抛异常
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target is already a Proxy, return it. 目标已经被代理过了，直接返回
  // exception: calling readonly() on a reactive object 列外:
  if (
    target[ReactiveFlags.RAW] && // 取target的 __v_raw 属性，如果已经是响应式对象，会触发get
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE]) // !(是只读 并且 target 已经被reactive 代理过了) ，取反表示 readonly(reactive(obj)) 这种做法是可以的
  ) {
    return target
  }
  // target already has corresponding Proxy ,target 已经被代理过了
  const existingProxy = proxyMap.get(target)
  if (existingProxy) { // target 已经在 proxyMap 中，表示已经被代理过了,直接返回,防止出现 reactive(reactive(obj)) 这种情况
    return existingProxy
  }

  // only specific value types can be observed. 
  // 只有特定类型(即 getTargetType 函数中的 Object,Array,Map,Set,WeakMap,WeakSet 类型)可以被代理
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) { // target 为无效类型，无法代理
    return target
  }
  // 创建proxy对象
  const proxy = new Proxy(
    target,
    // 判断是否是集合，是集合用 collectionHandlers 处理器，是对象用 baseHandlers 处理器
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
  )
  //将新创建的 proxy 对象，存入WeakMap 中，key 为原对象，value 为 proxy 对象
  proxyMap.set(target, proxy) 
  return proxy
}

export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) {
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

// 返回响应式对象的原始对象(从存储响应式对象的WeakMap里获取)
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}

export type Raw<T> = T & { [RawSymbol]?: true }

// 标记一个对象的 __v_skip 属性为true，表示该对象不能被代理（有些库可能不支持操作proxy，可以标记一个对象不能被代理，防止出问题）
export function markRaw<T extends object>(value: T): Raw<T> {
  def(value, ReactiveFlags.SKIP, true)
  return value
}

export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

export const toReadonly = <T extends unknown>(value: T): T =>
  isObject(value) ? readonly(value as Record<any, any>) : value
