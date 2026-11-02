type Method<A extends unknown[], R> = { bivarianceHack(...args: A): R }["bivarianceHack"]

/** Levels checked below the faked type: `ctx` (0), `ctx.tabs` (1), `ctx.tabs.list` (2). What a method returns is not. */
type Depth = [unknown, unknown, unknown]

/** A fake method may return a partial of the host's result, or nothing when the test does not read it. */
type Returned<R, D extends unknown[]> = R extends Promise<infer U> ? Promise<Fake<U, D> | void> : Fake<R, D> | void

/**
 * What a test may supply for a host type `T`: every member optional, nested objects partial, so a renamed, removed or
 * retyped SDK member fails typecheck. Checking stops where host data begins (what a method returns, three levels
 * down), because fixtures there are plain data the test owns. Function parameters are compared bivariantly so a fake
 * can declare just the fields it reads.
 */
export type Fake<T, D extends unknown[] = []> = D["length"] extends Depth["length"]
  ? unknown
  : T extends (...args: infer A) => infer R
    ? Method<A, Returned<R, [...D, unknown]>>
    : T extends Promise<infer U>
      ? Promise<Fake<U, D>>
      : T extends readonly (infer U)[]
        ? readonly Fake<U, D>[]
        : T extends object
          ? { [K in keyof T]?: Fake<T[K], [...D, unknown]> }
          : T

/**
 * The one cast for fakes of host types: the `Fake<T>` argument keeps the call honest, so a test names the members it
 * implements and the rest are absent at runtime.
 */
export function fake<T>(partial: Fake<T>): T {
  return partial as T
}
