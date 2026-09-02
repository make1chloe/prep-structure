/**
 * 오늘 — **원장님이 매일 여는 화면.** 하루 동선이 여기 다 있다.
 * (계획 ⑨ 하루가 셋으로 나뉘고 검사가 방아쇠 · ⑨-a 화면은 둘이다 · ㉝ 좌우로 붙인 다섯 줄 ·
 *  ㉓ 조절은 교재마다·갯수로 · ⑬ 멈춤 셋 · ⑭ 늦귀가 · ⑮ 순서·접기·빈 것)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *    ②③ 은 손으로 채우는 자리가 **아니다** — `lib/routine.js` 가 차려 준 것이 이미 들어 있다
 *    (오류 36 — 목업 1·2판이 손으로 채운 것처럼 그려서 이 자동이 안 보였다).
 *
 * ── 화면 다섯 줄 (㉝ 의 좌우 짝 그대로, 900px 이하에서는 위아래로)
 *      🔤 단어시험      ↔ 🃏 클래스카드 플래너   둘 다 시작하자마자 확인하는 점수
 *      ① 숙제 검사      (혼자 — 줄이 여럿이라 넓게)
 *      ② 오늘 학습      ↔ ③ 오늘 숙제           **교재마다 왼쪽이 학원, 오른쪽이 집**
 *      📝 단원평가      ↔ 🕘 늦귀가             둘 다 점수·결과에서 나오는 뒷일
 *      📊 진도·영역 메모 ↔ ✉️ 부모님께 나갈 글    둘 다 마무리
 *
 * ── ⚠️ **탭이 없다.** 탭 전환은 화면 전체 재조회다 (§속도 1). 급한 순서로 세우고 **접기로 줄인다** —
 *    접기(`<details>`)는 다시 조회하지 않는다.
 * ── ⚠️ **역할을 스스로 본다.** 문지기는 첫 화면만 고르고 역할로 화면을 안 지킨다
 *    (`middleware.js` 주석의 실측 — 학생 세션으로 `/parent` 가 200 이었다).
 * ── ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 */
// ⚠️ 클래스카드 판정은 **lib 한 벌**이다 (확정 ⑱ · 원칙 1)
import { judgeSet, MODE_NAME, setTypeName, CANNOT_JUDGE } from "@/lib/classcard";
// ⚠️ 영역 메모를 받는 넷 — 원장님 확정(목업 31). 화면이 이 목록을 다시 적지 않게 여기 한 줄로 둔다
const AREAS = Object.freeze(["단어", "독해", "문법", "영작"]);
import Link from "next/link";
import "./today.css";
import { staffOnly } from "./who.js";
import { openAs, QUERY_CAP } from "./db.js";
import { loadRoster, loadOne } from "./read.js";
import { Marks, Attend, Comment, Late, Close, Freeze, AreaMemo } from "./ui.js";
import { routineOf } from "../../lib/routine.js";

// ⚠️ 판은 날마다 다르다. 캐시되면 어제 판이 오늘 화면에 그대로 뜬다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "오늘 · 클로이영어" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v) => (Array.isArray(v) ? v[0] : v);
const many = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const has = (v) => String(v ?? "").trim() !== "";

/** 주소줄 → 교재마다 조절 (㉓). ⚠️ **아직 어디에도 저장 안 된다** — 초안을 다시 차릴 뿐이다 */
function readAdjust(sp) {
  const adjust = {}, memo = {};
  for (const [k, v] of Object.entries(sp)) {
    const m = /^(n|g|d|mc|mh)_(.+)$/.exec(k);
    if (!m) continue;
    const [, kind, book] = m;
    if (kind === "mc" || kind === "mh") {
      memo[book] = memo[book] ?? {};
      memo[book][kind === "mc" ? "class" : "home"] = String(one(v) ?? "");
    } else {
      adjust[book] = adjust[book] ?? {};
      if (kind === "n") adjust[book].count = Number(one(v));
      if (kind === "g") adjust[book].pages = one(v);            // ⚠️ 빈 칸은 lib 이 「통째로」로 읽는다
      if (kind === "d") adjust[book].drop = many(v).flatMap((s) => String(s).split(",")).filter(Boolean);
    }
  }
  return { adjust, memo };
}

/** 이 폼이 안 건드리는 주소값은 그대로 들고 간다 — 다른 교재 조절이 사라지지 않게 */
function Keep({ sp, mine }) {
  const out = [];
  for (const [k, v] of Object.entries(sp)) {
    if (mine.includes(k)) continue;
    for (const one2 of many(v)) out.push(<input key={`${k}:${one2}`} type="hidden" name={k} value={one2} />);
  }
  return <>{out}</>;
}

/** 「무엇이 없어서 비었나」 — ⚠️ 빈 카드를 예쁘게 만들지 않는다 */
function Why({ children }) { return <p className="td-note">{children}</p>; }

export default async function Today({ searchParams }) {
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}));
  const me = await staffOnly();

  if (!me.ok) {
    return (
      <main className="wrap">
        <div className="stack">
          <h1>오늘</h1>
          <div className="card">
            <div className="cardhd">이 화면을 못 엽니다</div>
            <Why>{me.msg}</Why>
            {me.how?.length ? <ul>{me.how.map((h) => <li key={h}>{h}</li>)}</ul> : null}
          </div>
        </div>
      </main>
    );
  }

  const conn = await openAs(me.profileId);
  if (!conn.ok) {
    return (
      <main className="wrap">
        <div className="stack">
          <h1>오늘</h1>
          <div className="card"><div className="cardhd">DB 에 못 붙었습니다</div><Why>{conn.why}</Why></div>
        </div>
      </main>
    );
  }

  try {
    const askedOn = DATE.test(String(one(sp.on) ?? "")) ? one(sp.on) : null;
    const roster = await loadRoster(conn.db, askedOn);
    const picked = one(sp.s) ?? null;
    const who = roster.people.find((p) => p.studentId === picked) ?? null;
    const can = roster.canWrite ?? {};
    const { adjust, memo } = readAdjust(sp);

    let data = null, routines = null;
    if (who) {
      data = await loadOne(conn.db, { studentId: who.studentId, on: roster.on, adjust, memo });
      // 「뺄 항목」을 고르려면 **그 영역의 루틴 전부**가 있어야 한다 — `lib/routine.js` 를 그대로 부른다
      const areas = [...new Set((data.one.books ?? []).map((b) => b.area).filter(Boolean))];
      routines = await routineOf(conn.db, who.studentId, areas);
    }

    return (
      <main className="wrap">
        <div className="stack">
          <Head roster={roster} who={who} can={can} />
          <Roster roster={roster} picked={picked} sp={sp} />
          {who
            ? <Student roster={roster} who={who} data={data} routines={routines} sp={sp} can={can} adjust={adjust} />
            : <div className="card"><p className="muted">위에서 아이를 하나 고르면 그 아이의 판이 여기 섭니다.</p></div>}
          <Speed n={conn.count()} log={conn.log()} picked={!!who} />
        </div>
      </main>
    );
  } finally {
    await conn.end();
  }
}

/* ── 머리 ──────────────────────────────────────────────────────── */

function Head({ roster, who, can }) {
  const blocked = Object.entries(can).filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);
  const stale = roster.on !== roster.today;
  return (
    <div className="stack">
      <div className="td-head">
        <h1>오늘</h1>
        <span className="num">{roster.on}</span>
        {stale ? <span className="pill pillwarn">지난 날짜 판입니다 — 「지금 어디」는 오늘({roster.today}) 기준이라 참고용입니다</span> : null}
        {who ? <Link className="btn btnghost" href={`/today?on=${roster.on}`}>← 명단으로</Link> : null}
      </div>
      {blocked.length ? (
        <details className="td-fold">
          <summary className="td-foldhd">
            <span className="pill pillbad">지금 못 하는 것 {blocked.length}가지</span>
            <span className="muted">규칙은 열려 있는데 권한이 없습니다</span>
          </summary>
          <div className="td-foldbd">
            <p>
              접근 규칙(RLS)은 원장에게 <b>staff_all</b> 로 열려 있는데, 표 권한(GRANT)이 <b>SELECT 뿐</b>이라
              아래 표에는 한 줄도 못 씁니다 — 눌러도 「permission denied」로 되돌아옵니다.
              0005 가 적어 둔 그 함정입니다: 「규칙만 있고 권한이 없으면 아무도 못 본다 — <b>둘 다</b> 있어야 한다」.
            </p>
            <ul>{blocked.map((t) => <li key={t}><code className="mono">v2.{t}</code></li>)}</ul>
            <p className="muted">
              그래서 출결·마감·부모님께 나갈 글·늦귀가가 지금은 저장되지 않습니다.
              고치는 것은 마이그레이션 한 줄입니다 — 보고의 <b>needsDb</b> 에 적었습니다.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/* ── 명단 ──────────────────────────────────────────────────────── */

function Roster({ roster, picked, sp }) {
  const keep = has(one(sp.on)) ? `&on=${one(sp.on)}` : "";
  return (
    <div className="card">
      <div className="cardhd">
        오늘 수업 <span className="num">{roster.people.length}명</span>
        <span className="muted">고르면 그 아이 판이 아래에 섭니다</span>
      </div>
      {roster.people.length === 0 ? (
        <Why>
          이 날({roster.on})에 수업이 잡힌 반이 없습니다 — <code className="mono">v2.class_schedule</code> 의
          요일에 이 날의 요일이 없거나, 그 반 명단(<code className="mono">v2.class_roster</code> 가 보는 표)이 비어 있습니다.
          보강으로 오는 아이도 <code className="mono">v2.makeup</code> 에 없으면 안 뜹니다.
        </Why>
      ) : (
        <div className="td-roster">
          {roster.people.map((p) => (
            <Link key={`${p.studentId}:${p.classId ?? "mk"}`}
                  className={"td-who" + (p.studentId === picked ? " is-sel" : "")}
                  href={`/today?s=${p.studentId}${keep}`}>
              <span>{p.name}{p.byMakeup ? " · 보강" : ""}</span>
              <span className="muted num">
                {p.startTime ? p.startTime.slice(0, 5) : "시각 모름"}
                {p.sheetId ? ` · 검사 ${p.checks - p.checksLeft}/${p.checks}` : " · 판 없음"}
              </span>
              {p.closedAt ? <span className="pill pillok">마감함</span>
                : p.attend === "absent" ? <span className="pill pillbad">결석</span>
                : p.attend === "late" ? <span className="pill pillwarn">지각</span>
                : p.sheets > 1 ? <span className="pill pillinfo">판 {p.sheets}장</span>
                : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 한 아이 ───────────────────────────────────────────────────── */

function Student({ roster, who, data, routines, sp, can, adjust }) {
  const { one: o, plan, load, says, word, sheetId, sheets } = data;
  const sheet = sheets[0] ?? null;
  return (
    <div className="stack">
      <div className="card">
        <div className="td-head">
          <h2>{o.student?.name ?? who.name}</h2>
          {who.byMakeup ? <span className="pill pillinfo">보강</span> : null}
          <span className="grow" />
          <Attend studentId={who.studentId} on={roster.on} classId={who.classId ?? null}
                  attend={sheet?.attend ?? who.attend} canWrite={!!can.day_sheet?.ins} />
        </div>
        {!sheetId ? (
          <Why>
            이 날 판(<code className="mono">v2.day_sheet</code>)이 아직 없습니다 — 출결을 찍으면 판이 섭니다.
            판이 없으면 검사 줄·시험·늦귀가·부모님께 나갈 글이 붙을 자리가 없습니다.
          </Why>
        ) : null}
        {says.length ? (
          <ul>{says.map((s) => <li key={s}>{s}</li>)}</ul>
        ) : null}
      </div>

      {/* ㉝ 첫 줄 — 둘 다 시작하자마자 확인하는 점수 */}
      <div className="td-pair">
        <WordCard word={word} />
        <ClassCard o={o} />
      </div>

      {/* ① 검사 — 방아쇠. 줄이 여럿이라 넓게 */}
      <CheckCard o={o} plan={plan} who={who} on={roster.on} can={can} />

      {/* ②③ — 교재마다 왼쪽이 학원, 오른쪽이 집 */}
      <PlanCard plan={plan} load={load} o={o} routines={routines} sp={sp} adjust={adjust} />

      {/* ㉝ 넷째 줄 — 점수·결과에서 나오는 뒷일 */}
      <div className="td-pair">
        <UnitTestCard o={o} />
        <div className="card">
          <div className="cardhd">🕘 늦귀가</div>
          {sheetId
            ? <Late sheetId={sheetId} endTime={who.endTime ?? o.end_time}
                    reason={o.late?.[0]?.reason} untilAt={o.late?.[0]?.until_at}
                    leftAt={o.late?.[0]?.left_at} sentAt={o.late?.[0]?.sent_at}
                    suggest={word.reason} canWrite={!!can.late_stay?.ins} />
            : <Why>판이 없어 늦귀가를 적을 자리가 없습니다 — 출결을 먼저 찍습니다.</Why>}
        </div>
      </div>

      {/* ㉝ 다섯째 줄 — 마무리 */}
      <div className="td-pair">
        <ProgressCard o={o} plan={plan} sheetId={sheetId} areaMemo={data.areaMemo} can={can} />
        <CommentCard sheet={sheet} sheetId={sheetId} o={o} can={can} />
      </div>

      <div className="card">
        <div className="cardhd">마감</div>
        {sheetId
          ? <Close sheetId={sheetId} closedAt={sheet?.closed_at ?? null} canWrite={!!can.day_sheet?.upd} />
          : <Why>판이 없어 마감할 것이 없습니다.</Why>}
        <p className="muted">
          마감해야 아이 화면이 「없음」으로 굳습니다. 마감 전에는 「아직 정리 중이에요」로 보입니다 —
          안 그러면 마감 안 한 날과 진짜 없는 날이 아이에게 똑같아 보입니다 (⑮ 3번).
        </p>
      </div>
    </div>
  );
}

/* ── 🔤 단어시험 ───────────────────────────────────────────────── */

function WordCard({ word }) {
  return (
    <div className="card">
      <div className="cardhd">🔤 단어시험</div>
      {word.books.length ? (
        <p className="td-kv"><span className="muted">오늘 볼 것</span>
          <span className="grow">{word.books.map((b) => b.bookName).join(" · ")}</span></p>
      ) : (
        <Why>오늘 볼 단어시험이 없습니다 — 단어 교재 배정이 없거나 그 교재가 <b>교재멈춤</b>입니다(멈춘 교재는 SQL 이 뺍니다).</Why>
      )}
      {word.lines.length ? (
        <div className="col">
          {word.lines.map((l, i) => (
            <p key={i} className="td-kv">
              <span className="chip">{l.part}</span>
              <span className="grow">{l.kind === "sentence" ? "문장" : "단어"} · {l.scope}</span>
              {l.total != null && l.wrong != null
                ? <span className="num">{l.total - l.wrong}/{l.total} · {l.pct}%</span>
                : <span className="num">{l.total ?? "?"}개</span>}
              {l.passed === true ? <span className="pill pillok">통과</span>
                : l.passed === false ? <span className="pill pillbad">미통과</span> : null}
            </p>
          ))}
        </div>
      ) : (
        <Why>
          점수 줄이 없습니다 — <code className="mono">v2.quiz</code> 에 이 판의 시험이 없거나,
          <b>전체 개수·틀린 개수를 안 적어</b> 리포트에 줄이 안 섭니다(값이 없으면 안 내보냅니다 · 원장님 확정).
        </Why>
      )}
      {word.reason ? <p className="pill pillwarn">늦귀가 사유로 그대로 쓸 수 있습니다 — {word.reason}</p> : null}
    </div>
  );
}

/* ── 🃏 클래스카드 플래너 ──────────────────────────────────────── */

function ClassCard({ o }) {
  const rows = o.cc ?? [];
  return (
    <div className="card">
      <div className="cardhd">🃏 클래스카드 플래너</div>
      {rows.length === 0 ? (
        <Why>
          오늘 받아온 세트가 없습니다. <code className="mono">v2.cc_planner</code> 는 지금 전체가
          <b> {o.cc_rows ?? 0}줄</b>이고, 연동 설정(<code className="mono">v2.integration</code> 의 classcard)은
          {o.cc_link ? " 있습니다" : " 아직 없습니다"} — 확장이 크롬에서 돌아야 값이 들어옵니다.
        </Why>
      ) : (
        <div className="col">
          {rows.map((r) => (
            <div key={r.set_name} className="td-kv">
              <span className="grow">{r.set_name}</span>
              <span className="chip">{setTypeName(r.set_type)}</span>
              <span className="num">{r.cards ?? "?"}장</span>
              <Goal r={r} />
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        ⚠️ 「목표 미달」은 <code className="mono">lib/classcard.js</code> 한 곳이 판정합니다 —
        <b>원장님이 켜 두신 모드만</b> 봅니다(안 켠 모드를 0점으로 읽지 않습니다).
        <b>미달이어도 앱이 넘기지 않습니다</b> — 넘기기는 원장님이 누르십니다.
      </p>
      <ul className="muted td-cant">
        {CANNOT_JUDGE.map((x) => (
          <li key={x.what}>· <b>{x.what}</b> — {x.why}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 목표·실제를 그린다. **판정은 `lib/classcard.js` 가 한다** — 여기서 만들지 않는다(원칙 1).
 * ⚠️ 안 켠 모드를 「0점이라 미달」로 읽지 않는 것도 그 lib 이 지킨다.
 */
function Goal({ r }) {
  const j = judgeSet(r);
  if (j.state === "nogoal") return <span className="muted">목표 안 걸림</span>;
  if (j.state === "undone") return <span className="pill pilloff">아직 안 끝냄</span>;
  const 이름 = (m) => MODE_NAME[m] ?? m;
  const 줄 = j.judged.map((m) => `${이름(m)} ${r.got?.[m] ?? 0}/${r.goals?.[m]}`).join(" · ");
  return (
    <>
      <span className="num">{줄}</span>
      {j.state === "short"
        ? <span className="pill pillwarn">목표 미달 {j.short.length}</span>
        : <span className="pill pillok">넘김</span>}
    </>
  );
}

/* ── ① 숙제 검사 ──────────────────────────────────────────────── */

function CheckCard({ o, plan, who, on, can }) {
  const rows = (o.items ?? []).filter((i) => i.slot === "check");
  return (
    <div className="card">
      <div className="cardhd">
        ① 숙제 검사 <span className="muted">집에서 해온 것 — 여기가 방아쇠입니다</span>
      </div>
      {plan.checkOrphans ? (
        <Why>
          오늘 검사 {plan.checkOrphans}줄에 <b>단원이 안 붙어</b> 있습니다
          {plan.checkOrphanMissing ? ` (그중 ✕ ${plan.checkOrphanMissing}줄)` : ""} —
          그 줄들은 진도를 못 올리고 「그 단원 다시」도 못 켭니다.
        </Why>
      ) : null}
      {rows.length === 0 ? (
        <Why>
          검사할 줄이 없습니다 — 지난 시간에 낸 숙제가 오늘 판의 <code className="mono">slot='check'</code> 줄로
          안 넘어와 있습니다. 지금은 <b>판에 줄을 만드는 한 벌이 <code className="mono">lib/</code> 에 없습니다</b>
          (실측 — <code className="mono">insert into v2.day_item</code> 이 어디에도 없습니다).
        </Why>
      ) : (
        <div className="col">
          {rows.map((i) => (
            <div key={i.id} className="td-item">
              <b>{i.name ?? "이름 없는 항목"}</b>
              {i.book_name ? <span className="chip">{i.book_name}</span> : null}
              {/* ⚠️ 단원 이름은 **안 줄인다** (오류 32) */}
              <span className="td-unit">{i.label ?? "⚠️ 단원이 안 붙어 무엇에 대한 것인지 모릅니다"}</span>
              {has(i.range_note) ? <span className="num">{i.range_note}</span> : null}
              <Marks itemId={i.id} studentId={who.studentId} on={on}
                     value={i.status} canWrite={!!can.day_item?.upd} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ②③ 오늘 학습 · 오늘 숙제 ─────────────────────────────────── */

function PlanCard({ plan, load, o, routines, sp, adjust }) {   /* Freeze 가 o·sp·adjust 를 쓴다 */
  const facts = new Map((o.books ?? []).map((b) => [b.book_id, b]));
  return (
    <div className="card">
      <div className="cardhd">
        ② 오늘 학습 · ③ 오늘 숙제
        <span className="muted">검사를 끝내면 여기는 <b>이미 차 있습니다</b> — 손으로 채우는 자리가 아닙니다</span>
      </div>
      <p className="td-kv">
        <span className="chip">합계</span>
        <span className="num">{load.pages}쪽</span>
        <span className="num">{load.questions}문항</span>
        <span className="muted">학원 {load.itemsClass}줄 · 집 {load.itemsHome}줄</span>
        {load.previewPages ? <span className="muted">예습 {load.previewPages}쪽은 따로 셉니다</span> : null}
      </p>

      {plan.books.length === 0 ? (
        <Why>
          이 아이에게 오늘 열린 교재 배정이 없습니다 — <code className="mono">v2.student_book</code> 에
          이 날짜에 걸리는 줄이 없습니다.
        </Why>
      ) : plan.books.map((b) => (
        <div key={b.bookId} className="td-book">
          <div className="td-bookhd">
            <b>{b.name}</b>
            <span className="chip">{b.area ?? "영역 없음"}</span>
            <span className="num">{b.round}회독</span>
            {b.chapter ? <span className="td-unit">{b.chapter}</span> : null}
            {b.stopMode === "hw_off" ? <span className="pill pillwarn">숙제멈춤 — 수업만 합니다</span> : null}
            {b.stopMode === "book_off" ? <span className="pill pilloff">교재멈춤 {b.stopWhy ?? ""}</span> : null}
            {b.again ? <span className="pill pillbad">✕ — 그 단원 다시</span> : null}
            <span className="grow" />
            {facts.get(b.bookId)
              ? <span className="num">진도 {facts.get(b.bookId).done}/{facts.get(b.bookId).total}
                  {facts.get(b.bookId).skipped ? ` (건너뜀 ${facts.get(b.bookId).skipped})` : ""}</span>
              : null}
            {facts.get(b.bookId)?.streak >= 3
              ? <span className="pill pillwarn">{facts.get(b.bookId).streak}회 연속 메모로만 갔습니다</span> : null}
          </div>

          {b.amount?.label ? (
            <p className="td-kv">
              <span className="td-unit">{b.amount.label}</span>
              {b.amount.range ? <span className="num">{b.amount.range}</span> : null}
              {b.amount.pages ? <span className="num">{b.amount.pages}쪽</span> : null}
              {b.amount.questions ? <span className="num">{b.amount.questions}문항</span> : null}
              {b.leftLumps ? <span className="muted">이 대단원에 {b.leftLumps}덩어리 남음</span> : null}
            </p>
          ) : null}

          {b.notes.map((n, i) => <Why key={i}>{n}</Why>)}

          <div className="td-side">
            <Slot title="② 오늘 학습 (학원)" rows={b.class}
                  empty="학원에서 할 것이 없습니다." />
            <Slot title="③ 오늘 숙제 (집)" rows={[...b.home, ...b.next]}
                  empty={b.stopMode === "hw_off"
                    ? "이 교재는 수업만 합니다 — 숙제·예습이 안 나갑니다."
                    : "집에 낼 것이 없습니다."} />
          </div>

          <Adjust book={b} routines={routines} sp={sp} adjust={adjust} />
        </div>
      ))}

      {/* ⚠️ 굳히기는 되돌릴 수 없는 쪽이다 — **미리보기를 먼저** 보여준다(§속도 5) */}
      <Freeze studentId={plan.studentId} on={plan.date} classId={o.sheets?.[0]?.class_id ?? null}
              adjust={adjust} memo={sp?.memo} canWrite={sp?.canWrite !== false} />
    </div>
  );
}

function Slot({ title, rows, empty }) {
  return (
    <div className="td-slot">
      <p className="lbl">{title}</p>
      {rows.length === 0 ? <p className="muted">{empty}</p> : rows.map((r, i) => (
        <div key={`${r.itemId ?? "memo"}:${r.slot}:${i}`} className="td-item">
          {r.byMemo
            ? <><span className="pill pillinfo">메모로 대신함</span><b>{r.memo}</b></>
            : <b>{r.name}{r.slot === "next" ? " · 예습" : ""}</b>}
          {/* ⚠️ **항목마다 단원이 보인다** — 「클카 문장훈련」만 뜨면 무엇인지 모른다 (⑨-a 2번) */}
          <span className="td-unit">{r.label}</span>
          {has(r.rangeNote) ? <span className="num">{r.rangeNote}</span> : null}
          {r.gatePrev ? <span className="chip">앞엣것을 끝내야 열림</span> : null}
          {r.countN ? <span className="num">{r.countN}개</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * 조절 — **교재마다 한 번 열어 갯수만 정한다** (㉓). 안 누르면 화면에 보이는 그대로 나간다.
 * ⚠️ 숫자를 바꿔 「이대로 보기」를 누르면 **어느 소단원이 · 몇 쪽 · 몇 문항**인지 위 줄에 그대로 뜬다
 *    (오류 30·53). 숫자만 보고 정하면 무엇이 나가는지 모른 채 저장한다.
 */
function Adjust({ book, routines, sp, adjust }) {
  const items = routines?.get(book.area) ?? [];
  const mine = [`n_${book.bookId}`, `g_${book.bookId}`, `d_${book.bookId}`,
                `mc_${book.bookId}`, `mh_${book.bookId}`];
  const dropped = new Set(adjust[book.bookId]?.drop ?? []);
  return (
    <details className="td-fold">
      <summary className="td-foldhd">조절 — 갯수 · 분량 · 뺄 항목 · 메모</summary>
      <div className="td-foldbd">
        <form method="get" action="/today">
          <Keep sp={sp} mine={mine} />
          <div className="row">
            <div className="grow">
              <label className="lbl" htmlFor={`n_${book.bookId}`}>갯수 (회차에 낼 덩어리 수)</label>
              <input id={`n_${book.bookId}`} name={`n_${book.bookId}`} type="number" min="1" max="12"
                     defaultValue={adjust[book.bookId]?.count ?? book.perSession} />
            </div>
            <div className="grow">
              <label className="lbl" htmlFor={`g_${book.bookId}`}>분량 (쪽) — 비우면 통째로</label>
              <input id={`g_${book.bookId}`} name={`g_${book.bookId}`} type="number" min="1"
                     defaultValue={adjust[book.bookId]?.pages ?? ""} />
            </div>
          </div>
          <div className="row">
            <div className="grow">
              <label className="lbl" htmlFor={`mc_${book.bookId}`}>학습 메모 — 적으면 그것이 그날의 ②가 됩니다</label>
              <input id={`mc_${book.bookId}`} name={`mc_${book.bookId}`} defaultValue="" placeholder="교재 없이 구두로 한 날" />
            </div>
            <div className="grow">
              <label className="lbl" htmlFor={`mh_${book.bookId}`}>숙제 메모</label>
              <input id={`mh_${book.bookId}`} name={`mh_${book.bookId}`} defaultValue="" />
            </div>
          </div>
          <p className="lbl">뺄 항목</p>
          {items.length === 0
            ? <p className="muted">「{book.area ?? "영역 없음"}」 영역에 루틴이 한 줄도 없습니다.</p>
            : items.map((it) => (
                <label key={it.item_id} className="td-kv">
                  <input type="checkbox" name={`d_${book.bookId}`} value={it.item_id}
                         defaultChecked={dropped.has(String(it.item_id))} />
                  <span className="grow">{it.name}</span>
                  <span className="chip">{it.place === "class" ? "학원" : it.place === "home" ? "집"
                    : it.place === "both" ? "학원+집" : it.place}</span>
                </label>
              ))}
          <div className="mdlf">
            <button type="submit" className="btn btnmain">이대로 보기</button>
          </div>
        </form>
        <p className="muted">
          ⚠️ 이 조절은 <b>아직 어디에도 저장되지 않습니다</b> — 주소줄에 실려 초안을 다시 차릴 뿐입니다.
          그리고 <b>더하기·차례 바꾸기는 아직 못 합니다</b>(<code className="mono">lib/routine.js</code> 가
          「뺄 항목」만 받습니다). 화면에서 만들면 규칙이 두 벌이 됩니다.
        </p>
      </div>
    </details>
  );
}

/* ── 📝 단원평가 ──────────────────────────────────────────────── */

function UnitTestCard({ o }) {
  const rows = o.unit_tests ?? [];
  return (
    <div className="card">
      <div className="cardhd">📝 단원평가 <span className="muted">교재와 무관합니다 — 문법 분류로 냅니다</span></div>
      {rows.length === 0 ? (
        <Why>
          이 아이에게 잡힌 단원평가가 없습니다 — <code className="mono">v2.unit_test</code> 에 줄이 없습니다.
          문법 분류(<code className="mono">v2.grammar_topics</code>)는 지금 <b>{o.topics ?? 0}줄</b>입니다
          {o.topics ? "" : " — 분류가 없으면 낼 이름도 안 뜹니다"}.
        </Why>
      ) : (
        <div className="col">
          {rows.map((t) => (
            <div key={t.id} className="td-kv">
              <span className="grow">{t.topic ?? "분류 없음"}</span>
              <span className="chip">{t.state}</span>
              {t.correct != null && t.q_count != null
                ? <span className="num">{t.correct}/{t.q_count}</span>
                : <span className="muted">점수 안 적음</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 📊 진도 · 영역 메모 ──────────────────────────────────────── */

function ProgressCard({ o, plan, sheetId, areaMemo, can }) {
  const books = o.books ?? [];
  return (
    <div className="card">
      <div className="cardhd">📊 진도 · 영역 메모</div>
      {books.length === 0 ? (
        <Why>배정된 교재가 없어 진도가 없습니다.</Why>
      ) : books.map((b) => (
        <div key={b.book_id} className="td-kv">
          <span className="grow">{b.name}</span>
          <span className="chip">{b.area ?? "영역 없음"}</span>
          <span className="num">{b.done}/{b.total}</span>
          {b.skipped ? <span className="muted">건너뜀 {b.skipped}</span> : null}
          {b.stop !== "running" ? <span className="pill pilloff">{b.stop === "hw_off" ? "숙제멈춤" : "교재멈춤"}</span> : null}
        </div>
      ))}
      {plan.stale ? <Why>지난 날짜 판이라 진도는 오늘 기준입니다 — 그날 것과 다를 수 있습니다.</Why> : null}
      {/* ⚠️ 영역 메모 — **교재 메모와 다른 것이다.** 교재 메모는 「그 교재 그 회차」에 붙고(「조절」 안),
        *    이것은 **그날 그 아이의 총평**이다(⑨-a). 담는 곳은 `v2.day_area_memo`(0079) 다 */}
      <div className="td-areas">
        {AREAS.map((a) => (
          <AreaMemo key={a} sheetId={sheetId} area={a} value={areaMemo?.[a] ?? ""}
                    canWrite={!!can?.day_area_memo?.ins} />
        ))}
      </div>
      <p className="muted">
        ⚠️ 이 줄은 <b>아이·학부모에게 그대로 나갑니다</b> — 마감해야 보입니다.
        원장님만 볼 말은 아래 「원장 메모」에 적으세요.
        교재마다의 학습·숙제 메모는 위 「조절」에 있습니다.
      </p>
    </div>
  );
}

/* ── ✉️ 부모님께 나갈 글 ──────────────────────────────────────── */

function CommentCard({ sheet, sheetId, o, can }) {
  const w = !!can.day_sheet?.upd;
  return (
    <div className="card">
      <div className="cardhd">✉️ 부모님께 나갈 글</div>
      {!sheetId ? <Why>판이 없어 적을 자리가 없습니다 — 출결을 먼저 찍습니다.</Why> : (
        <Comment sheetId={sheetId} canWrite={w} value={sheet?.comment ?? ""}
                 hint="간접의문문 · 어순 스스로 설명 · 워크북 오답 3개" />
      )}
      <Why>
        키워드만 적으면 AI 가 살을 붙이는 자리(오류 34)는 <b>4단계</b>입니다 — 아직 없습니다.
        말투를 잡아 줄 본보기 문장(<code className="mono">v2.comment_sample</code>)도 지금 <b>{o.samples ?? 0}줄</b>이라,
        지금 붙이면 원장님 말투가 아닌 글이 나갑니다.
      </Why>
      <Why>
        <b>원장님만 볼 메모</b> 칸은 안 만들었습니다 — 그 칸을 읽는 길이
        <code className="mono"> lib/close.js</code> 한 곳으로 못 박혀 있고 전수 검사가 그것을 지킵니다.
        화면이 몰래 읽으면 「가리는 목록에서 한 줄 빠뜨리기」를 막던 방벽이 그날로 없어집니다(사고 #7).
        원장 화면에 내려 줄 한 벌이 서면 그때 붙입니다.
      </Why>
    </div>
  );
}

/* ── 속도 — 감추지 않는다 ─────────────────────────────────────── */

function Speed({ n, log, picked }) {
  if (n <= QUERY_CAP) {
    return <p className="muted num">이 화면이 조회 {n}번 (상한 {QUERY_CAP})</p>;
  }
  return (
    <details className="td-fold">
      <summary className="td-foldhd">
        <span className="pill pillwarn">조회 {n}번 — 상한 {QUERY_CAP}을 넘었습니다</span>
      </summary>
      <div className="td-foldbd">
        <p>
          이 화면이 스스로 쓴 조회는 {picked ? "셋" : "하나"}입니다. 나머지는
          <code className="mono"> lib/routine.js</code> 의 숙제 차리기가 씁니다 —
          교재 한 권마다 커서 · 단원 · 조각 · 다음 단원을 <b>따로</b> 물어봅니다.
          실측(2026-09-02 · 교재 5권)으로 그 한 벌이 <b>21번</b>이었습니다.
        </p>
        <p className="muted">
          줄이는 길은 화면이 아니라 DB 쪽입니다(한 번에 답하는 함수). 보고의 <b>needsDb</b> 에 적었습니다.
        </p>
        <p className="mono">{log.join(" · ")}</p>
      </div>
    </details>
  );
}
