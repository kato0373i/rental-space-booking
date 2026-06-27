import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createWebApp, type AppServices, type SessionUser } from "../../composition/webFacade.js";

/** 予約導線でページ間に持ち回る選択内容。 */
export type BookingDraft = {
  readonly spaceId: string;
  readonly spaceName: string;
  readonly slotMinutes: number;
  readonly slotEpochs: number[];
  readonly startLabel: string;
  readonly endLabel: string;
  readonly priceJpy: number;
};

/** 完了画面に渡す確定結果。 */
export type LastReservation = {
  readonly reservationNumber: string;
  readonly priceJpy: number;
  readonly spaceName: string;
};

type AppContextValue = {
  readonly services: AppServices;
  readonly session: SessionUser | null;
  readonly setSession: (s: SessionUser | null) => void;
  readonly draft: BookingDraft | null;
  readonly setDraft: (d: BookingDraft | null) => void;
  readonly lastReservation: LastReservation | null;
  readonly setLastReservation: (r: LastReservation | null) => void;
  /** 通知ログなど派生表示の再取得トリガ。 */
  readonly tick: number;
  readonly refresh: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { readonly children: ReactNode }) {
  // ページロードごとに1コンテナ（シード）。リロードで揮発（NFR-F03）。
  // createWebApp は非同期（DBバックエンドの初期化に対応, ADR-AB01）になったため、
  // 準備完了までは services を null として読み込み表示にする。
  const [services, setServices] = useState<AppServices | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [lastReservation, setLastReservation] = useState<LastReservation | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void createWebApp().then((s) => {
      if (alive) setServices(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!services) {
    return <div className="banner">読み込み中…</div>;
  }

  const value: AppContextValue = {
    services,
    session,
    setSession,
    draft,
    setDraft,
    lastReservation,
    setLastReservation,
    tick,
    refresh: () => setTick((t) => t + 1),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppProvider の内側で使用してください");
  return ctx;
}
