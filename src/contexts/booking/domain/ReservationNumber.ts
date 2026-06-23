/** ゲスト照会用の予約番号 VO（FR-016）。例: RSV-1A2B3C4D。 */
export class ReservationNumber {
  private constructor(readonly value: string) {}

  static generate(): ReservationNumber {
    const rand = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return new ReservationNumber(`RSV-${rand}`);
  }

  static of(value: string): ReservationNumber {
    return new ReservationNumber(value);
  }

  equals(other: ReservationNumber): boolean {
    return this.value === other.value;
  }
}
