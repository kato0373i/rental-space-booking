import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DayAvailabilityDto } from "../../composition/webFacade.js";
import { useApp } from "../app/AppContext.js";
import { errorMessage } from "../app/errorMessage.js";
import { fmtEpochJst, yen } from "../app/format.js";

const toIsoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

/** 空き枠照会（FR-F02）＋ 開始スロット・コマ数選択と見積もり（FR-F03）。 */
export function AvailabilityPage() {
  const { spaceId } = useParams();
  const { services, setDraft } = useApp();
  const navigate = useNavigate();

  const space = useMemo(
    () => services.listSpaces().find((s) => s.spaceId === spaceId),
    [services, spaceId],
  );

  const today = toIsoDate(new Date());
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(addDays(today, 6));
  const [days, setDays] = useState<DayAvailabilityDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [count, setCount] = useState(() => space?.minSlots ?? 1);

  const slotMs = (space?.slotMinutes ?? 0) * 60_000;

  // 選択開始から count コマの連続エポック（同一日内・連続のみ）。不足なら null。
  const consecutive = useMemo<number[] | null>(() => {
    if (selectedStart === null || !days || slotMs === 0) return null;
    const day = days.find((d) => d.slots.some((s) => s.epochMillis === selectedStart));
    if (!day) return null;
    const epochs: number[] = [];
    for (let i = 0; i < count; i++) {
      const expected = selectedStart + i * slotMs;
      if (!day.slots.some((s) => s.epochMillis === expected)) return null;
      epochs.push(expected);
    }
    return epochs;
  }, [selectedStart, count, days, slotMs]);

  const quote = useMemo(() => {
    if (!consecutive || !spaceId) return null;
    const r = services.quote(spaceId, consecutive);
    return r.ok ? r.value : null;
  }, [consecutive, services, spaceId]);

  if (!spaceId || !space) {
    return <p className="banner error">スペースが見つかりません。</p>;
  }

  const search = () => {
    setError(null);
    setSelectedStart(null);
    const r = services.searchAvailability(spaceId, fromDay, toDay);
    if (r.ok) {
      setDays(r.value);
    } else {
      setDays(null);
      setError(errorMessage(r.error));
    }
  };

  const proceed = () => {
    if (!consecutive || quote === null) return;
    const startEpoch = consecutive[0]!;
    const lastEpoch = consecutive[consecutive.length - 1]!;
    setDraft({
      spaceId,
      spaceName: space.name,
      slotMinutes: space.slotMinutes,
      slotEpochs: consecutive,
      startLabel: fmtEpochJst(startEpoch),
      endLabel: fmtEpochJst(lastEpoch + slotMs),
      priceJpy: quote,
    });
    navigate("/confirm");
  };

  const belowMin = count < space.minSlots;

  return (
    <section>
      <h1>{space.name} の空き枠</h1>
      <p className="muted">
        営業 {space.businessHours} / {space.slotMinutes}分枠 / 予約 {space.minSlots}〜
        {space.maxSlots}コマ
      </p>

      <div className="row">
        <div>
          <label>開始日</label>
          <input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
        </div>
        <div>
          <label>終了日</label>
          <input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} />
        </div>
        <button className="primary" onClick={search}>
          空き枠を検索
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {days && days.length === 0 && <p className="muted">この期間に空きはありません。</p>}

      {days?.map((day) => (
        <div key={day.dateIso} className="day-block">
          <h2>{day.dayLabel}</h2>
          <div className="slot-grid">
            {day.slots.map((slot) => {
              const inRange = consecutive?.includes(slot.epochMillis) ?? false;
              const isStart = slot.epochMillis === selectedStart;
              return (
                <button
                  key={slot.epochMillis}
                  className={`slot${isStart || inRange ? " selected" : ""}`}
                  onClick={() => setSelectedStart(slot.epochMillis)}
                >
                  {slot.timeLabel}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectedStart !== null && (
        <div className="card">
          <h2>利用コマ数</h2>
          <div className="row">
            <div>
              <label>コマ数（{space.slotMinutes}分 × N）</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: space.maxSlots }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} コマ（{(n * space.slotMinutes) / 60} 時間）
                  </option>
                ))}
              </select>
            </div>
          </div>

          {belowMin && (
            <div className="banner error">最小 {space.minSlots} コマからの予約です。</div>
          )}
          {!belowMin && !consecutive && (
            <div className="banner error">
              連続した空き枠が不足しています。開始スロットかコマ数を見直してください。
            </div>
          )}
          {!belowMin && consecutive && quote !== null && (
            <>
              <p>
                {fmtEpochJst(consecutive[0]!)} 〜 {fmtEpochJst(consecutive[consecutive.length - 1]! + slotMs)}
              </p>
              <p>
                見積もり: <strong>{yen(quote)}</strong>
              </p>
              <button className="primary" onClick={proceed}>
                この内容で予約へ進む
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
