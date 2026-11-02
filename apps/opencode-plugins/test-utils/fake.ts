/**
 * A fake of a host type. Every field is checked against `T`, so a renamed or retyped SDK member fails typecheck here;
 * fields the test leaves out are absent at runtime. Nested objects take partials too.
 */
export type Fake<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: Fake<T[K]> }
      : T

/** One cast, here, instead of one per test: the `Fake<T>` argument is what keeps the call honest. */
export function fake<T>(partial: Fake<T>): T {
  return partial as T
}
