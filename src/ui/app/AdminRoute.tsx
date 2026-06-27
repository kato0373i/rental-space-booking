import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "./AppContext.js";

/** 管理者ロールでガードするルート（FR-AD01 / NFR-AD01）。非管理者はログインへ。 */
export function AdminRoute({ children }: { readonly children: ReactNode }) {
  const { session } = useApp();
  if (session?.role !== "Admin") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
