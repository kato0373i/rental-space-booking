import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AdminSpaceFormInput } from "../../../composition/webFacade.js";
import { useApp } from "../../app/AppContext.js";
import { errorDetails, errorMessage } from "../../app/errorMessage.js";

const DAY_KINDS = ["Weekday", "Saturday", "Sunday"] as const;
type DayKindUi = (typeof DAY_KINDS)[number];
const DAY_LABEL: Record<DayKindUi, string> = { Weekday: "平日", Saturday: "土曜", Sunday: "日曜" };

type RuleRow = {
  dayKind: DayKindUi;
  fromHour: number;
  fromMinute: number;
  toHour: number;
  toMinute: number;
  unitPriceJpy: number;
};
type TierRow = { hoursBefore: number; feeRatePct: number };
type FormState = {
  name: string;
  capacity: number;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  slotMinutes: number;
  minSlots: number;
  maxSlots: number;
  bookableHorizonDays: number;
  rateRules: RuleRow[];
  cancellationTiers: TierRow[];
};

const INITIAL: FormState = {
  name: "",
  capacity: 1,
  openHour: 9,
  openMinute: 0,
  closeHour: 18,
  closeMinute: 0,
  slotMinutes: 60,
  minSlots: 1,
  maxSlots: 8,
  bookableHorizonDays: 30,
  rateRules: [
    { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
    { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
    { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
  ],
  cancellationTiers: [
    { hoursBefore: 0, feeRatePct: 50 },
    { hoursBefore: 48, feeRatePct: 0 },
  ],
};

/** スペース新規登録・フル編集（FR-AD02/AD03）。料金表・キャンセルポリシーを行編集する。 */
export function AdminSpaceFormPage() {
  const { spaceId } = useParams();
  const { services, session } = useApp();
  const navigate = useNavigate();
  const isEdit = spaceId !== undefined;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<readonly string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !session || spaceId === undefined) return;
    const r = services.admin.getSpaceDetail(session, spaceId);
    if (!r.ok) {
      setLoadError(errorMessage(r.error));
      return;
    }
    const d = r.value;
    setForm({
      name: d.name,
      capacity: d.capacity,
      openHour: d.openHour,
      openMinute: d.openMinute,
      closeHour: d.closeHour,
      closeMinute: d.closeMinute,
      slotMinutes: d.slotMinutes,
      minSlots: d.minSlots,
      maxSlots: d.maxSlots,
      bookableHorizonDays: d.bookableHorizonDays,
      rateRules: d.rateRules.map((r2) => ({ ...r2 })),
      cancellationTiers: d.cancellationTiers.map((t) => ({ ...t })),
    });
  }, [isEdit, session, spaceId, services]);

  if (!session) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRule = (i: number, patch: Partial<RuleRow>) =>
    setForm((f) => ({ ...f, rateRules: f.rateRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const addRule = () =>
    setForm((f) => ({
      ...f,
      rateRules: [...f.rateRules, { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 }],
    }));
  const removeRule = (i: number) =>
    setForm((f) => ({ ...f, rateRules: f.rateRules.filter((_, idx) => idx !== i) }));
  const setTier = (i: number, patch: Partial<TierRow>) =>
    setForm((f) => ({ ...f, cancellationTiers: f.cancellationTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  const addTier = () =>
    setForm((f) => ({ ...f, cancellationTiers: [...f.cancellationTiers, { hoursBefore: 0, feeRatePct: 0 }] }));
  const removeTier = (i: number) =>
    setForm((f) => ({ ...f, cancellationTiers: f.cancellationTiers.filter((_, idx) => idx !== i) }));

  const submit = () => {
    setError(null);
    setDetails([]);
    const payload: AdminSpaceFormInput = form;
    const r =
      isEdit && spaceId !== undefined
        ? services.admin.editSpace(session, spaceId, payload)
        : services.admin.registerSpace(session, payload);
    if (r.ok) {
      navigate("/admin/spaces");
    } else {
      setError(errorMessage(r.error));
      setDetails(errorDetails(r.error));
    }
  };

  if (loadError) return <div className="banner error">{loadError}</div>;

  return (
    <section>
      <h1>{isEdit ? "スペース編集" : "スペース新規登録"}</h1>
      {isEdit && (
        <p className="muted">変更は今後の予約に適用され、既存の確定予約には影響しません（FR-002）。</p>
      )}

      <div className="card">
        <h2>基本情報</h2>
        <label>名称</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        <div className="row">
          <div>
            <label>定員</label>
            <input type="number" value={form.capacity} onChange={(e) => set("capacity", Number(e.target.value))} />
          </div>
          <div>
            <label>スロット長(分)</label>
            <input type="number" value={form.slotMinutes} onChange={(e) => set("slotMinutes", Number(e.target.value))} />
          </div>
          <div>
            <label>予約可能上限(日)</label>
            <input type="number" value={form.bookableHorizonDays} onChange={(e) => set("bookableHorizonDays", Number(e.target.value))} />
          </div>
        </div>
        <div className="row">
          <div>
            <label>営業開始(時:分)</label>
            <div className="row">
              <input type="number" value={form.openHour} onChange={(e) => set("openHour", Number(e.target.value))} />
              <input type="number" value={form.openMinute} onChange={(e) => set("openMinute", Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label>営業終了(時:分)</label>
            <div className="row">
              <input type="number" value={form.closeHour} onChange={(e) => set("closeHour", Number(e.target.value))} />
              <input type="number" value={form.closeMinute} onChange={(e) => set("closeMinute", Number(e.target.value))} />
            </div>
          </div>
        </div>
        <div className="row">
          <div>
            <label>最小コマ数</label>
            <input type="number" value={form.minSlots} onChange={(e) => set("minSlots", Number(e.target.value))} />
          </div>
          <div>
            <label>最大コマ数</label>
            <input type="number" value={form.maxSlots} onChange={(e) => set("maxSlots", Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>料金表（曜日区分 × 時間帯 → 単価）</h2>
        <p className="muted">営業時間内の全スロットを被覆する必要があります（不被覆は保存時にエラー）。</p>
        {form.rateRules.map((r, i) => (
          <div key={i} className="row">
            <select value={r.dayKind} onChange={(e) => setRule(i, { dayKind: e.target.value as DayKindUi })}>
              {DAY_KINDS.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABEL[d]}
                </option>
              ))}
            </select>
            <input type="number" value={r.fromHour} onChange={(e) => setRule(i, { fromHour: Number(e.target.value) })} />
            <input type="number" value={r.fromMinute} onChange={(e) => setRule(i, { fromMinute: Number(e.target.value) })} />
            <span>〜</span>
            <input type="number" value={r.toHour} onChange={(e) => setRule(i, { toHour: Number(e.target.value) })} />
            <input type="number" value={r.toMinute} onChange={(e) => setRule(i, { toMinute: Number(e.target.value) })} />
            <input type="number" value={r.unitPriceJpy} onChange={(e) => setRule(i, { unitPriceJpy: Number(e.target.value) })} />
            <span className="muted">円</span>
            <button onClick={() => removeRule(i)} disabled={form.rateRules.length <= 1}>
              削除
            </button>
          </div>
        ))}
        <button onClick={addRule}>＋ 料金規則を追加</button>
      </div>

      <div className="card">
        <h2>キャンセルポリシー（N時間前 → 料率%）</h2>
        <p className="muted">hoursBefore=0 の段階（直前の料率）を必ず含めてください。</p>
        {form.cancellationTiers.map((t, i) => (
          <div key={i} className="row">
            <span className="muted">利用</span>
            <input type="number" value={t.hoursBefore} onChange={(e) => setTier(i, { hoursBefore: Number(e.target.value) })} />
            <span className="muted">時間前以降</span>
            <input type="number" value={t.feeRatePct} onChange={(e) => setTier(i, { feeRatePct: Number(e.target.value) })} />
            <span className="muted">%</span>
            <button onClick={() => removeTier(i)} disabled={form.cancellationTiers.length <= 1}>
              削除
            </button>
          </div>
        ))}
        <button onClick={addTier}>＋ 段階を追加</button>
      </div>

      {error && (
        <div className="banner error">
          {error}
          {details.length > 0 && (
            <ul>
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row">
        <button className="primary" onClick={submit}>
          {isEdit ? "保存する" : "登録する"}
        </button>
        <button onClick={() => navigate("/admin/spaces")}>キャンセル</button>
      </div>
    </section>
  );
}
