"use client";

import { useState, useTransition } from "react";
import { submitApply } from "./actions";
import { SLOTS, slotLabel, SLOT_NOTES, PRIVACY, SOURCES } from "@/lib/applySlots";
import { SchoolField, GradeField } from "@/components/PickField";

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
export default function ApplyForm({ token = "", prefill = {}, schools = [] }) {
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
            {/* **여기서 갈라지면 뒤에서 다 갈라진다** (0114). 학부모가 적으신
                「인천신정중학교」 와 표의 「신정중」 이 다른 학교가 되면, 그
                아이의 시험 일정도 시험범위도 성적도 따로 논다. 골라 넣게 하되
                **막지는 않는다** — 표에 없는 학교는 그냥 적으시면 된다 */}
            <SchoolField className="input" schools={schools} required
              defaultValue={prefill.school || ""} />
          </div>
          <div className="field">
            <label className="label">학년 *</label>
            <GradeField className="input" required defaultValue={prefill.grade || ""} />
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
        {/* **둘이 되는 때가 다르다** (원장님, 2026-08-07).
            수업 중에도 아이는 테스트를 볼 수 있지만, 부모님을 마주 앉아
            뵐 수는 없다. 「월~목 오후는 안 됩니다」 로만 적으면 테스트까지
            안 되는 줄 아시고 주말만 적어 보내신다. 한 문장에 갈라 적는다. */}
        <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.7 }}>
          학생은 학원에 와서 <b>테스트</b>를 보고, 부모님과는 그 결과를 놓고
          <b> 따로 상담</b>해드립니다. 수업이 이어져 있어 두 가지를 연달아 하기 어려워
          날을 나눠 잡습니다.
          <br />
          <b>월~목 오후 2시~10시에는 레벨테스트는 가능하고, 부모님 방문상담은 어렵습니다.</b>{" "}
          편하신 때를 넉넉하게 적어주세요.
        </p>
        {/* **얼마나 걸리는지를 칸 이름에 적는다.** 안내문에 적어두면 아래로
            내려와 적으실 때쯤 잊으신다 — 20분이면 짧게 낼 수 있는 시간도
            적어주시게 된다 */}
        <div className="field">
          <label className="label">레벨테스트 가능한 요일과 시간 (월~금, 40~60분 가량 소요)</label>
          <textarea
            className="input" name="test_want_text" rows={2}
            placeholder="예: 월수 4시-6시, 화목 7:30 이후"
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">부모님 방문상담 가능한 요일과 시간 (월~금, 20분가량 소요)</label>
          <textarea
            className="input" name="visit_want_text" rows={2}
            placeholder="예: 월, 수 2시 이전, 금 5시 이후"
          />
        </div>
      </div>

      {/* **두루뭉술한 칸 이름은 빈 채로 온다** (원장님, 2026-08-07).
          「더 알려주실 것」 이라고만 두면 안 적어도 되는 칸으로 읽힌다.
          무엇을 적어야 하는지 이름에 그대로 적으면 적으신다 — 교재와
          반 이름을 알면 상담 자리에서 되묻지 않아도 되고, 그만큼
          이야기가 깊어진다 */}
      <div className="card">
        <h2 className="secthead">학습 경험</h2>
        <div className="field">
          <label className="label">
            사용했던 교재(영역별), 학원경력
            <br />
            <span className="hint">학원명, 반까지 적어주시면 더 자세히 상담 가능합니다</span>
          </label>
          <textarea
            className="input" name="prev_academy" rows={3}
            placeholder="예: 문법 그래머인유즈 / 독해 리딩튜터, OO학원 2년(중등 심화반)"
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">개선하고 싶은 점과 궁금한 점을 적어주세요.</label>
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
