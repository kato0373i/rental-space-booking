/**
 * アプリケーション横断の型付きエラー。
 * 設計書 §5「エラーレスポンス規約」の各コードに対応する判別可能ユニオン。
 */

export type ValidationError = {
  readonly kind: "ValidationError";
  readonly message: string;
  readonly details: readonly string[];
};

export type ConflictError = {
  readonly kind: "ConflictError";
  readonly message: string;
};

export type PaymentFailed = {
  readonly kind: "PaymentFailed";
  readonly reason: "Failed" | "TimedOut";
  readonly message: string;
};

export type NotFound = {
  readonly kind: "NotFound";
  readonly message: string;
};

export type ForbiddenError = {
  readonly kind: "ForbiddenError";
  readonly message: string;
};

export type IllegalState = {
  readonly kind: "IllegalState";
  readonly message: string;
};

export type AppError =
  | ValidationError
  | ConflictError
  | PaymentFailed
  | NotFound
  | ForbiddenError
  | IllegalState;

export const validationError = (
  message: string,
  details: readonly string[] = [],
): ValidationError => ({ kind: "ValidationError", message, details });

export const conflictError = (message: string): ConflictError => ({
  kind: "ConflictError",
  message,
});

export const paymentFailed = (
  reason: "Failed" | "TimedOut",
  message: string,
): PaymentFailed => ({ kind: "PaymentFailed", reason, message });

export const notFound = (message: string): NotFound => ({ kind: "NotFound", message });

export const forbiddenError = (message: string): ForbiddenError => ({
  kind: "ForbiddenError",
  message,
});

export const illegalState = (message: string): IllegalState => ({
  kind: "IllegalState",
  message,
});
