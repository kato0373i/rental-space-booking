import { useEffect, useState } from "react";
import type { AppServices } from "../../composition/webFacade.js";

/**
 * スペースID→名称の解決関数を返すフック。
 * listSpaces が非同期（DBバックエンド対応, ADR-AB01）になったため、
 * 一覧を取得してマップ化する処理を共通化する。
 */
export function useSpaceNames(services: AppServices): (id: string) => string {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    void services.listSpaces().then((spaces) => {
      if (alive) setNames(new Map(spaces.map((s) => [s.spaceId, s.name])));
    });
    return () => {
      alive = false;
    };
  }, [services]);
  return (id: string) => names.get(id) ?? id;
}
