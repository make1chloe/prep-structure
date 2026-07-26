"use client";

import { useState, useTransition } from "react";
import { submitApply } from "./actions";

const SOURCES = ["블로그", "지인 소개", "전단", "인터넷 검색", "지나가다 보고", "기타"];

export default function ApplyForm({ token = "", prefill = {} }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800 }}>접수되었습니다 🙂</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
          적어주신 일정을 확인하고 학원에서 곧 연락드리겠습니다.
          <br />
          급한 문의는 학원으로 전화 주세요.
        </p>
      </div>
    );
  }

  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      action={(fd) =>
        startTransition(async () => {
          setErr(null);
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
        <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>학생 정보</h2>
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
            <label className="label">학교</label>
            <input className="input" name="school" defaultValue={prefill.school || ""} />
          </div>
          <div className="field">
            <label className="label">학년</label>
            <input className="input" name="grade" placeholder="중2" defaultValue={prefill.grade || ""} />
          </div>
          <div className="field">
            <label className="label">학생 연락처 (선택)</label>
            <input className="input" name="student_phone" />
          </div>
          <div className="field">
            <label className="label">저희 학원을 어떻게 아셨나요?</label>
            <select className="input" name="source" defaultValue="">
              <option value="">선택</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학생 레벨테스트</h2>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          학생이 학원에 와서 40분 정도 테스트를 봅니다. 원하시는 시간을 적어주세요.
        </p>
        <div className="grid2">
          <div className="field">
            <label className="label">희망 날짜</label>
            <input className="input" type="date" name="test_want_on" />
          </div>
          <div className="field">
            <label className="label">희망 시간</label>
            <input className="input" type="time" name="test_want_at" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학부모 상담</h2>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          테스트 결과를 보며 상담해드립니다. 학생 테스트와 <b>다른 날</b>도 괜찮습니다.
        </p>
        <div className="grid2">
          <div className="field">
            <label className="label">희망 날짜</label>
            <input className="input" type="date" name="visit_on" />
          </div>
          <div className="field">
            <label className="label">희망 시간</label>
            <input className="input" type="time" name="visit_at" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">다른 가능한 시간 (선택)</label>
          <input className="input" name="visit_alt" placeholder="예: 평일 오전이면 아무때나 괜찮아요" />
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>수업 관련</h2>
        <div className="field">
          <label className="label">희망 요일</label>
          <input className="input" name="want_days_text" placeholder="예: 월·수 또는 화·목" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">희망 시간대</label>
          <input className="input" name="want_time" placeholder="예: 7시 이후" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">지금까지의 영어 학습 (선택)</label>
          <input className="input" name="prev_academy" placeholder="예: OO학원 2년, 현재는 쉬는 중" />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">바라는 점 · 궁금한 점 (선택)</label>
          <textarea className="input" name="goal" rows={3} />
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "보내는 중…" : "신청서 보내기"}
      </button>
      <p className="hint" style={{ textAlign: "center" }}>
        적어주신 정보는 상담 목적으로만 사용합니다.
      </p>
    </form>
  );
}
