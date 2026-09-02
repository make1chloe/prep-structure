/**
 * 일정 — **앞일을 잡는 화면.** 할일 · 회차 · 휴강 · 보강 · 학교·시험이 여기 다 있다.
 * (계획 3단계 통째로 · ㉔ 결석·지각 예정은 달력에서 · ㊲ 전국과 학교를 가른다 ·
 *  ㊴ 「내 할 일」 하나 — 바깥 축은 할 일 종류 · ㊱ 누적 ·
 *  오류 대장 76 · 78 · 82 · 85 · 86 · 87)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *    회차·8회 판정·보강 대상은 `lib/session.js` 가, 할 일은 `lib/todo.js` 가 낸다.
 *
 * ── 화면 차례 (급한 것이 위. **탭이 없다** — 탭 전환은 화면 전체 재조회다, §속도 1)
 *      ① 이 달 회차 — **8회 채우기**   반마다 맨 위. 8회 미만이면 **빨갛게**
 *      ② 보강 잡을 아이               **학생마다 따로**. 앱이 시각을 제안하지 않는다
 *      ③ 달력                        **정상 수업은 안 띄우고 휴강을 띄운다**. 사유별로 묶는다
 *      ④ 내 할 일                    바깥 축은 **할 일 종류**. 학교는 거르개 한 줄
 *      ⑤ 학교·시험                   **전국은 학교를 안 붙인다**
 *      ⑥ 다음 달 확정 도장 셋
 *
 * ── ⚠️ **회차는 수강료가 아니라 「8회 채우기」다** (오류 대장 83 — 계획이 통째로 틀렸던 자리).
 *    못 채우면 **보강을 잡으려고** 센다. 정규 수강료는 월정액이고 회차와 무관하다.
 * ── ⚠️ **결석은 회차에서 안 빠지고 휴강은 빠진다.**
 * ── ⚠️ **역할을 스스로 본다.** 문지기는 첫 화면만 고르고 역할로 화면을 안 지킨다
 *    (`middleware.js` 주석의 실측 — 학생 세션으로 `/parent` 가 200 이었다).
 * ── ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 */
import Link from "next/link";
import "./schedule.css";
import { staffOnly, openAs, QUERY_CAP } from "./db.js";
import {
  loadMonth, monthDays, calendarMarks, makeupLoad, whoOn,
  FILTERS, ddayLabel, DOW_NAME, MIN_SESSIONS, YM,
} from "./read.js";
import { Calendar, EnglishOn, Stamps, TodoCheck } from "./ui.js";

// ⚠️ 달마다 다르고 오늘마다 다르다. 캐시되면 지난달 회차가 이 달 것처럼 뜬다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "일정 · 클로이영어" };

const one = (v) => (Array.isArray(v) ? v[0] : v);

/** 「무엇이 없어서 비었나」 — ⚠️ 빈 카드를 예쁘게 만들지 않는다 */
function Why({ children }) { return <p className="sc-note">{children}</p>; }

/** 반 이름 — `v2.classes` 에 이름 칸이 없다. **요일·시각을 그대로 보인다** (짓지 않는다) */
function ClassName({ sched, kind, nickname }) {
  if (nickname) return <b>{nickname}</b>;
  const days = (sched?.weekdays ?? []).map((d) => DOW_NAME[Number(d)] ?? "?").join("");
  return (
    <>
      <b>{days || "⚠️ 요일 없음"}</b>
      <span className="num">{String(sched?.start_time ?? "").slice(0, 5) || "시각 없음"}</span>
      <span className="chip">{kind === "special" ? "특강" : "정규"}</span>
    </>
  );
}

export default async function Schedule({ searchParams }) {
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}));
  const me = await staffOnly();

  if (!me.ok) {
    return (
      <main className="wrap"><div className="stack">
        <h1>일정</h1>
        <div className="card">
          <div className="cardhd">이 화면을 못 엽니다</div>
          <Why>{me.msg}</Why>
          {me.how?.length ? <ul>{me.how.map((h) => <li key={h}>{h}</li>)}</ul> : null}
        </div>
      </div></main>
    );
  }

  const conn = await openAs(me.profileId);
  if (!conn.ok) {
    return (
      <main className="wrap"><div className="stack">
        <h1>일정</h1>
        <div className="card"><div className="cardhd">DB 에 못 붙었습니다</div><Why>{conn.why}</Why></div>
      </div></main>
    );
  }

  try {
    const askedYm = YM.test(String(one(sp.ym) ?? "")) ? one(sp.ym) : null;
    const filter = String(one(sp.f) ?? "all");
    const { m, board, makeup, todos, missed } = await loadMonth(conn.db, { ym: askedYm, filter });

    const grid = monthDays(m.ym);
    const marks = Object.fromEntries(calendarMarks(m));
    const load = makeupLoad(m);
    const who = whoOn(m);
    const can = m.can_write ?? {};

    // 반마다 **그 달에 걸치는 마지막 요일 이력** — 이름을 짓는 데만 쓴다
    const schedOf = new Map();
    for (const s of m.schedules) schedOf.set(s.class_id, s);
    const kindOf = new Map(m.classes.map((c) => [c.id, c]));

    const shortN = board.filter((b) => !b.enough).length;
    const national = m.exams.filter((e) => e.scope === "national");
    const bySchool = m.exams.filter((e) => e.scope === "school");
    const stampOf = (ym, classId) => {
      const got = {};
      for (const s of m.stamps) if (s.ym === ym && s.class_id === classId) got[s.step] = s.at;
      return got;
    };
    const queries = conn.count();

    return (
      <main className="wrap"><div className="stack">

        {/* ── 머리 ────────────────────────────────────────────────── */}
        <div className="sc-head">
          <h1>일정</h1>
          <span className="sc-mon">
            <Link className="btn btnghost" href={`/schedule?ym=${m.prevYm}`}>◀ {m.prevYm}</Link>
            <span className="num">{m.ym}</span>
            <Link className="btn btnghost" href={`/schedule?ym=${m.nextYm}`}>{m.nextYm} ▶</Link>
          </span>
          <span className="muted">오늘 <span className="num">{m.today}</span></span>
        </div>
        {/* ㊱ — 한 번 한 것은 누적된다. 지난 달을 그대로 연다 */}
        <p className="muted">
          지난 달도 그대로 열립니다. 반을 옮겨도 <b>지난달 회차가 소급해 바뀌지 않습니다</b> —
          소속이 「언제부터 어느 반」의 줄로 쌓이기 때문입니다.
        </p>

        {/* ── ① 이 달 회차 — 8회 채우기 ─────────────────────────────
            ⚠️ 8회 판정은 **그 달 전체**로 한다. 「오늘까지」로 하면 매달 1일에 모든 반이
               빨갛게 떠서 원장님이 헛보강을 잡으신다 (lib/session.js 가 그렇게 센다). */}
        <div className="card">
          <div className="cardhd">
            ① 이 달 회차 — {MIN_SESSIONS}회 채우기
            {shortN
              ? <span className="pill pillbad">{shortN}개 반 모자람</span>
              : <span className="pill pillok">모든 반이 {MIN_SESSIONS}회를 채웁니다</span>}
          </div>
          <p className="muted">
            회차는 수강료가 아니라 <b>「{MIN_SESSIONS}회를 채웠나」</b>입니다. 못 채우면 <b>보강을 잡습니다.</b>
            <b> 휴강은 빠지고 결석은 안 빠집니다</b> — 학원이 안 열린 날만 회차에서 빠집니다.
          </p>
          {board.length === 0 ? (
            <Why>이 달에 요일이 잡힌 반이 하나도 없습니다 — `v2.class_schedule` 에 이 달에 걸치는 줄이 없습니다.</Why>
          ) : (
            <div className="tblwrap">
              <table className="tbl">
                <thead><tr className="hdstick">
                  <th>반</th><th>지난 회차</th><th>앞날 예정</th><th>이 달 합</th><th>{MIN_SESSIONS}회</th>
                </tr></thead>
                <tbody>
                  {board.map((b) => (
                    <tr key={b.classId}>
                      <td><span className="sc-kv">
                        <ClassName sched={schedOf.get(b.classId)} kind={b.kind}
                                   nickname={kindOf.get(b.classId)?.nickname} />
                      </span></td>
                      <td className="num">{b.done}</td>
                      <td className="num">{b.planned}</td>
                      <td className="num">{b.total}</td>
                      <td>{b.enough
                        ? <span className="pill pillok">채움</span>
                        : <span className="pill pillbad">{b.short}회 모자람</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── ② 보강 잡을 아이 — **학생마다 따로** ─────────────────── */}
        <div className="card">
          <div className="cardhd">② 보강 잡을 아이</div>
          <p className="muted">
            보강일은 <b>학생마다 따로</b> 잡습니다 — 전체 보강일 하루를 잡는 것이 아닙니다.
            잡는 자리는 <b>달력</b>입니다: 아무 날이나 고르고 <b>시각도 직접</b> 적습니다.
            앱은 시각을 제안하지 않고, 빈 자리 셈은 <b>보여 드리기만 하고 막지 않습니다.</b>
          </p>
          {makeup.length === 0 ? (
            <p className="muted">
              {shortN === 0
                ? `이 달은 모든 반이 ${MIN_SESSIONS}회를 채워서 보강을 잡을 아이가 없습니다.`
                : "모자란 반은 있는데 그 반의 명단이 비어 있습니다 — 이 달에 그 반에 든 아이가 한 줄도 없습니다."}
            </p>
          ) : makeup.map((mk) => (
            <details key={mk.classId} className="sc-fold">
              <summary className="sc-foldhd">
                <ClassName sched={schedOf.get(mk.classId)} kind={kindOf.get(mk.classId)?.kind}
                           nickname={kindOf.get(mk.classId)?.nickname} />
                <span className="pill pillbad">{mk.class.short}회 모자람</span>
                <span className="chip">{mk.students.length}명</span>
              </summary>
              <div className="sc-foldbd">
                {mk.students.length === 0
                  ? <Why>이 반의 명단이 비어 있어 아이를 못 셉니다.</Why>
                  : (
                    <div className="tblwrap">
                      <table className="tbl">
                        <thead><tr className="hdstick">
                          <th>아이</th><th>수업</th><th>잡아 둔 보강</th><th>합</th><th>모자람</th>
                        </tr></thead>
                        <tbody>
                          {mk.students.map((s) => (
                            <tr key={s.studentId}>
                              <td>{m.students.find((x) => x.id === s.studentId)?.name ?? "⚠️ 이름 없음"}</td>
                              <td className="num">{s.sessions.length}</td>
                              <td className="num">{s.makeup.length}</td>
                              <td className="num">{s.count}</td>
                              <td><span className="pill pillbad">{s.short}회</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </details>
          ))}
        </div>

        {/* ── ③ 달력 ──────────────────────────────────────────────── */}
        <div className="card">
          <div className="cardhd">③ 달력 <span className="num">{m.ym}</span></div>
          <Calendar grid={grid} marks={marks} today={m.today} who={who} load={load}
                    classes={m.schedules} students={m.students}
                    makeups={m.makeups} planned={m.planned} holidays={m.holidays}
                    canWrite={can} />
        </div>

        {/* ── ④ 내 할 일 — 바깥 축은 **할 일 종류** (㊴) ───────────── */}
        <div className="card">
          <div className="cardhd">
            ④ 내 할 일 <span className="num">{todos.counts.open}</span>
            {todos.late.length ? <span className="pill pillbad">마감 지남 {todos.late.length}</span> : null}
            {todos.moved ? <span className="pill pillinfo">{todos.moved}개를 앞 수업일로 당겼습니다</span> : null}
          </div>
          <p className="muted">
            묶는 축은 <b>할 일 종류</b>입니다 — 학교가 아닙니다. 학교로 묶으면 인쇄 목록이 다섯 군데로
            흩어지고 겹치는 것이 아홉 번 뜹니다. <b>칸을 순서로 읽지 마세요</b> — 같은 일을 몰아서 하려고 묶은 것입니다.
          </p>
          {/* 거르개 한 줄 — ⚠️ 이건 탭이 아니라 **다른 물음**이다. 누르면 새로 읽는다 */}
          <div className="row">
            {[...FILTERS, ...m.schools.map((s) => ({ key: s.id, label: s.name }))].map((f) => (
              <Link key={f.key} className={"btn" + (filter === f.key ? " btnmain" : " btnghost")}
                    href={`/schedule?ym=${m.ym}&f=${f.key}`}>{f.label}</Link>
            ))}
          </div>
          <div className="sc-pair">
            {todos.groups.map((g) => (
              <div key={g.key} className="sc-bin">
                <p className="sc-binhd">
                  <span className="sc-icon" aria-hidden="true">{g.icon}</span>
                  {g.label} <span className="num">{g.left}</span>
                  {g.n !== g.left ? <span className="chip">끝낸 것 {g.n - g.left}</span> : null}
                </p>
                {g.rows.length === 0
                  ? <p className="muted">없습니다.</p>
                  : g.rows.map((r) => (
                    <div key={r.id} className="sc-todo">
                      <span className="grow">{r.title}</span>
                      {r.due_on ? <span className="num">{r.due_on}</span> : <span className="muted">마감 없음</span>}
                      {r.english_on ? <span className="chip">{ddayLabel(r.dday)}</span> : null}
                      {r.pulled ? <span className="pill pillinfo">{r.pulled.why}</span> : null}
                      {r.pullWarn ? <span className="pill pillwarn">{r.pullWarn}</span> : null}
                      {r.exams?.length
                        ? <span className="chip">
                            {r.exams.map((e) => (e.scope === "national" ? e.name : `${e.school ?? "?"} ${e.name}`)).join(" · ")}
                          </span>
                        : null}
                      {/* ⚠️ **앱이 세어 준 카드**는 `v2.todo` 에 줄이 없다 — 눌러도 바뀔 것이 없어 단추를 안 붙인다 */}
                      {r.counted
                        ? <span className="pill pillinfo">앱이 세었습니다</span>
                        : <TodoCheck ids={r.ids ?? [r.id]} state={r.state} canWrite={can} />}
                    </div>
                  ))}
              </div>
            ))}
          </div>
          {todos.aside.n ? (
            <details className="sc-fold">
              <summary className="sc-foldhd">
                {todos.aside.label} <span className="num">{todos.aside.n}</span>
              </summary>
              <div className="sc-foldbd">
                <p className="muted">
                  학사일정은 원장님 할 일이 아니라 <b>학교가 정한 날</b>이라 옆으로 치웠습니다 —
                  버리지 않고 세어서 말씀드립니다.
                </p>
                {todos.aside.rows.slice(0, 40).map((r) => (
                  <div key={r.id} className="sc-todo">
                    <span className="grow">{r.title}</span>
                    <span className="num">{r.due_on ?? "—"}</span>
                  </div>
                ))}
                {todos.aside.rows.length > 40
                  ? <p className="muted">…그리고 {todos.aside.rows.length - 40}줄 더 있습니다.</p> : null}
              </div>
            </details>
          ) : null}
        </div>

        {/* ── ⑤ 학교·시험 — **전국과 학교를 가른다** (㊲) ───────────── */}
        <div className="card">
          <div className="cardhd">⑤ 학교 · 시험</div>
          <p className="muted">
            <b>전국 시험(수능·학력평가·평가원 모의)은 학교를 안 붙입니다</b> — 한 줄이 전 학생에게 걸립니다.
            나이스는 학교마다 한 줄씩 내려주므로 <b>받아올 때 합쳐야</b> 합니다.
          </p>
          {m.dup_national > 0 ? (
            <Why>
              ⚠️ 이름·기간이 같은 전국 시험이 <b>{m.dup_national}묶음</b> 겹쳐 있습니다 —
              나이스가 학교마다 한 줄씩 내려준 것입니다. <b>합치는 일은 받아오는 쪽</b>이 합니다.
              화면이 몰래 합치면 「무엇이 한 줄인가」가 두 벌이 됩니다.
            </Why>
          ) : null}

          {m.exams.length === 0 ? (
            <Why>
              시험 회차가 <b>한 줄도 없습니다</b> (`v2.exams` 0줄 · `v2.schools` 0줄, 2026-09-02 실측).
              들어오는 길은 셋입니다 — ① 나이스 자동(학교 5곳 중 3곳만 중간·기말이 옵니다)
              ② 학교 홈페이지를 읽는 브라우저 확장(<b>학교마다 생김새가 달라 다섯 번 맞춰야</b> 합니다)
              ③ 손으로. ⚠️ 셋 다 <b>영어 시험일은 안 줍니다.</b>
            </Why>
          ) : (
            <div className="sc-pair">
              <div className="sc-bin">
                <p className="sc-binhd">전국 <span className="num">{national.length}</span></p>
                {national.length === 0 ? <p className="muted">없습니다.</p> : national.map((e) => (
                  <div key={e.id} className="sc-todo">
                    {/* ⚠️ 학교를 **안 붙인다** — 학교마다 한 줄이 되면 안 된다 */}
                    <span className="grow">{e.name}{e.grade ? ` · ${e.grade}학년` : ""}</span>
                    <span className="num">{e.english_on ?? `${e.term_from ?? "?"}~${e.term_to ?? "?"}`}</span>
                    {e.english_on
                      ? <span className="pill pillok">영어 시험일 있음</span>
                      : <EnglishOn examId={e.id} value="" canWrite={can} />}
                  </div>
                ))}
              </div>
              <div className="sc-bin">
                <p className="sc-binhd">학교 <span className="num">{bySchool.length}</span></p>
                {bySchool.length === 0 ? <p className="muted">없습니다.</p> : bySchool.map((e) => (
                  <div key={e.id} className="sc-todo">
                    <span className="grow">
                      <b>{e.school_name ?? "⚠️ 학교 없음"}</b> {e.name}{e.grade ? ` · ${e.grade}학년` : ""}
                    </span>
                    <span className="num">{e.english_on ?? `${e.term_from ?? "?"}~${e.term_to ?? "?"}`}</span>
                    {e.english_on
                      ? <span className="pill pillok">영어 시험일 있음</span>
                      : <EnglishOn examId={e.id} value="" canWrite={can} />}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="sc-note">
            ⚠️ <b>영어 시험일은 나이스가 안 줍니다.</b> 그 한 줄이 전날 등원·안내 문구·할 일 마감·
            성적 기본 날짜를 <b>한꺼번에 세웁니다</b> — 기간 끝으로 짐작해 채우면 루틴 아홉이 사흘 늦게 섭니다.
            그래서 앱이 짐작하지 않습니다.
          </p>
          <p className="sc-note">
            ⚠️ 받아올 때 갈래를 가르는 낱말(수능 · 대학수학능력시험 · 학력평가 · 전국연합 · 학평 · 모의고사)을
            <b> 담을 자리가 아직 DB 에 없습니다.</b> 원장님이 고치실 수 있어야 하는데(학교가 이상하게 적어 오는 일이
            있습니다) 지금은 고칠 곳이 없습니다 — 지어내지 않고 그대로 밝힙니다.
          </p>
        </div>

        {/* ── ⑥ 다음 달 확정 도장 셋 (3단계) ───────────────────────── */}
        <div className="card">
          <div className="cardhd">⑥ 다음 달({m.nextYm}) 일정 확정 <span className="chip">도장 셋</span></div>
          <p className="muted">① 원장 안내 → ② 학부모 확인 → ③ 원장 확정. <b>③까지 끝난 달은 안 건드립니다.</b></p>
          {m.classes.length === 0 ? <Why>살아 있는 반이 없습니다.</Why> : (
            <div className="col">
              {m.classes.map((c) => (
                <div key={c.id} className="sc-kv">
                  <span className="grow"><ClassName sched={schedOf.get(c.id)} kind={c.kind} nickname={c.nickname} /></span>
                  <Stamps ym={m.nextYm} classId={c.id} done={stampOf(m.nextYm, c.id)} canWrite={can} />
                </div>
              ))}
            </div>
          )}
          <p className="sc-note">
            ⚠️ 계획대로라면 <b>휴강이 그 달 도장을 통째로 풀어야</b> 하는데,
            `v2.month_confirm` 에 무름 칸도 지우기 권한도 없어 <b>푸는 길이 없습니다.</b>
            풀린 척 그리면 원장님이 안 풀린 도장을 믿으시게 되므로 그대로 밝힙니다.
          </p>
        </div>

        {/* ── 이 화면이 몇 번 물었나 — ⚠️ 감추지 않는다 (대전제 0) ──── */}
        <details className="sc-fold">
          <summary className="sc-foldhd">
            {queries > QUERY_CAP
              ? <span className="pill pillwarn">조회 {queries}번 — 상한 {QUERY_CAP}을 넘었습니다</span>
              : <span className="pill pillok">조회 {queries}번 (상한 {QUERY_CAP})</span>}
            {missed ? <span className="pill pillwarn">미리 읽어 둔 것으로 못 막은 물음 {missed}번</span> : null}
          </summary>
          <div className="sc-foldbd">
            <p className="muted">
              한 달치를 <b>한 벌</b>로 읽고, `lib/session.js` 가 반마다 두 번씩 묻는 것은
              그 한 벌이 받아 줍니다(그냥 부르면 {m.classes.length}개 반에 조회가 17번입니다).
              나머지는 `lib/todo.js` 의 「내 할 일」이 <b>여섯</b>을 차례로 묻습니다.
            </p>
            <ul>{conn.log().map((t, i) => <li key={`${t}:${i}`}>{t}</li>)}</ul>
          </div>
        </details>

      </div></main>
    );
  } finally {
    await conn.end();
  }
}
