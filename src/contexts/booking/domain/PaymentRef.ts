/**
 * 決済参照 VO。冪等キー（= ReservationId）を保持する（FR-020）。
 * 実際の与信/返金状態は決済アダプタ内の PaymentRecord が持ち、Booking はその内部に依存しない（ADR-001）。
 */
export class PaymentRef {
  private constructor(readonly idempotencyKey: string) {}

  static forReservation(reservationId: string): PaymentRef {
    return new PaymentRef(reservationId);
  }
}
