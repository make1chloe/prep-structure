"use client";
/**
 * **등원·하원 카드** — 아이가 제 손으로 찍는 자리.
 *
 * 원장님 2026-09-02: 「등원하면 로그인해서 어플에서 출결 찍어야 해. **학원 아이피로 접속해야 하는 조건**이 있고.」
 * 원장님 2026-09-03 ⑫: 「**학생에게 출결하면서 바로 연달아 선택하게 해**」 (반이 둘인 날)
 * 원장님 2026-09-03 ⑩: 하원도 **등원과 같은 자리**에 날짜별로
 *
 * ⚠️ **여기에 판단을 한 줄도 안 적는다.** 지각인가·몇 분인가·반이 둘인가·하원을 찍어도 되나는
 *    전부 `lib/arrival.js` 가 정하고 `/api/arrival` 이 그대로 내려준다. 이 파일은 **그리기만** 한다.
 *
 * ⚠️ **왜 서버가 아니라 여기서 부르나** — 관문(학원 회선)은 **요청이 어느 주소에서 왔는지**를 본다.
 *    그 주소는 `/api/arrival` 이 그 요청의 머리에서 읽는다. 화면이 미리 받아 둘 수가 없다.
 *
 * ⚠️ 대전제-10 — `alert`/`confirm` 안 쓴다. 안 되는 까닭은 **카드 안에** 글로 뜬다.
 * ⚠️ 표-10 — 찍은 시각은 **서버가 정한다.** 여기서 시각을 만들어 보내지 않는다.
 */
import { useCallback, useEffect, useState } from "react";

const 문 = "/api/arrival";

export default function 등원카드({ 저장중 = false }) {
  const [답, set답] = useState(null);      // { ok, gate, view, can } — 문이 준 그대로
  const [고른반, set고른반] = useState(null);
  const [말, set말] = useState(null);
  const [도는중, set도는중] = useState(true);

  /** 문에 물어본다. ⚠️ 실패를 조용히 삼키지 않는다 — 못 읽었으면 못 읽었다고 그린다 */
  const 읽기 = useCallback(async (classId = null) => {
    set도는중(true);
    try {
      const r = await fetch(문 + (classId ? `?class=${encodeURIComponent(classId)}` : ""),
        { cache: "no-store" });
      const j = await r.json().catch(() => null);
      set답(j ?? { ok: false, msg: "답을 못 읽었습니다" });
    } catch (e) {
      set답({ ok: false, msg: `문을 못 열었습니다 — ${String(e?.message ?? e).slice(0, 120)}` });
    } finally { set도는중(false); }
  }, []);

  useEffect(() => { 읽기(null); }, [읽기]);

  /** 한 번 누른다 — 걸음이든 하원이든 **답을 그대로** 받아 다시 그린다 */
  async function 누르기(몸) {
    set말(null); set도는중(true);
    try {
      const r = await fetch(문, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(몸) });
      const j = await r.json().catch(() => null);
      set말(j?.msg ?? (j?.ok ? "찍었습니다" : "못 찍었습니다"));
      // ⚠️ 「반을 고르라」고 되물어 오면 **다시 찍을 필요가 없다** — 고르기만 하면 판이 선다
      if (j?.why === "pick-class") set답((전) => ({ ...(전 ?? {}), view: j.view, can: 전?.can }));
      else await 읽기(고른반);
    } catch (e) {
      set말(`보내지 못했습니다 — ${String(e?.message ?? e).slice(0, 120)}`);
    } finally { set도는중(false); }
  }

  const 보기 = 답?.view ?? null;
  const 관문 = 답?.gate ?? null;
  const 바쁨 = 도는중 || 저장중;

  return (
    <>
      <div className="me-cardhd">
        <span className="me-ttl">등원 · 하원</span>
        {보기?.arrivedAt && <span className="pill pillok num">등원 {보기.arrivedAt}</span>}
        {보기?.leftAt && <span className="pill pillinfo num">하원 {보기.leftAt}</span>}
        {바쁨 && <span className="chip">읽는 중</span>}
      </div>

      {/* ── 못 그리는 까닭을 먼저 말한다 (대전제-0) ── */}
      {답 && !답.ok && !보기 && <p className="sunk">{답.msg ?? "등원 화면을 못 열었습니다."}</p>}

      {보기 && (
        <>
          {/* ⚠️ 관문이 막았으면 **왜 막혔는지**를 그대로 그린다. 단추만 안 눌리는 것이 제일 나쁘다 */}
          {관문 && !관문.ok && <p className="me-flag">{관문.msg}</p>}

          {/* ── 반이 둘인 날 — **찍으면서 바로 연달아 고른다**(원장님 ⑫) ── */}
          {보기.mustPick && (
            <div className="me-block">
              <p className="me-sub">오늘은 반이 둘입니다 — 어느 반에 왔는지 골라 주세요.</p>
              <div className="me-list">
                {(보기.all ?? []).map((c) => (
                  <button key={c.classId} type="button"
                    className={"me-mk" + (고른반 === c.classId ? " is-sel" : "")}
                    disabled={바쁨}
                    onClick={() => { set고른반(c.classId); 읽기(c.classId); }}>
                    {c.startTime ?? "시각 모름"}{c.nickname ? ` · ${c.nickname}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 등원 세 걸음 — **한 번에 하나만 연다** (연달아 세 번 눌러 버리는 것을 막는다) ── */}
          <div className="me-list">
            {(보기.steps ?? []).map((s) => (
              <div className="me-item" key={s.step}>
                <span className="me-name">{s.label}</span>
                {s.done
                  ? <span className="pill pillok num">{s.at}</span>
                  : 보기.next?.step === s.step
                    ? <button type="button" className="me-mk" disabled={바쁨 || !(관문?.ok)}
                        onClick={() => 누르기({ step: s.step, classId: 고른반 })}>눌러요</button>
                    : <span className="me-sub">앞엣것부터</span>}
              </div>
            ))}
          </div>

          {/* ⚠️ 세어 나온 값이다 — 아무 데도 저장 안 한다(원칙-5) */}
          {보기.late && (
            <p className="me-sub">
              {보기.late.attend === "late"
                ? `지각 ${보기.late.minutes}분`
                : (보기.late.sure ? "정시에 왔어요" : "몇 분 늦었는지는 못 셌어요")}
              {보기.late.why ? ` — ${보기.late.why}` : ""}
            </p>
          )}

          {/* ── 하원 (0083) — **등원과 같은 자리**. 등원을 찍은 날에만 뜬다 ── */}
          <div className="me-block">
            {보기.leftAt
              ? <p className="me-sub">오늘은 <b className="num">{보기.leftAt}</b> 에 집에 갔다고 남았습니다.</p>
              : 보기.canLeave
                ? <button type="button" className="me-mk" disabled={바쁨 || !(관문?.ok)}
                    onClick={() => 누르기({ act: "leave", classId: 고른반 })}>집에 가요</button>
                : <p className="me-sub">등원을 먼저 찍으면 「집에 가요」가 열립니다.</p>}
          </div>

          {말 && <p className="me-flag" role="status">{말}</p>}
        </>
      )}
    </>
  );
}
