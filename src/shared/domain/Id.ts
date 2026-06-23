/**
 * ブランド型ID。string をそのまま使うと取り違えるため、文脈ごとに区別する。
 * 設計書 §7 shared/domain/Id.ts。
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type SpaceId = Brand<string, "SpaceId">;
export type CustomerId = Brand<string, "CustomerId">;
export type ReservationId = Brand<string, "ReservationId">;

const newUuid = (): string => globalThis.crypto.randomUUID();

export const SpaceId = {
  generate: (): SpaceId => newUuid() as SpaceId,
  of: (raw: string): SpaceId => raw as SpaceId,
};

export const CustomerId = {
  generate: (): CustomerId => newUuid() as CustomerId,
  of: (raw: string): CustomerId => raw as CustomerId,
};

export const ReservationId = {
  generate: (): ReservationId => newUuid() as ReservationId,
  of: (raw: string): ReservationId => raw as ReservationId,
};
