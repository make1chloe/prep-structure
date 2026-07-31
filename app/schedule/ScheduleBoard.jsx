"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addExam, setEnglishDate, updateExam, deleteExam, hideExam,
  markExamAbsence, makeExamEveSession, addClassHoliday, keepClassOn, removeHoliday,
} from "./actions";
import { shortLabel } from "@/lib/day";

const ALERT_CLS = {
  over: "tag-sky",
  short: "tag-amber",
  off: "tag-muted",
  exam: "tag-amber",
  engEve: "tag-lav",
};

function ymLabel(ym) {
  const [y, m] = ym.split("-");
  return `${Number(m)}월`;
}
const dayShort = shortLabel;

// 3개월을 합쳐서 보면 결국 몇 회를 더 하고 덜 하는지
function Totals({ months }) {
  const live = months.reduce((s, m) => s + m.live.length, 0);
  const base = months.reduce((s, m) => s + (m.base || 0), 0);
  const diff = live - base;
  return (
    <span className={`tag ${diff === 0 ? "tag-mint" : diff > 0 ? "tag-sky" : "tag-amber"}`}>
      3개월 합계 {live}회 / 기준 {base}회
      {diff === 0 ? " — 딱 맞음" : diff > 0 ? ` — ${diff}회 많음` : ` — ${-diff}회 부족`}
    </span>
  );
}

export default function ScheduleBoard({
  months = [],
  reviews = [],
  exams = [],
  schools = [],
  grades = [],
  classes = [],
  unavailable = false,
  holidayNotes = [],
  makeupDays = [],
  holidays = [],
}) {
  const [form, setForm] = useState({ school: "", grade: "", name: "", from: "", to: "" });
  const [eng, setEng] = useState({});
  const [off, setOff] = useState({ date: "", name: "", classId: "" });
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 시험도 볼까
  // 숨긴 시험은 기본으로 접어둔다 — 나이스에서 받으면 안 쓰는 것까지 다 들어온다
  const hiddenExams = exams.filter((e) => e.hidden);
  const shownExams = showHidden ? exams : exams.filter((e) => !e.hidden);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, msg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (msg) alert(msg);
      router.refresh();
    });
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          시험 일정을 쓰려면 Supabase에서 <b>0021 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 휴강 — 공휴일이 아닌 날도 쉰다 (원장님 사정, 학교 행사, 가족 일) */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>휴강</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          공휴일이 아닌 날도 쉴 수 있습니다. 여기 넣으면 <b>그날은 회차에서 빠지고</b>,
          수강료는 깎지 않고 보강으로 채우도록 계산됩니다.
        </p>

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 160 }}>
            <label className="label">날짜 *</label>
            <input
              className="input input-sm"
              type="date"
              value={off.date}
              onChange={(e) => setOff({ ...off, date: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">이유</label>
            <input
              className="input input-sm"
              placeholder="원장 개인사정"
              value={off.name}
              onChange={(e) => setOff({ ...off, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">어느 반</label>
            <select
              className="input input-sm"
              value={off.classId}
              onChange={(e) => setOff({ ...off, classId: e.target.value })}
            >
              <option value="">전체 휴강 (모든 반)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}만</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !off.date}
            style={{ marginBottom: 1 }}
            onClick={() =>
              run(async () => {
                const res = await addClassHoliday(off.date, off.name, off.classId || null);
                if (!res?.error) setOff({ date: "", name: "", classId: "" });
                return res;
              }, "휴강으로 지정했어요.")
            }
          >
            휴강 추가
          </button>
        </div>

        {holidays.length > 0 ? (
          <div className="stack" style={{ gap: 3, marginTop: 10 }}>
            {holidays.map((h) => (
              <div className="unitrow" key={h.id}>
                <b style={{ fontSize: 12.5, minWidth: 96 }}>{dayShort(h.date)}</b>
                <span className={`tag ${h.class_id ? "tag-sky" : "tag-muted"}`}>
                  {h.class_id ? `${classes.find((c) => c.id === h.class_id)?.name || "반"}만` : "전체"}
                </span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{h.name || "휴강"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`${dayShort(h.date)} 휴강을 지울까요?\n회차와 수강료가 다시 계산됩니다.`)) return;
                    run(() => removeHoliday(h.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ margin: "10px 0 0" }}>아직 지정한 휴강이 없습니다.</p>
        )}
      </div>

      {/* 공휴일 · 대체공휴일 · 낀 날 */}
      {holidayNotes.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
            공휴일 — 쉴지 정해주세요
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
            자동으로 휴강 처리하지 않습니다. 학원마다 다르고 낀 날은 더 그렇기 때문에,
            <b> 수업이 잡혀 있는 공휴일만 골라서 알려드립니다.</b>
            <br />
            <b>그냥 수업함</b> 을 누르면 회차·수강료는 그대로 두고 일정에 기록만 남기고,
            알림은 사라집니다. <b>쉬기</b> 를 고르면 휴강으로 잡혀 회차에서 빠집니다.
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {holidayNotes.map((h) => (
              <div className="unitrow" key={h.date} style={{ alignItems: "flex-start" }}>
                <span
                  className={`tag ${
                    h.kind === "bridge" ? "tag-lav"
                    : h.kind === "substitute" ? "tag-amber"
                    : "tag-red"
                  }`}
                >
                  {h.kind === "bridge" ? "낀 날" : h.kind === "substitute" ? "대체공휴일" : "공휴일"}
                </span>
                <b style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {dayShort(h.date)} {h.name}
                </b>
                <span className="muted" style={{ fontSize: 12, flex: 1, lineHeight: 1.6 }}>
                  {h.why}
                </span>
                {/* 답이 두 개다 — 쉬거나, 그냥 수업하거나 */}
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  title="회차·수강료는 그대로 두고, 일정에 '정상 수업' 으로 기록만 남깁니다"
                  onClick={() =>
                    run(
                      () => keepClassOn(h.date, h.name),
                      "그냥 수업하는 것으로 정했어요. 일정에 남겨뒀습니다."
                    )
                  }
                >
                  그냥 수업함
                </button>
                <select
                  className="input input-sm"
                  style={{ width: 150 }}
                  defaultValue=""
                  disabled={pending}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    ev.target.value = "";
                    if (v === "all") {
                      run(() => addClassHoliday(h.date, h.name, null), "전체 휴강으로 지정했어요.");
                    } else if (v) {
                      run(() => addClassHoliday(h.date, h.name, v), "휴강으로 지정했어요.");
                    }
                  }}
                >
                  <option value="">쉬기 (휴강 지정)…</option>
                  <option value="all">전체 휴강</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}만</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 시험 일정 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학교 시험 일정</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
          <b>1차</b> — 학교에서 시험 기간만 알려주면 먼저 기간을 넣습니다.
          그 기간 정규수업은 <b>타과목 시험 때문에 결석 예상</b>으로 표시됩니다.
          <br />
          <b>2차</b> — 영어 시험일이 확정되면 채워 넣습니다.
          그 <b>전날</b>은 정규수업이 아니어도 등원해야 하므로 알림이 뜹니다.
        </p>

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 150 }}>
            <label className="label">학교 *</label>
            <input
              className="input input-sm"
              list="schools"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
            />
            <datalist id="schools">
              {schools.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">학년</label>
            <input
              className="input input-sm"
              list="grades"
              placeholder="비우면 전체"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
            <datalist id="grades">
              {grades.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">시험 이름</label>
            <input
              className="input input-sm"
              placeholder="2학기 중간고사"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">시작 *</label>
            <input
              className="input input-sm"
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to || e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">끝</label>
            <input
              className="input input-sm"
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending || !form.school || !form.from}
            onClick={() =>
              run(async () => {
                const r = await addExam(form);
                setForm({ school: "", grade: "", name: "", from: "", to: "" });
                return r;
              })
            }
          >
            기간 추가
          </button>
        </div>

        {hiddenExams.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "숨긴 것 접기" : `숨긴 시험 ${hiddenExams.length}건 보기`}
            </button>
            <span className="hint" style={{ fontSize: 11.5 }}>
              숨긴 시험은 알림·결석 예상에서 빠집니다. 다시 받아와도 숨긴 채로 있습니다.
            </span>
          </div>
        )}

        {shownExams.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 12 }}>
            {shownExams.map((e) => (
              <div className="unitrow" key={e.id} style={e.hidden ? { opacity: 0.55 } : undefined}>
                {e.hidden && <span className="tag tag-muted">숨김</span>}
                <b style={{ fontSize: 12.5 }}>
                  {e.school} {e.grade || "전체"}
                </b>
                {e.name && <span className="tag tag-muted">{e.name}</span>}
                <span className="hint">
                  {dayShort(e.from_date)} ~ {dayShort(e.to_date)}
                </span>
                <span className="spacer" />
                {e.english_on ? (
                  <>
                    <span className="tag tag-lav">영어 {dayShort(e.english_on)}</span>
                    <span className="tag tag-sky">
                      전날 등원 {dayShort(e.eveDate)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="tag tag-amber">영어 시험일 미정</span>
                    <input
                      className="input input-sm"
                      type="date"
                      style={{ width: 145 }}
                      value={eng[e.id] || ""}
                      onChange={(ev) => setEng({ ...eng, [e.id]: ev.target.value })}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending || !eng[e.id]}
                      onClick={() => run(() => setEnglishDate(e.id, eng[e.id]))}
                    >
                      영어 시험일 저장
                    </button>
                  </>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  title={
                    e.hidden
                      ? "다시 쓰겠습니다"
                      : "필요 없는 시험입니다. 알림·결석 예상에서 뺍니다 (기록은 남습니다)"
                  }
                  onClick={() => run(() => hideExam(e.id, !e.hidden))}
                >
                  {e.hidden ? "다시 쓰기" : "숨기기"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm("이 시험 일정을 지울까요?\n\n나이스에서 받아온 것이면 다시 받을 때 또 들어옵니다. 그럴 땐 「숨기기」 를 쓰세요.")) return;
                    run(() => deleteExam(e.id));
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
        {exams.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }}>등록된 시험 일정이 없습니다.</p>
        )}
      </div>

      {/* 3개월 회차 */}
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {reviews.map(({ klass, roster, months: ms }) => (
          <div className="card" key={klass.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                {klass.name}{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {(klass.days || []).join("·")} · {roster}명
                  {klass.base_sessions ? ` · 기준 ${klass.base_sessions}회` : " · 기준 없음"}
                </span>
              </h2>
              {klass.base_sessions && <Totals months={ms} />}
            </div>

            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {ms.map((m) => (
                <div key={m.ym} style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 14 }}>{ymLabel(m.ym)}</b>
                    <span className="hint">
                      수업 {m.live.length}회
                      {m.off.length > 0 && ` (휴강 ${m.off.length}회 제외)`}
                    </span>
                    {m.alerts.length === 0 && <span className="tag tag-mint">특이사항 없음</span>}
                  </div>

                  {m.alerts.length > 0 && (
                    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                      {m.alerts.map((a, i) => (
                        <div className="unitrow" key={i} style={{ alignItems: "flex-start" }}>
                          <span
                            className={`tag ${
                              a.settled ? "tag-mint" : ALERT_CLS[a.kind] || "tag-muted"
                            }`}
                          >
                            {a.kind === "over" ? (a.settled ? "회차 맞음" : "회차 많음")
                              : a.kind === "short" ? (a.settled ? "회차 맞음" : "회차 부족")
                              : a.kind === "off" ? "휴강"
                              : a.kind === "exam" ? "시험 기간"
                              : "영어 시험 전날"}
                          </span>
                          <span style={{ fontSize: 12.5, flex: 1 }}>
                            {a.text}
                            {a.advice && (
                              <>
                                <br />
                                <span
                                  className="muted"
                                  style={{ fontSize: 12, lineHeight: 1.6 }}
                                >
                                  {a.advice}
                                </span>
                              </>
                            )}
                            {/* 누구 이야기인지 — 이름이 없으면 결국 명단을 다시 찾아본다.
                                한 반에 학교가 섞여 있으면 반 전체가 아니라 그 학교 아이들만이다 */}
                            {a.who?.length > 0 && (
                              <>
                                <br />
                                <span style={{ fontSize: 12, lineHeight: 1.7 }}>
                                  {a.school && (
                                    <b>{[a.school, a.grade].filter(Boolean).join(" ")} — </b>
                                  )}
                                  {a.who.map((x) => x.name).join(", ")}{" "}
                                  <span className="muted">({a.who.length}명)</span>
                                </span>
                              </>
                            )}
                          </span>

                          {a.kind === "over" && !a.settled && (
                            <select
                              className="input input-sm"
                              style={{ width: 150 }}
                              defaultValue=""
                              onChange={(ev) => {
                                const d = ev.target.value;
                                ev.target.value = "";
                                if (!d) return;
                                if (!confirm(`${dayShort(d)} 을 휴강으로 지정할까요?`)) return;
                                run(
                                  () => addClassHoliday(d, "회차 조정 휴강", klass.id),
                                  "휴강으로 지정했어요."
                                );
                              }}
                              disabled={pending}
                            >
                              <option value="">휴강으로 지정…</option>
                              {m.live.map((d) => (
                                <option key={d} value={d}>{dayShort(d)}</option>
                              ))}
                            </select>
                          )}

                          {a.kind === "exam" && (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={pending}
                              onClick={() => {
                                const names = (a.who || []).map((x) => x.name);
                                if (
                                  !confirm(
                                    `${klass.name} — ${m.inExam.length}일(${m.inExam
                                      .map(dayShort)
                                      .join(", ")}) 을 결석 예정으로 넣을까요?\n\n` +
                                      (names.length
                                        ? `시험 보는 학생: ${names.join(", ")} (${names.length}명)\n` +
                                          "※ 지금은 반 전체에 찍힙니다. 다른 학교 학생이 섞여 있으면 그 아이들 것은 나중에 지워주세요.\n"
                                        : "")
                                  )
                                )
                                  return;
                                run(
                                  () => markExamAbsence(klass.id, m.inExam, "시험 기간"),
                                  "결석 예정으로 넣었어요."
                                );
                              }}
                            >
                              결석 예정 일괄 등록
                            </button>
                          )}

                          {a.kind === "engEve" && (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={pending}
                              onClick={() => {
                                const e = m.engEve.find((x) => x.date === a.date);
                                const names = (a.who || []).map((x) => x.name);
                                if (
                                  names.length &&
                                  !confirm(
                                    `${dayShort(a.date)} 등원 일정을 만들까요?\n\n` +
                                      `${a.school || ""} ${a.grade || ""} — ${names.join(", ")} (${names.length}명)\n` +
                                      "그날 전달사항으로 이 학생들에게 안내됩니다."
                                  )
                                )
                                  return;
                                run(
                                  () =>
                                    makeExamEveSession({
                                      date: a.date,
                                      school: e?.school,
                                      grade: e?.grade,
                                      classId: klass.id,
                                      englishOn: e?.english_on,
                                    }),
                                  "등원 일정을 만들었어요. 그날 전달사항으로 학생에게 안내됩니다."
                                );
                              }}
                            >
                              등원 일정 만들기
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="row" style={{ gap: 4, marginTop: 6 }}>
                    {m.all.map((d) => {
                      const isOff = m.off.includes(d);
                      const isExam = m.inExam.includes(d);
                      const isEve = m.engEve.some((x) => x.date === d);
                      return (
                        <span
                          key={d}
                          className={`tag ${
                            isOff ? "tag-muted" : isEve ? "tag-lav" : isExam ? "tag-amber" : "tag-sky"
                          }`}
                          style={isOff ? { textDecoration: "line-through" } : undefined}
                          title={
                            isOff ? "휴강" : isEve ? "영어 시험 전날" : isExam ? "시험 기간" : "수업"
                          }
                        >
                          {dayShort(d)}
                        </span>
                      );
                    })}
                    {/* 정규수업일이 아닌 영어 시험 전날도 보여준다 */}
                    {m.engEve
                      .filter((x) => !x.isClassDay)
                      .map((x) => (
                        <span key={x.date} className="tag tag-lav" title="정규수업 아님 · 등원 필요">
                          ＋{dayShort(x.date)}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {reviews.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              반이 없습니다. <b>반</b> 메뉴에서 먼저 만들어주세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
