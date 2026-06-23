import { JstDateTime } from "./JstDateTime.js";

/**
 * 現在時刻ポート。ドメイン/アプリは `new Date()` を直接触らず Clock 経由で現在時刻を得る。
 * テスト・シード・リマインド基準時刻の差し替えを容易にする（設計書 §7）。
 */
export interface Clock {
  now(): JstDateTime;
}

export class SystemClock implements Clock {
  now(): JstDateTime {
    return JstDateTime.fromEpochMillis(Date.now());
  }
}

/** テスト・デモ用の固定/可変クロック。 */
export class FixedClock implements Clock {
  private current: JstDateTime;

  constructor(initial: JstDateTime) {
    this.current = initial;
  }

  now(): JstDateTime {
    return this.current;
  }

  set(at: JstDateTime): void {
    this.current = at;
  }

  advanceMinutes(minutes: number): void {
    this.current = this.current.addMinutes(minutes);
  }
}
