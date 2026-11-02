type Method<A extends unknown[], R> = { bivarianceHack(...args: A): R }["bivarianceHack"]

/** A fake method may return a partial of the host's result, or nothing when the test does not read it. */
type Returned<R> = R extends Promise<infer U> ? Promise<Fake<U> | void> : Fake<R> | void

/**
 * What a test may supply for a host type `T`: every member optional, nested objects partial, and a function may return
 * a partial of what the host's returns. Every field is still checked against `T`, so a renamed or retyped SDK member
 * fails typecheck. Function parameters are compared bivariantly so a fake can declare just the fields it reads.
 */
export type Fake<T> = T extends (...args: infer A) => infer R
  ? Method<A, Returned<R>>
  : T extends Promise<infer U>
    ? Promise<Fake<U>>
    : T extends readonly (infer U)[]
      ? readonly Fake<U>[]
      : T extends object
        ? { [K in keyof T]?: Fake<T[K]> }
        : T

/**
 * The one cast for fakes of host types: the `Fake<T>` argument keeps the call honest, so a test names the members it
 * implements and the rest are absent at runtime.
 */
export function fake<T>(partial: Fake<T>): T {
  return partial as T
}
