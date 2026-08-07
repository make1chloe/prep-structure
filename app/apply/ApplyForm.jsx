"use client";

import { useState, useTransition } from "react";
import { submitApply } from "./actions";
import { SLOTS, slotLabel, SLOT_NOTES, PRIVACY, SOURCES } from "@/lib/applySlots";

/**
 * **로그인 없이 학부모가 채우는 상담 신청 양식.**
 *
 * ── 2026-08-06 에 크게 고쳤다 (원장님) ────────────────────
 *
 * **1. 희망 시간은 날짜·시각으로 안 받는다.**
 *    「구체적으로 적으면 맞춰줄 수가 없어」 — 날짜 칸을 두면 학부모는 하루를
 *    찍어야 하고, 그 하루에 못 맞추면 원장님이 다시 전화하시게 된다.
 *    양식을 받은 보람이 없다. 그래서 **글로** 받는다.
 *
 * **2. 희망 요일 대신 실제 시간표를 고르게 한다 (중복 가능).**
 *    「월·수요일이면 좋겠어요」 를 받아봐야 그 시간에 반이 없으면 소용없다.
 *    있는 시간표를 보여드리면 그 자리에서 맞는지 아신다.
 *
 * **3. 학생 정보는 전부 필수다.** 특히 **학생 연락처** — 레벨테스트 아이디를
 *    그 번호로 만든다. 안 받으면 테스트 날 그 자리에서 다시 여쭤야 한다.
 *
 * **4. 「선택」 이라는 말을 안 쓴다** (원장님). 안 적어도 되는 칸이라고
 *    적어두면 반이 비어서 온다. 꼭 필요한 것만 묻고, 물었으면 받는다.
 */
export default function ApplyForm({ token = "", prefill = {} }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [slots, setSlots] = useState([]);
  const [source, setSource] = useState("");
  const [agree, setAgree] = useState(false);
  const sourceWhy = SOURCES.find((s) => s.key === source)?.why || null;
  const [pending, startTransition] = useTransition();

  function toggle(key) {
    setSlots((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  if (done) {
    return (
      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>접수되었습니다 🙂</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
          적어주신 시간을 보고 학원에서 곧 연락드리겠습니다.
          <br />
          급한 문의는 학원으로 전화 주세요.
        </p>
      </div>
    );
  }

  return (
    <form
      className="stack"
      style={{ gap: 10 }}
      action={(fd) =>
        startTransition(async () => {
          setErr(null);
          slots.forEach((k) => fd.append("want_slots", k));
          const res = await submitApply(fd);
          if (res?.error) {
            setErr(res.error);
            return;
          }
          setDone(true);
        })
      }
    >
      <input type="hidden" name="token" value={token} />

      <div className="card">
        <h2 className="secthead">학생 정보</h2>
        <div className="grid2">
          <div className="field">
            <label className="label">학생 이름 *</label>
            <input className="input" name="name" required defaultValue={prefill.name || ""} />
          </div>
          <div className="field">
            <label className="label">학부모 연락처 *</label>
            <input className="input" name="phone" required placeholder="010-0000-0000"
              defaultValue={prefill.phone || ""} />
          </div>
          <div className="field">
            <label className="label">학교 *</label>
            <input className="input" name="school" required defaultValue={prefill.school || ""} />
          </div>
          <div className="field">
            <label className="label">학년 *</label>
            <input className="input" name="grade" required placeholder="중2"
              defaultValue={prefill.grade || ""} />
          </div>
        </div>
        {/* **학생 연락처로 레벨테스트 아이디를 만든다.** 왜 필요한지 적어두지
            않으면 「아이 번호는 왜?」 하고 비워두신다 */}
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">학생 연락처 * (레벨테스트 아이디 생성)</label>
          <input className="input" name="student_phone" required placeholder="010-0000-0000" />
          <p className="hint" style={{ marginTop: 4 }}>
            이 번호로 학생 아이디를 만들어 테스트 결과와 학습 기록을 보여드립니다.
          </p>
        </div>
        {/* **재원생 소개는 이름이 붙어야 쓸모가 있다** — 누가 소개했는지
            알아야 그 댁에 인사를 드린다. 안 적으셔도 넘어간다 */}
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">클로이영어를 어떻게 알게 되셨나요?</label>
          <select
            className="input" name="source" value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">—</option>
            {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.key}</option>)}
          </select>
          {sourceWhy && (
            <input
              className="input" name="source_why" placeholder={sourceWhy}
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      </div>

      {/* ---- 희망 시간표 ---------------------------------------------- */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>희망 시간표</h2>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          가능한 시간표를 <b>모두</b> 골라주세요.
        </p>
        <div className="stack" style={{ gap: 6 }}>
          {SLOTS.map((s) => {
            const on = slots.includes(s.key);
            return (
              <label
                key={s.key}
                className={`card card-tight ${on ? "pick-on" : ""}`}
                style={{
                  padding: "10px 12px", cursor: "pointer", display: "flex",
                  alignItems: "center", gap: 10, margin: 0,
                  borderColor: on ? "var(--brand)" : undefined,
                }}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(s.key)} />
                <span style={{ fontSize: 13.5 }}>
                  <b>{s.group}</b> {s.days} <b>{s.time}</b>
                </span>
              </label>
            );
          })}
        </div>
        {/* **고르기 전에 알아야 하는 것.** 나중에 알면 「그런 말 없었잖아요」 가 된다 */}
        <div className="notice" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.7 }}>
          {SLOT_NOTES.map((n) => <div key={n}>· {n}</div>)}
        </div>
      </div>

      {/* ---- 레벨테스트 · 방문상담 ------------------------------------ */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
          레벨테스트 · 부모님 방문상담
        </h2>
        {/* **언제가 안 되는지를 먼저 말씀드린다** (원장님, 2026-08-07).
            월~목 오후는 수업이 이어져 있어 부모님을 뵐 수가 없다. 이걸 안
            적으면 그 시간을 적어 보내시고, 우리는 다시 여쭤야 한다 —
            양식을 받은 보람이 없어진다. */}
        <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.7 }}>
          학생은 학원에 와서 <b>40~60분 정도 테스트</b>를 보고, 부모님과는 그 결과를 놓고
          <b> 따로 상담</b>해드립니다. 수업이 이어져 있어 두 가지를 연달아 하기 어려워
          날을 나눠 잡습니다.
          <br />
          <b>월~목 오후 2시~10시에는 부모님 방문상담이 어렵습니다.</b> 편하신 때를
          넉넉하게 적어주세요.
        </p>
        <div className="field">
          <label className="label">레벨테스트 가능한 때</label>
          <textarea
            className="input" name="test_want_text" rows={2}
            placeholder="예: 평일 오후 4시 이후면 아무때나 / 토요일 오전"
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">부모님 방문상담 가능한 때</label>
          <textarea
            className="input" name="visit_want_text" rows={2}
            placeholder="예: 금요일 오전이면 언제든 / 토요일 낮"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="secthead">더 알려주실 것</h2>
        <div className="field">
          <label className="label">지금까지의 영어 학습</label>
          <input className="input" name="prev_academy" placeholder="예: OO학원 2년, 지금은 쉬는 중" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">바라는 점 · 궁금한 점</label>
          <textarea className="input" name="goal" rows={3} />
        </div>
      </div>

      {/* ---- 개인정보 수집·이용 동의 ---------------------------------- */}
      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>{PRIVACY.title}</h2>
        <div className="stack" style={{ gap: 6 }}>
          {PRIVACY.rows.map((r) => (
            <div key={r.head} style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <b>{r.head}</b>
              <br />
              <span className="muted">{r.body}</span>
            </div>
          ))}
        </div>
        <label
          className="card card-tight"
          style={{
            marginTop: 10, padding: "10px 12px", cursor: "pointer", display: "flex",
            alignItems: "center", gap: 10,
            borderColor: agree ? "var(--brand)" : undefined,
          }}
        >
          <input
            type="checkbox" name="privacy_agree" checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>{PRIVACY.label}</span>
        </label>
      </div>

      {err && <div className="err">{err}</div>}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "보내는 중…" : "신청서 보내기"}
      </button>
    </form>
  );
}
