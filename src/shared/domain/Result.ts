/**
 * Result<T, E> — 型付きエラー（判別可能ユニオン）。
 * 設計書 §5「エラーレスポンス規約」/ §10 D-01: 例外送出ではなく Result を基本とする。
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Ok のときのみ値を変換する。 */
export const map = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

/** Ok のときのみ別の Result を返す（連鎖）。 */
export const flatMap = <T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

/** Err のときのみエラーを変換する。 */
export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> =>
  r.ok ? r : err(f(r.error));

/** Result の配列を、全て Ok なら値配列の Ok に、1つでも Err なら最初の Err にまとめる。 */
export const all = <T, E>(results: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
};

/** Ok を取り出す。Err の場合は例外（プログラミングエラー検出用。通常は分岐で扱う）。 */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (!r.ok) throw new Error(`unwrap called on Err: ${JSON.stringify(r.error)}`);
  return r.value;
};
