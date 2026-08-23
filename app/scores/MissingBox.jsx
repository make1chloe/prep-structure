"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markNoExam, markNoExamMany } from "./actions";
import { shortName } from "@/lib/schoolName";

/**
 * **성적 미입력** — 그리고 그중 「안 본 것」 을 치우는 자리.
 *
 * 원장님 (2026-08-08)
 *   「시험없음 체크박스도 추가해줘. 없을 때가 있어」
 *   「중1학년 1학기는 시험이 없고 중3학년 2학기도 시험 한 번밖에 안 봐.
 *     고3도. 이걸 어떻게 체크해야 할까」
 *
 * ── 왜 두 단계인가 ────────────────────────────────────────
 *
 * 안 본 까닭은 두 갈래다.
 *
 *   · **아이 사정** — 그날 아팠다 · 시험 뒤에 전학 왔다
 *   · **학년 사정** — 중1 1학기(자유학년제) · 중3 2학기 · 고3
 *
 * 아이 사정은 한 명이라 하나씩 누르면 되지만, 학년 사정은 그 학년 전부다.
 * 열댓 번 눌러야 하는 단추는 안 눌리고, 안 눌린 배지는 그대로 남아
 * **배경이 된다.** 그때부터는 진짜 빠진 성적도 안 보인다.
 *
 * 그래서 목록을 **회차 · 학교 · 학년**으로 묶고, 묶음마다 「이 학년 안 봄」
 * 을 둔다 — 중1 1학기도, 고3도 한 번이면 끝난다.
 *
 * ── 학년 규칙을 못 박지 않는 까닭 ──────────────────────────
 *
 * 「중1 1학기는 시험 없음」 을 코드에 적어둘 수도 있다. 그러면 자유학년제를
 * 안 하는 학교, 올해부터 바뀐 학교에서 조용히 틀린다 — 그리고 화면에는
 * 고칠 자리가 없다. 나이스가 알려준 회차는 그대로 두고 **안 본 것만
 * 지워나가는** 쪽이 어느 해에도 맞다.
 */
export default function MissingBox({ rows = [] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [gone, setGone] = useState(() => new Set());   // 방금 치운 것 (새로고침 전까지)

  const left = rows.filter((m) => !gone.has(`${m.studentId}|${m.examId}`));
  if (!left.length) return null;

  /** 회차 · 학교 · 학년으로 묶는다 — 「안 봄」 은 대개 이 단위로 일어난다 */
  const groups = [];
  const at = new Map();
  left.forEach((m) => {
    const key = `${m.examId}|${m.school}|${m.studentGrade || ""}`;
    if (!at.has(key)) {
      at.set(key, groups.length);
      groups.push({ key, examId: m.examId, examName: m.examName, school: m.school, grade: m.studentGrade || "", on: m.on, list: [] });
    }
    groups[at.get(key)].list.push(m);
  });

  const forget = (pairs) =>
    setGone((old) => {
      const next = new Set(old);
      pairs.forEach((p) => next.add(p));
      return next;
    });

  const one = (m) => {
    setMsg("");
    start(async () => {
      const r = await markNoExam(m.studentId, m.examId, true);
      if (r?.error) return setMsg(r.error);
      forget([`${m.studentId}|${m.examId}`]);
      // 새로고침 안 함 (원장님 2026-08-23) — 누른 줄은 이미 걷혔고,
      // 서버를 다시 불러도 화면이 바뀌지 않는다 (그동안 단추만 잠긴다)
    });
  };

  const whole = (g) => {
    setMsg("");
    // **되돌리기 어려운 일은 한 번 묻는다** — 열댓 명이 한꺼번에 사라진다
    if (!confirm(`${g.school} ${g.grade || ""} ${g.list.length}명을 「${g.examName} 시험 없음」 으로 둘까요?`)) return;
    start(async () => {
      const r = await markNoExamMany(g.list.map((m) => m.studentId), g.examId);
      if (r?.error) return setMsg(r.error);
      forget(g.list.map((m) => `${m.studentId}|${m.examId}`));
      router.refresh();
    });
  };

  return (
    <div className="card sect sect-warn" style={{ marginBottom: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {/* **제목은 명사로** (원장님, 2026-08-08 — 「제목은 명사화해줘, 성적미입력」) */}
        <b style={{ fontSize: 15 }}>성적 미입력</b>
        <span className="tag tag-amber">{left.length}건</span>
        <span className="hint" style={{ fontSize: 12.5 }}>
          이름을 누르면 <b>그 학생 · 그 시험</b>이 채워진 채로 입력칸이 열립니다.
          안 본 시험은 <b>시험 없음</b>으로 치우세요 — 0점으로 넣지 마세요.
        </span>
      </div>

      {msg && <div className="notice" style={{ marginTop: 8 }}>{msg}</div>}

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map((g) => (
          <div key={g.key}>
            <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>
                {shortName(g.school)} {g.grade ? `${g.grade}학년` : ""}
              </b>
              <span className="hint" style={{ fontSize: 12.5 }}>{g.examName} · {g.on}</span>
              <span className="hint" style={{ fontSize: 12.5 }}>{g.list.length}명</span>
              {/* **학년 통째로** — 중1 1학기 · 중3 2학기 · 고3 은 한 번이면 끝난다 */}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => whole(g)}
                disabled={busy}
                title="이 학년은 이 시험을 안 봤습니다 — 재촉에서 뺍니다"
              >
                이 학년 시험 없음
              </button>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              {g.list.map((m) => (
                <span
                  key={`${m.studentId}|${m.examId}`}
                  className="row"
                  style={{ gap: 0, alignItems: "stretch" }}
                >
                  <Link
                    href={`/scores?s=${m.studentId}&e=${m.examId}`}
                    className="btn btn-sm"
                    style={{ borderColor: "var(--amber)", borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                  >
                    <b style={{ fontSize: 14 }}>{m.name}</b>
                  </Link>
                  {/* 아이 하나 — 병결 · 전학 */}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => one(m)}
                    disabled={busy}
                    title={`${m.name} 은(는) 이 시험을 안 봤습니다`}
                    style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: "0 7px" }}
                  >
                    시험 없음
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
