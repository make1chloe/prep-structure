"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countImported, wipeImported } from "./wipeActions";

/**
 * **노션에서 옮긴 것 지우기** (2026-08-06).
 *
 * 원장님 — 「그냥 여태 노션 올린 자료를 웹앱에서 싹 지우고 다시 올려줘」
 *
 * 통째로 지우면 **직접 쓰신 기록까지 사라진다.** 이관한 것과 직접 쓰신 것이
 * 같은 표에 섞여 있기 때문이다. 그래서 **들어온 날짜별로** 보여드리고
 * 고르시게 한다 — 하루에 수백 건이 몰려 있으면 그날이 이관한 날이다.
 *
 * 지우기는 되돌릴 수 없다. 그래서 **세어보고 → 눈으로 보고 → 지운다.**
 */
export default function WipeBox() {
  const [res, setRes] = useState(null);
  const [done, setDone] = useState(null);
  const [keep, setKeep] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();

  function look() {
    start(async () => { setDone(null); setRes(await countImported()); });
  }
  function wipe(table, label, d) {
    const n = keep ? d.total - d.sameDay : d.total;
    if (!confirm(
      `${label} — ${d.day} 에 들어온 ${n}건을 지웁니다.\n` +
      `수업날짜 ${d.from} ~ ${d.to}\n\n` +
      `되돌릴 수 없습니다. 계속할까요?`
    )) return;
    start(async () => {
      const r = await wipeImported(table, d.day, keep);
      setDone(r);
      if (!r.error) { setRes(await countImported()); router.refresh(); }
    });
  }

  return (
    <div className="card sect sect-bad" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>노션에서 옮긴 것 지우기</h2>
        <span className="hint" style={{ flex: 1, minWidth: 220 }}>
          잘못 들어간 것을 지우고 <b>처음부터 다시</b> 올리실 때 쓰세요.
        </span>
        <button className="btn btn-sm" disabled={pending} onClick={look}>
          {pending ? "세어보는 중…" : "세어보기"}
        </button>
      </div>

      <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
        <b>통째로 지우지 않습니다</b> — 원장님이 직접 쓰신 기록이 같은 표에 섞여
        있으니까요. 대신 <b>들어온 날짜별</b>로 보여드립니다.
        하루에 수백 건이 몰려 있으면 그날이 <b>이관한 날</b>입니다.
        <br />
        직접 쓰신 기록은 <b>수업한 날에</b> 만들어지고, 옮겨온 기록은
        <b> 옮긴 날에 한꺼번에</b> 만들어집니다. 그 차이로 가릅니다.
        <br />
        <b>지우기는 되돌릴 수 없습니다.</b> 세어보고 눈으로 확인한 뒤에 누르세요.
      </p>

      <label className="row" style={{ gap: 6, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span className="hint">
          그날 <b>수업한 날짜로 들어온 줄은 남긴다</b> (직접 쓰셨을 가능성이 높아요)
        </span>
      </label>

      {res?.error && <div className="err" style={{ marginTop: 10 }}>{res.error}</div>}
      {done?.error && <div className="err" style={{ marginTop: 10 }}>{done.error}</div>}
      {done && !done.error && (
        <div className="notice" style={{ marginTop: 10 }}>{done.removed}건 지웠습니다.</div>
      )}

      {res && !res.error && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {res.tables.map((t) => (
            <div className="card card-tight" key={t.table} style={{ padding: "10px 12px" }}>
              <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                <b style={{ fontSize: 12.5 }}>{t.label}</b>
                <span className="hint">모두 {t.total}건</span>
              </div>
              {t.days.length === 0 ? (
                <p className="hint" style={{ margin: "6px 0 0" }}>들어온 것이 없습니다.</p>
              ) : (
                <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                  {t.days.map((d) => {
                    const n = keep ? d.total - d.sameDay : d.total;
                    // **한 날에 몰려 있으면 이관한 날이다.** 직접 쓰신 날은 하루에
                    // 반 하나치(열몇 건)를 넘지 않는다
                    const bulk = d.total - d.sameDay >= 20;
                    return (
                      <div className="unitrow" key={d.day}>
                        <span className={`tag ${bulk ? "tag-amber" : "tag-muted"}`}>
                          {bulk ? "이관한 날" : "직접 쓰신 날"}
                        </span>
                        <b style={{ fontSize: 12.5 }}>{d.day}</b>
                        <span className="hint">{d.total}건</span>
                        {d.sameDay > 0 && (
                          <span className="hint">· 그날 수업 {d.sameDay}건</span>
                        )}
                        <span className="hint" style={{ fontSize: 11.5 }}>
                          · 수업날짜 {d.from} ~ {d.to}
                        </span>
                        <span className="spacer" />
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={pending || n === 0}
                          onClick={() => wipe(t.table, t.label, d)}
                        >
                          {n}건 지우기
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
