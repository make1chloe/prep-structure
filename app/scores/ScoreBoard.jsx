"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScore, removeScores, addWrong, removeWrongs, listWrongs, saveFormLinks } from "./actions";
import { KINDS, KIND_LABEL, summary, byKind, trendOf, gradeByCuts, findExam, cutsFor } from "@/lib/scores";
import { useBulk, BulkBar } from "@/components/Bulk";

const EMPTY = {
  kind: "school",
  taken_on: "",
  term: "",
  subject: "영어",
  raw_score: "",
  full_score: "100",
  grade: "",
  percentile: "",
  rank_in: "",
  rank_of: "",
  school: "",
  cuts: "",
  note: "",
};

export default function ScoreBoard({ students = [], scores = [], exams = [], pick = null, forms = {}, canEdit = false }) {
  const [sel, setSel] = useState(pick || students[0]?.id || "");
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [openId, setOpenId] = useState(null);      // 틀린 문제를 연 성적
  const [wrongs, setWrongs] = useState([]);
  const [w, setW] = useState({ question: "", topic: "", reason: "" });
  const [linkBox, setLinkBox] = useState(false);
  const [links, setLinks] = useState({
    school: forms.school || "",
    mock: forms.mock || "",
    unit: forms.unit || "",
  });
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const student = students.find((s) => s.id === sel) || null;
  const mine = scores.filter((s) => s.student_id === sel);
  const groups = byKind(mine);
  const bulk = useBulk(mine);

  const kw = q.trim().toLowerCase();
  const shownStudents = kw
    ? students.filter((s) => s.name.toLowerCase().includes(kw)).slice(0, 40)
    : students.filter((s) => s.status === "enrolled").slice(0, 40);

  function run(fn, after) {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) alert(r.error);
      else after?.(r);
      router.refresh();
    });
  }

  function save() {
    run(
      () => saveScore({ ...form, id: editId, studentId: sel }),
      () => {
        setForm(EMPTY);
        setEditId(null);
      }
    );
  }

  function startEdit(s) {
    setEditId(s.id);
    setForm({
      kind: s.kind || "school",
      taken_on: s.taken_on || "",
      term: s.term || "",
      subject: s.subject || "영어",
      raw_score: s.raw_score ?? "",
      full_score: s.full_score ?? "100",
      grade: s.grade ?? "",
      percentile: s.percentile ?? "",
      rank_in: s.rank_in ?? "",
      rank_of: s.rank_of ?? "",
      school: s.school || "",
      cuts: (s.cuts || []).join(", "),
      note: s.note || "",
    });
  }

  function openWrongs(s) {
    if (openId === s.id) {
      setOpenId(null);
      return;
    }
    setOpenId(s.id);
    setWrongs([]);
    listWrongs(s.id).then((r) => setWrongs(r?.rows || []));
  }

  // 지금 적고 있는 성적은 **어느 회차**인가 — 컷은 거기서 온다
  const formExam = findExam(
    { kind: form.kind, taken_on: form.taken_on, school: form.school },
    exams,
    student
  );
  // 그 컷이면 지금 점수가 몇 등급인지 바로 보인다
  const cutPreview = (() => {
    const { cuts } = cutsFor({ cuts: (form.cuts || "").split(/[,\s/·]+/) }, formExam);
    const g = gradeByCuts(form.raw_score, cuts);
    return g ? `이 컷이면 ${g}등급` : null;
  })();

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      {/* ---- 학생 고르기 ---- */}
      <div className="card card-tight">
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input input-sm"
            style={{ width: 160 }}
            placeholder="학생 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {shownStudents.map((s) => (
            <button
              key={s.id}
              className={`hwchip ${sel === s.id ? "hw-next" : ""}`}
              onClick={() => { setSel(s.id); setEditId(null); setForm(EMPTY); }}
            >
              {sel === s.id && <b>＋</b>} {s.name}
            </button>
          ))}
        </div>
        {student && (
          <div className="row" style={{ marginTop: 6, gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="hint">
              {[student.school, student.grade].filter(Boolean).join(" ")} · 성적 {mine.length}건
            </span>
            <span className="spacer" />
            {/* **리포트로 가는 문.** 이 화면은 넣는 곳이고, 보는 곳은 따로다 —
                상담 중에 펴놓으실 화면이라 넣기 칸이 섞여 있으면 안 된다 */}
            <a className="btn btn-ghost btn-sm" href="/scores/spec">문항표</a>
            <a className="btn btn-ghost btn-sm" href="/scores/analysis">출제분석</a>
            <a className="btn btn-primary btn-sm" href={`/scores/${student.id}`}>
              {student.name} 리포트 보기
            </a>
          </div>
        )}
      </div>

      {/* ---- 학생이 직접 내는 설문지 ---- */}
      <div className="card card-tight">
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13 }}>학생이 직접 내는 설문지</b>
          <span className="hint" style={{ flex: 1, minWidth: 220 }}>
            노션 설문지 주소를 걸어두면 <b>학생 화면에 버튼</b>으로 뜹니다.
            문항은 노션에서 고치세요 — 앱에서 폼을 다시 만들 필요가 없어요.
          </span>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLinkBox(!linkBox)}>
              {linkBox ? "닫기" : "주소 넣기"}
            </button>
          )}
        </div>
        {linkBox && (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {KINDS.map((k) => (
              <div className="row" style={{ gap: 6, alignItems: "center" }} key={k.key}>
                <span className="hint" style={{ minWidth: 62 }}>{k.label}</span>
                <input
                  className="input input-sm"
                  style={{ flex: 1 }}
                  placeholder="https://notion.so/… (설문지 주소)"
                  value={links[k.key]}
                  onChange={(e) => setLinks({ ...links, [k.key]: e.target.value })}
                />
              </div>
            ))}
            <button
              className="btn btn-primary btn-sm"
              style={{ alignSelf: "flex-start" }}
              disabled={pending}
              onClick={() => run(() => saveFormLinks(links), () => setLinkBox(false))}
            >
              저장
            </button>
          </div>
        )}
      </div>

      {/* ---- 넣기 ---- */}
      {student && (
        <div className="card">
          <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>
            {editId ? "성적 고치기" : `${student.name} 성적 넣기`}
          </h2>

          <div className="row" style={{ gap: 4, marginBottom: 8 }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={`btn btn-sm ${form.kind === k.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setForm({ ...form, kind: k.key })}
                title={k.hint}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ width: 150 }}>
              <label className="label">시험 본 날</label>
              <input
                className="input input-sm"
                type="date"
                value={form.taken_on}
                onChange={(e) => setForm({ ...form, taken_on: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 170 }}>
              <label className="label">무슨 시험</label>
              <input
                className="input input-sm"
                placeholder={form.kind === "mock" ? "3월 학력평가" : "1학기 중간고사"}
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 100 }}>
              <label className="label">점수</label>
              <input
                className="input input-sm"
                inputMode="decimal"
                value={form.raw_score}
                onChange={(e) => setForm({ ...form, raw_score: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">만점</label>
              <input
                className="input input-sm"
                inputMode="decimal"
                value={form.full_score}
                onChange={(e) => setForm({ ...form, full_score: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">등급</label>
              <input
                className="input input-sm"
                inputMode="numeric"
                placeholder="1~9"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </div>
            {form.kind === "mock" && (
              <div className="field" style={{ width: 100 }}>
                <label className="label">백분위</label>
                <input
                  className="input input-sm"
                  inputMode="decimal"
                  value={form.percentile}
                  onChange={(e) => setForm({ ...form, percentile: e.target.value })}
                />
              </div>
            )}
            {form.kind === "school" && (
              <>
                <div className="field" style={{ width: 80 }}>
                  <label className="label">석차</label>
                  <input
                    className="input input-sm"
                    inputMode="numeric"
                    value={form.rank_in}
                    onChange={(e) => setForm({ ...form, rank_in: e.target.value })}
                  />
                </div>
                <div className="field" style={{ width: 80 }}>
                  <label className="label">전체</label>
                  <input
                    className="input input-sm"
                    inputMode="numeric"
                    value={form.rank_of}
                    onChange={(e) => setForm({ ...form, rank_of: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          {form.kind === "school" && (
            <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
              <div className="field" style={{ width: 160 }}>
                <label className="label">어느 학교 시험</label>
                <input
                  className="input input-sm"
                  placeholder={student.school || "학교"}
                  value={form.school}
                  onChange={(e) => setForm({ ...form, school: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* 등급컷은 **회차** 것이다 — 여기서 적지 않는다.
              같은 시험을 본 학생이 셋이면 같은 값을 세 번 적게 되고,
              하나만 잘못 치면 그 학생만 등급이 다르게 나온다. */}
          {form.kind !== "unit" && (
            <div className="unitrow" style={{ marginTop: 8 }}>
              {formExam ? (
                <>
                  <span className="tag tag-muted">{formExam.school} {formExam.name || "시험"}</span>
                  {(formExam.cuts || []).length ? (
                    <>
                      <span className="hint">등급컷 {formExam.cuts.join(" · ")}</span>
                      {cutPreview && <span className="tag tag-sky">{cutPreview}</span>}
                    </>
                  ) : (
                    <span className="tag tag-amber">등급컷 아직 없음</span>
                  )}
                  <span className="spacer" />
                  <a className="hint sky" href="/schedule" target="_blank" rel="noreferrer">
                    {(formExam.cuts || []).length ? "컷 고치기" : "컷 적기"} — 학사일정 ›
                  </a>
                </>
              ) : (
                <>
                  <span className="tag tag-amber">이 시험 회차를 못 찾았어요</span>
                  <span className="hint">
                    학사일정에 <b>{form.kind === "mock" ? "전국" : form.school || student.school || "학교"}</b>{" "}
                    시험 기간이 있어야 등급컷을 이어붙일 수 있어요.
                  </span>
                  <div className="field" style={{ flex: 1, minWidth: 180 }}>
                    <label className="label">등급컷 (이 성적에만)</label>
                    <input
                      className="input input-sm"
                      placeholder="90, 84, 77, 70"
                      value={form.cuts}
                      onChange={(e) => setForm({ ...form, cuts: e.target.value })}
                    />
                  </div>
                  {cutPreview && <span className="tag tag-sky">{cutPreview}</span>}
                </>
              )}
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">메모</label>
              <input
                className="input input-sm"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !sel}>
              {pending ? "저장 중…" : editId ? "고치기" : "넣기"}
            </button>
            {editId && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(null); setForm(EMPTY); }}>
                취소
              </button>
            )}
          </div>

          {form.kind === "school" && (
            <p className="hint" style={{ margin: "8px 0 0" }}>
              등급컷은 학교가 시험마다 발표하는 숫자예요. <b>학사일정의 시험 회차</b>에
              한 번만 적어두면 그 시험을 본 학생 전부에게 쓰입니다 — 학생마다 따로 적으면
              같은 시험인데 등급이 달라질 수 있어요. 적어두면 "1등급까지 3점" 이 보입니다.
            </p>
          )}
        </div>
      )}

      {/* ---- 목록 ---- */}
      {student && mine.length > 0 && (
        <div className="card">
          <BulkBar bulk={bulk} label="성적">
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`고른 성적 ${bulk.count}건을 지울까요?\n틀린 문제 기록도 함께 지워집니다.`)) return;
                run(() => bulk.run((ids) => removeScores(ids)));
              }}
            >
              삭제
            </button>
          </BulkBar>

          {KINDS.map((k) => {
            const list = groups[k.key] || [];
            if (list.length === 0) return null;
            const t = trendOf(list);
            return (
              <div key={k.key} style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                  <b style={{ fontSize: 14 }}>{k.label}</b>
                  <span className="hint">{list.length}건</span>
                  {t && (
                    <span className={`tag ${t.diff > 0 ? "tag-mint" : t.diff < 0 ? "tag-amber" : "tag-muted"}`}>
                      {t.text}
                    </span>
                  )}
                </div>

                <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                  {list.map((s) => (
                    <div key={s.id} className="stack" style={{ gap: 0 }}>
                      <div className="unitrow">
                        <input
                          type="checkbox"
                          checked={bulk.has(s.id)}
                          onChange={() => bulk.toggle(s.id)}
                        />
                        <span className="hint" style={{ minWidth: 76 }}>
                          {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : "날짜 없음"}
                        </span>
                        <b style={{ fontSize: 12.5, minWidth: 120 }}>{s.term || KIND_LABEL[s.kind]}</b>
                        <span style={{ fontSize: 12.5, flex: 1 }}>{summary(s, findExam(s, exams, student))}</span>
                        {s.source === "form" && <span className="tag tag-sky">학생이 냄</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => openWrongs(s)}>
                          {openId === s.id ? "닫기" : "틀린 문제"}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>수정</button>
                      </div>

                      {openId === s.id && (
                        <div className="card card-tight" style={{ background: "var(--surface-2)", margin: "4px 0 8px" }}>
                          <div className="stack" style={{ gap: 3 }}>
                            {wrongs.length === 0 && (
                              <p className="hint" style={{ margin: 0 }}>
                                아직 적어둔 것이 없어요. 무엇을 왜 틀렸는지 남겨두면
                                다음 시험 전에 그것만 다시 봅니다.
                                {" "}<b>번호로 적으시면</b> 리포트에서 영역별 정답률로 계산됩니다
                                (아이가 스스로 적은 것과 같은 자리입니다).
                              </p>
                            )}
                            {wrongs.map((x) => (
                              <div className="unitrow" key={x.id}>
                                {x.question && <span className="tag tag-muted">{x.question}</span>}
                                <b style={{ fontSize: 12.5 }}>{x.topic || "—"}</b>
                                <span className="hint" style={{ flex: 1 }}>{x.reason || ""}</span>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pending}
                                  onClick={() =>
                                    run(() => removeWrongs([x.id]), () =>
                                      setWrongs(wrongs.filter((y) => y.id !== x.id))
                                    )
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <input
                              className="input input-sm"
                              style={{ width: 70 }}
                              placeholder="12번"
                              title="번호를 적으면 영역별 정답률에 들어갑니다"
                              value={w.question}
                              onChange={(e) => setW({ ...w, question: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              style={{ width: 150 }}
                              placeholder="메모 (선택)"
                              value={w.topic}
                              onChange={(e) => setW({ ...w, topic: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              style={{ flex: 1, minWidth: 160 }}
                              placeholder="왜 (단어를 몰라서 · 시간 부족)"
                              value={w.reason}
                              onChange={(e) => setW({ ...w, reason: e.target.value })}
                            />
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => addWrong(s.id, w), () => {
                                  setW({ question: "", topic: "", reason: "" });
                                  listWrongs(s.id).then((r) => setWrongs(r?.rows || []));
                                })
                              }
                            >
                              넣기
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {student && mine.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {student.name} 학생의 성적이 아직 없습니다. 위에서 넣어주세요.
          </p>
        </div>
      )}
    </div>
  );
}
