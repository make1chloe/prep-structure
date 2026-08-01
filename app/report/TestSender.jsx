"use client";

import { useEffect, useState, useTransition } from "react";
import { previewTest, sendTest, sendTestAlimtalk } from "./testActions";
import { TEST_KINDS } from "@/lib/sampleReport";

const STATUS_LABEL = { prospect: "예비", enrolled: "재원", paused: "휴원", withdrawn: "퇴원" };

/** 이름에 '테스트' 가 든 학생을 맨 앞으로 — 매번 찾아 내려가지 않게 */
function byTestFirst(list) {
  const t = (x) => (/테스트|test/i.test(x.name) ? 0 : 1);
  return [...list].sort((a, b) => t(a) - t(b) || a.name.localeCompare(b.name, "ko"));
}

/**
 * 시험 삼아 보내보기.
 *
 * 진짜로 나가기 전에 **무엇이 어떻게 보이는지** 확인하는 자리다.
 * 줄바꿈이 깨지는지, 너무 긴지, 인삿말이 두 번 들어가는지는 받아봐야 안다.
 *
 * 두 가지를 지킨다.
 *   · **아무 기록도 건드리지 않는다** — 보냄 표시도, 발송 이력도 남기지 않는다
 *   · **받는 번호를 직접 고칠 수 있다** — 원장님 본인 번호로 받아보는 게 제일 확실하다
 */
export default function TestSender({ students = [], templates = [], mode = "copy", date }) {
  const [studentId, setStudentId] = useState(byTestFirst(students)[0]?.id || "");
  const [kind, setKind] = useState("report");
  const [tplId, setTplId] = useState("");
  const [to, setTo] = useState("");
  const [pre, setPre] = useState(null);
  const [res, setRes] = useState(null);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  const student = students.find((s) => s.id === studentId) || null;
  const alimtalkTpls = templates.filter((t) => t.alimtalk_id);

  // 학생이나 종류를 바꾸면 미리보기를 다시 만든다
  useEffect(() => {
    if (!studentId) return undefined;
    let alive = true;
    setRes(null);
    previewTest(studentId, kind, date).then((r) => {
      if (alive) setPre(r);
    });
    return () => {
      alive = false;
    };
  }, [studentId, kind, date]);

  function send() {
    startTransition(async () => {
      const r = await sendTest(studentId, kind, date, to);
      setRes(r);
    });
  }

  function sendKakao() {
    startTransition(async () => {
      const r = await sendTestAlimtalk(studentId, tplId, to);
      setRes(r);
    });
  }

  const kw = q.trim().toLowerCase();
  const sorted = byTestFirst(students);
  const shown = kw
    ? sorted.filter((s) => s.name.toLowerCase().includes(kw)).slice(0, 30)
    : sorted.slice(0, 24);

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      {mode === "copy" && (
        <div className="notice">
          지금은 <b>직접 발송</b> 모드예요. 여기서 눌러도 <b>실제로 문자가 나가지 않고</b>,
          본문만 확인됩니다. 진짜로 받아보시려면 설정 → 발송·연동에서 문자 발송을 켜세요.
        </div>
      )}

      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>누구에게</b>
          <span className="hint" style={{ flex: 1, minWidth: 220 }}>
            재원생에 <b>테스트 학생</b>을 하나 만들어 두고, 학부모 번호에 원장님 번호를
            넣어두시면 편합니다. 상태는 <b>재원 말고 '예비'</b>로 두세요 — 재원으로 두면
            오늘 수업·월말 리포트·수강료에 계속 끼어듭니다. 여기서는 상태와 상관없이 고를 수 있어요.
            <b>보낸 것으로 표시되지 않고</b> 발송 이력에도 안 남습니다.
          </span>
        </div>

        <input
          className="input input-sm"
          style={{ width: 180, marginTop: 8 }}
          placeholder="학생 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {shown.map((s) => (
            <button
              key={s.id}
              className={`hwchip ${studentId === s.id ? "hw-next" : ""}`}
              onClick={() => setStudentId(s.id)}
            >
              {studentId === s.id && <b>＋</b>} {s.name}
            </button>
          ))}
          {shown.length === 0 && <span className="hint">맞는 학생이 없어요.</span>}
        </div>

        {student && (
          <p className="hint" style={{ marginTop: 8 }}>
            {student.name}
            <span className="tag tag-muted" style={{ marginLeft: 6 }}>{STATUS_LABEL[student.status] || student.status}</span>
            {" · "}학부모 {student.parent_phone || "번호 없음"}
            {student.student_phone ? ` · 학생 ${student.student_phone}` : ""}
          </p>
        )}

        <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
          <span className="hint">받는 번호</span>
          <input
            className="input input-sm"
            style={{ width: 170 }}
            placeholder={pre?.to || "비우면 위 번호로"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <span className="hint">원장님 번호를 적으면 그리로 옵니다</span>
        </div>
      </div>

      <div className="card">
        <b style={{ fontSize: 14 }}>무엇을</b>
        <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TEST_KINDS.map((k) => (
            <button
              key={k.key}
              className={`btn btn-sm ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setKind(k.key)}
            >
              {k.label}
              <span className="hint" style={{ marginLeft: 4, fontSize: 11 }}>{k.who}</span>
            </button>
          ))}
        </div>

        {pre?.error && <div className="err" style={{ marginTop: 10 }}>{pre.error}</div>}

        {pre && !pre.error && (
          <>
            <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "baseline" }}>
              <span className="tag tag-muted">{pre.text.length}자</span>
              <span className={`tag ${pre.real ? "tag-mint" : "tag-amber"}`}>
                {pre.real ? "오늘 실제 기록으로" : "예시 기록으로"}
              </span>
              {!pre.real && (
                <span className="hint">
                  이 학생은 오늘 수업 기록이 없어서, 실제와 같은 모양의 예시로 만들었어요.
                </span>
              )}
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.55,
                background: "var(--surface-2)", padding: 12, borderRadius: 10,
                marginTop: 8, maxHeight: 320, overflowY: "auto",
              }}
            >
              {pre.text}
            </pre>

            <button
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={pending || !studentId}
              style={{ marginTop: 8 }}
            >
              {pending ? "보내는 중…" : "보내보기"}
            </button>
          </>
        )}
      </div>

      {/* 알림톡은 문구마다 템플릿이 다르다 — 따로 골라 보낸다 */}
      {alimtalkTpls.length > 0 && (
        <div className="card">
          <b style={{ fontSize: 14 }}>알림톡</b>
          <p className="hint" style={{ margin: "4px 0 8px" }}>
            카카오 템플릿이 연결된 문구만 보입니다. 템플릿이 심사에 통과했는지,
            변수 자리가 제대로 채워지는지 여기서 확인하세요.
          </p>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="input input-sm"
              style={{ width: 220 }}
              value={tplId}
              onChange={(e) => setTplId(e.target.value)}
            >
              <option value="">문구 고르기</option>
              {alimtalkTpls.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={sendKakao}
              disabled={pending || !tplId || !studentId}
            >
              알림톡으로 보내보기
            </button>
          </div>
        </div>
      )}

      {res && (
        <div className="card" style={{ borderColor: res.error || !res.ok ? "var(--red)" : "var(--mint)" }}>
          {res.error ? (
            <div className="err">{res.error}</div>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              <b style={{ fontSize: 14 }}>{res.ok ? "보냈어요" : "못 보냈어요"}</b>
              <span className="hint">
                통로: {res.channel === "sms" ? "문자(솔라피)" : res.channel === "webhook" ? "웹훅" : res.channel === "push" ? "앱 알림" : "직접 발송(기록만)"}
                {res.to ? ` · ${res.to}` : ""}
              </span>
              {/* 왜 안 됐는지를 그대로 보여준다. "실패" 만으로는 고칠 수가 없다 */}
              <span style={{ fontSize: 12.5 }}>{res.detail}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
