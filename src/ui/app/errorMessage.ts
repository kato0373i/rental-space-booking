import type { AppError } from "../../composition/webFacade.js";

/** 型付きエラーの表示メッセージ（FR-F12）。バックエンドの日本語 message をそのまま使う。 */
export const errorMessage = (error: AppError): string => error.message;

/** ValidationError の詳細項目（あれば）。フォーム直下に列挙する。 */
export const errorDetails = (error: AppError): readonly string[] =>
  error.kind === "ValidationError" ? error.details : [];
