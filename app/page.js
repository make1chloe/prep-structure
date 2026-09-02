/**
 * 대시보드 `/` — **로그인 첫 화면이자 알림센터.**
 *
 * ⚠️⚠️ 여기에 있는 것은 **「원장님이 안 하면 앱이 부르는 것」뿐이다.**
 *    「할 일 생겼습니다」 같은 카드는 만들지 않는다 — 원장님이 뺀 것이다.
 *    보드도 넷이 아니라 **「내 할 일」 하나**고, 바깥 축은 **할 일 종류**다(절 ㊴).
 *    학교는 **거르개 한 줄**이다 — 바깥 축으로 두면 인쇄 목록이 다섯 군데로 흩어진다.
 *
 * ⚠️ **판단은 한 줄도 여기 없다.** 세는 것·가르는 것은 `lib/` 과 `v2.` 함수가 한다.
 *    이 파일은 `app/_home/read.js` 가 받아 온 것을 **그리기만** 한다.
 *
 * ⚠️ **탭이 없다** (계획 「속도」 1). 급한 차례로 한 화면에 세우고 **접기로 줄인다** —
 *    접기는 다시 조회하지 않는다.
 *
 * ⚠️ **빈 것도 그대로 보인다** (⑮ 3 · 물음 T). 「이 아이 오늘 숙제 0개」가 남아 있어야
 *    빠뜨린 것을 잡는다. 숨기는 것은 **아이·학부모 화면뿐**이다.
 *
 * ⚠️ **자료가 없어 비면, 「무엇이 없어서 비었나」를 화면에 밝힌다** (대전제 0).
 *    빈 화면을 예쁘게 만들지 않는다.
 *
 * ── 속도 (계획 「속도」 절 · 지금 앱 `/` 는 조회 ~85 · 직렬 ~19단) ──────────────
 *   첫 그림이 기다리는 것은 **문 하나 · 조회 하나**뿐이다 (맨 위 두 줄).
 *   나머지 카드는 **뒤에 채운다** — `<Suspense>` 로 흘려 보내고, 실패한 것은 **캐시하지 않는다**
 *   (`dynamic = "force-dynamic"` — 이 화면은 한 번도 캐시되지 않는다).
 *   실측은 `node scripts/check-screen-home.mjs` 가 **진짜 DB 에 붙어** 센다.
 */

import { Suspense } from "react";
import { cookies } from "next/headers";
import LogoutButton from "./logout-button";
import { serverClientFromStore, roleOf } from "../lib/supabase-server.js";
// ⚠️ 마감 전·후에 아이 화면에 뜨는 **글자를 여기서 지어내지 않는다.** `lib/close.js` 한 벌이다 —
//    베껴 적으면 lib 쪽 문구를 고치는 날 대시보드만 옛 글을 말한다 (원칙 1).
import { PREPARING, NOTHING } from "../lib/close.js";
import { readFrame, readWaiting, readSessions, readBooks, readTodos } from "./_home/read.js";
import { CardDeck, EditOpenLine, Fold, TodoBoard } from "./_home/parts.js";

// ⚠️ `pg` 를 쓰므로 edge 가 아니라 node 여야 한다
export const runtime = "nodejs";
// ⚠️ 알림센터가 캐시되면 **어제 숫자를 오늘 것처럼** 보여 준다. 그리고 「실패한 것은 캐시하지 않는다」
export const dynamic = "force-dynamic";

/** ⚠️ 문지기는 **v2 를 못 읽을 때 아무도 안 옮긴다** (middleware.js 의 ⚠️ 그대로).
 *    그러면 학생·학부모가 `/` 에 그대로 선다 — **이 화면이 스스로 봐야 한다.** */
const STAFF = new Set(["principal", "instructor"]);

export default async function Home() {
  const gate = await who();
  if (!gate.ok) return <Blocked why={gate.why} />;

  // ⚠️ 판 카드는 오늘 날짜가 필요 없다 — **먼저 띄워 두고** 맨 위 줄과 같이 달리게 한다
  const waiting = readWaiting(gate.id);
  const frame = await readFrame(gate.id);       // 첫 그림이 기다리는 유일한 조회

  if (!frame.ok)
    return (
      <main className="wrap stack">
        <Head today={null} />
        <Empty title="맨 위 줄을 못 읽었습니다" why={frame.why} />
        <LogoutButton />
      </main>
    );

  const f = frame.value;
  const sessions = readSessions(gate.id, f.today);
  const books = readBooks(gate.id);
  const todos = readTodos(gate.id, f.today);

  const labels = {
    waiting: "확인 기다리는 중",
    sheets: "판 — 마감과 발송",
    sessions: "회차 · 보강",
    books: "교재",
    fee: "수강료",
    todos: "내 할 일",
  };
  const ids = ["waiting", "sheets", "sessions", "books", "fee", "todos"];

  return (
    <main className="wrap stack">
      <Head today={f.today} />

      {/* ⚠️⚠️ 절 ㊶ — **켜 놓고 잊는 것을 막는 장치가 이 한 줄뿐이다.** 맨 위에 선다 */}
      {f.editOpen && <EditOpenLine days={f.editDays} from={f.editFrom} />}

      {/* ⚠️ 크론이 이틀 넘게 안 돌면 한 줄. **안 돌 때만 부른다** */}
      <CronLine on={f.cronOn} gap={f.cronGap} />

      <CardDeck ids={ids} labels={labels} initial={f.order}>
        <Suspense fallback={<Loading what="아이가 찍은 진도" />}><Waiting p={waiting} /></Suspense>
        <Suspense fallback={<Loading what="판" />}><Sheets p={waiting} /></Suspense>
        <Suspense fallback={<Loading what="회차" />}><Sessions p={sessions} /></Suspense>
        <Suspense fallback={<Loading what="교재" />}><Books p={books} /></Suspense>
        <Suspense fallback={<Loading what="수강료" />}><Fee p={books} /></Suspense>
        <Suspense fallback={<Loading what="할 일" />}><Todos p={todos} /></Suspense>
      </CardDeck>

      {/* ⚠️ 대전제 10 — 홈 화면에 깐 앱엔 주소창도 뒤로가기도 없다. 닫는 길은 **늘 화면 안에** */}
      <LogoutButton />
    </main>
  );
}

/* ══ 문지기 — 「누구인가」는 `lib/supabase-server.js` 한 곳을 지난다 ═══════════════ */
async function who() {
  try {
    const supabase = serverClientFromStore(await cookies());
    const { user, role, msg, why } = await roleOf(supabase);
    if (!user)
      return { ok: false, why: "로그인이 안 돼 있습니다 — 로그인 화면으로 가 주세요." };
    if (!STAFF.has(String(role)))
      return {
        ok: false,
        why: role
          ? `이 화면은 원장·강사 것입니다 (지금 역할: ${role}).`
          : `역할을 못 읽었습니다 — ${msg || why || "까닭을 모릅니다"}`,
      };
    return { ok: true, id: user.id };
  } catch (e) {
    // ⚠️ 실측 2026-09-02 — `.env.local` 에 **NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없어서**
    //    로그인 클라이언트를 아예 못 만든다. 여기로 온다. 지어내지 말고 그 말을 그대로 띄운다.
    return { ok: false, why: String(e?.message ?? e) };
  }
}

/* ══ 머리·막힘·기다림 ═══════════════════════════════════════════════════════════ */

function Head({ today }) {
  return (
    <header>
      <h1 style={{ marginBottom: "var(--s1)" }}>알림센터</h1>
      <p className="muted" style={{ marginBottom: 0 }}>
        원장님이 안 하시면 <strong>앱이 먼저 부르는 것</strong>만 있습니다.
        {today && <> · 오늘 <span className="num">{today}</span></>}
      </p>
    </header>
  );
}

function Blocked({ why }) {
  return (
    <main className="wrap stack">
      <Head today={null} />
      <Empty title="이 화면을 열 수 없습니다" why={why} />
      <LogoutButton />
    </main>
  );
}

/** ⚠️ 빈 화면을 예쁘게 만들지 않는다 — **무엇이 없어서 비었는지**를 적는다 (대전제 0) */
function Empty({ title, why }) {
  return (
    <section className="card">
      <div className="cardhd">{title}</div>
      <p className="sunk" style={{ margin: 0, color: "var(--bad-fg)", background: "var(--bad-bg)" }}>
        {why}
      </p>
    </section>
  );
}

function Loading({ what }) {
  return <p className="muted" style={{ margin: 0 }}>{what} 세는 중…</p>;
}

/** 카드 하나가 못 읽었을 때 — **화면 전체를 죽이지 않는다** */
function Broke({ why }) {
  return (
    <p className="sunk" style={{ margin: 0, color: "var(--bad-fg)", background: "var(--bad-bg)" }}>
      ⚠️ 못 읽었습니다 — {why}
    </p>
  );
}

/** 아직 아무도 정하지 않은 것 — **숫자를 지어내지 않는다** (대전제 0) */
function NotYet({ what, why }) {
  return (
    <p className="sunk" style={{ margin: 0, color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
      ⚠️ <strong>{what}</strong> — 아직 못 셉니다. {why}
    </p>
  );
}

/* ══ 크론 ═════════════════════════════════════════════════════════════════════
 * ⚠️ **안 돌 때만 부른다.** 잘 돌 때 매일 한 줄이 서면 그 줄을 아무도 안 읽게 된다.  */
function CronLine({ on, gap }) {
  if (on && gap != null && gap <= 2) return null;      // 잘 돌고 있다 — 아무 말도 안 한다
  const 말 = on
    ? `크론이 ${gap}일째 안 돌았습니다 (마지막 ${on})`
    : "크론이 한 번도 안 돌았습니다";
  return (
    <p className="sunk" style={{ margin: 0, color: "var(--bad-fg)", background: "var(--bad-bg)" }}>
      ⚠️ {말} — 예약 발송·파기·되풀이 할일이 <strong>그동안 안 나갔습니다.</strong>{" "}
      <span className="muted" style={{ color: "inherit" }}>
        (Vercel 크론과 <span className="mono">CRON_SECRET</span> 을 확인해 주세요)
      </span>
    </p>
  );
}

/* ══ 카드 여섯 ═════════════════════════════════════════════════════════════════ */

/** ① 확인 기다리는 중 — 아이가 찍은 진도 · ❗이의 (절 ㊶ ②·④) */
async function Waiting({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const { marks, flags } = r.value;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        아이가 찍은 진도 <Big n={marks.length} bad={marks.length > 0} />개 ·{" "}
        ❗진도 이의 <Big n={flags.length} bad={flags.length > 0} />개
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "var(--fs2)" }}>
        아이가 찍은 줄은 <strong>확인하기 전까지 노란 테두리</strong>로 섭니다 —
        잘못 건드린 것이 눈에 띄라고 그렇게 둡니다. ❗는 진도를 안 바꿉니다.
      </p>
      <Fold title="아이가 찍은 것" count={marks.length} open={marks.length > 0}>
        {marks.length === 0
          ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
          : <Rows head={["아이", "단원", "회독", "찍은 것"]}
                  rows={marks.slice(0, 50).map((m) => [
                    m.student_name, m.label, String(m.round), m.status])} />}
      </Fold>
      <Fold title="❗ 아직 안 본 이의" count={flags.length} open={flags.length > 0}>
        {flags.length === 0
          ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
          : <Rows head={["아이", "단원", "갈래", "아이 말"]}
                  rows={flags.slice(0, 50).map((x) => [
                    x.student_name, x.label, x.kind, x.said ?? "—"])} />}
      </Fold>
    </div>
  );
}

/** ② 판 — 「마감 안 한 판」과 「안 보낸 판」은 **다른 사실이다** */
async function Sheets({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const s = r.value.sheet;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        마감 안 한 판 <Big n={s.openN} bad={s.openN > 0} />개 ·{" "}
        마감했는데 안 보낸 판 <Big n={s.unsentN} bad={s.unsentN > 0} />개
        {s.oldestOpen && <> · 가장 오래된 것 <span className="num">{s.oldestOpen}</span></>}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "var(--fs2)" }}>
        오늘까지의 판 <span className="num">{s.allN}</span>개 가운데 셉니다.
        <strong> 마감을 해야 아이 화면이 「{NOTHING}」으로 굳습니다</strong> —
        마감 전에는 「{PREPARING}」로 서서, 마감 안 한 날과 진짜 없는 날이 구별됩니다.
      </p>
      {s.openN > 0 && s.openN === s.allN && (
        <p className="sunk" style={{ margin: 0, color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
          ⚠️ <strong>판이 하나도 마감되지 않았습니다.</strong> 이관해 온 판은 마감 자취가 없어서
          그렇습니다 — 옛 앱에서도 마감 칸은 한 번도 안 쓰였습니다.
          그래서 「안 보낸 판」은 지금 늘 0 으로 보입니다.
        </p>
      )}
    </div>
  );
}

/** ③ 회차 · 보강 */
async function Sessions({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const { ym, classes } = r.value;
  const short = classes.filter((c) => !c.enough);
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        <span className="num">{ym}</span> — 여덟 회를 못 채우는 반{" "}
        <Big n={short.length} bad={short.length > 0} />개 (반 전체 <span className="num">{classes.length}</span>개)
      </p>
      {/* ⚠️ 지어내지 않는다 — **아이마다 몇 회 모자란지는 여기서 안 센다.** 까닭을 적는다 */}
      <NotYet
        what="보강 잡을 것 N명 (아이 목록)"
        why={
          "아이별 셈은 lib/session.js 의 makeupTargets() 가 하는데, 반 하나마다 조회 넷을 씁니다 — " +
          "반이 여덟이면 조회 서른둘이라 이 화면의 상한(조회 20 · 직렬 5) 밖입니다. " +
          "여기서는 **반까지만** 세고, 아이 목록은 일정 화면에서 봅니다."
        }
      />
      <Fold title="반마다 이 달 회차" count={classes.length} open={short.length > 0}>
        <Rows
          head={["반", "갈래", "지난 회", "앞날", "이 달 전체", "모자람"]}
          rows={classes.map((c) => [
            c.label, c.kind === "special" ? "특강" : "정규",
            String(c.done), String(c.planned), String(c.total),
            c.enough ? "—" : `${c.short}회`,
          ])}
        />
      </Fold>
      <p className="muted" style={{ margin: 0, fontSize: "var(--fs2)" }}>
        여덟 회 판정은 <strong>그 달 전체</strong>로 합니다 — 오늘까지로 하면 매달 1일에 모든 반이
        빨갛게 떠서 헛보강을 잡게 됩니다. ⚠️ 특강도 여덟 회를 채워야 하는지는 <strong>확인 안 됨</strong>입니다.
      </p>
    </div>
  );
}

/** ④ 교재 — 끝나감 · 메모로만 · 멈춤 */
async function Books({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const books = r.value.books;
  // ⚠️ 멈춘 교재는 재촉에서 뺀다 (절 ⑬ 2) — 안 빼면 멈춘 교재가 매주 원장님을 부른다
  const 도는것 = books.filter((b) => b.stop === "running" || b.stop == null);
  const 메모 = 도는것.filter((b) => b.memoN >= 3).sort((a, b) => b.memoN - a.memoN);
  const 끝나감 = 도는것.filter((b) => b.total > 0).sort((a, b) => a.left - b.left).slice(0, 10);
  const 멈춤 = books.filter((b) => b.stop === "book_off" || b.stop === "hw_off");

  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        도는 교재 <span className="num">{도는것.length}</span>권 ·{" "}
        메모로만 세 번 넘게 간 교재 <Big n={메모.length} bad={메모.length > 0} />권 ·{" "}
        멈춘 교재 <span className="num">{멈춤.length}</span>권
      </p>

      <Fold title="이 교재, 메모로만 갔습니다" count={메모.length} open={메모.length > 0}
            note="메모가 습관이 되면 진도가 실제보다 앞섭니다 — 교재를 안 폈는데 단원이 쌓입니다. 부르기만 하고 막지는 않습니다.">
        {메모.length === 0
          ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
          : <Rows head={["아이", "교재", "회독", "연속"]}
                  rows={메모.slice(0, 30).map((b) => [
                    b.studentName, b.bookName, String(b.round), `${b.memoN}회`])} />}
      </Fold>

      <Fold title="교재가 끝나갑니다 (남은 단원이 적은 차례)" count={끝나감.length}>
        <p className="sunk" style={{ margin: "0 0 var(--s2)", color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
          ⚠️ <strong>「끝나감」의 기준(몇 단원 남았을 때 부를지)이 아직 안 정해졌습니다</strong> —
          <span className="mono"> v2.auto_rule</span> 이 비어 있습니다(실측 0줄). 그래서 기준으로 거르지 않고
          <strong> 남은 단원이 적은 열 권</strong>만 세워 둡니다.
        </p>
        {끝나감.length === 0
          ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
          : <Rows head={["아이", "교재", "회독", "끝냄", "건너뜀", "남음", "전체"]}
                  rows={끝나감.map((b) => [
                    b.studentName, b.bookName, String(b.round),
                    String(b.done), String(b.skipped), String(b.left), String(b.total)])} />}
      </Fold>

      {/* ⚠️ 지어내지 않는다 — 「N주째 같은 대단원」은 셈이 아직 아무 데도 없다 */}
      <NotYet
        what="이 아이 이 교재가 N주째 같은 대단원에 서 있습니다"
        why={
          "「대단원이 언제부터 안 넘어갔나」를 세는 자리가 lib/ 에도 v2. 함수에도 없습니다. " +
          "여기서 새로 만들면 커서 판단이 두 벌이 됩니다(원칙 1). 필요한 DB 함수를 보고에 적어 두었습니다 — " +
          "그것이 서면 이 자리가 저절로 찹니다. ⚠️ 멈춘 기간은 그 셈에서 빼야 합니다(절 ⑬ 2)."
        }
      />

      <Fold title="멈춘 교재" count={멈춤.length}
            note="교재멈춤(book_off)은 학습도 숙제도 안 나가고, 숙제멈춤(hw_off)은 수업만 합니다.">
        {멈춤.length === 0
          ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
          : <Rows head={["아이", "교재", "회독", "상태"]}
                  rows={멈춤.slice(0, 50).map((b) => [
                    b.studentName, b.bookName, String(b.round),
                    b.stop === "book_off" ? "교재멈춤" : "숙제멈춤"])} />}
      </Fold>
    </div>
  );
}

/** ⑤ 수강료 */
async function Fee({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const f = r.value.fee;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        <span className="num">{f.ym}</span> — 재원생 <span className="num">{f.activeN}</span>명 가운데{" "}
        수납 줄이 아예 없는 아이 <Big n={f.noRow} bad={f.noRow > 0} />명 ·{" "}
        금액이 안 적힌 줄 <Big n={f.noAmount} bad={f.noAmount > 0} />개 ·{" "}
        낸 날이 빈 줄 <Big n={f.noPaid} bad={f.noPaid > 0} />개
      </p>
      <NotYet
        what="미납 N명"
        why={
          "「며칠이 지나면 미납인가」가 계획서에도 v2.auto_rule 에도 없습니다(실측 0줄). " +
          "기준을 지어내면 원장님이 안 보셔도 될 아이가 빨갛게 뜹니다. 그래서 **본 것만** 적었습니다 — " +
          "규칙을 정하시면 `v2.auto_rule` 한 줄로 넣습니다(자동화 뼈대 ⑤)."
        }
      />
      <p className="muted" style={{ margin: 0, fontSize: "var(--fs2)" }}>
        금액이 비어 있으면 <strong>0원이 아니라 「아직 안 적음」</strong>입니다.
      </p>
    </div>
  );
}

/** ⑥ 내 할 일 — 바깥 축은 **할 일 종류**, 학교는 **거르개 한 줄** (절 ㊴) */
async function Todos({ p }) {
  const r = await p;
  if (!r.ok) return <Broke why={r.why} />;
  const t = r.value;
  return (
    <TodoBoard
      groups={t.groups}
      aside={t.aside}
      filters={t.filters}
      counts={t.counts}
      moved={t.moved}
      lateN={t.lateN}
    />
  );
}

/* ══ 작은 것 ═══════════════════════════════════════════════════════════════════ */

/** 숫자 하나 — ⚠️ **투명도로 흐리게 하지 않는다.** 「덜 중요함」은 색으로 (계획 ㉑) */
function Big({ n, bad = false }) {
  return (
    <strong className="num" style={{ fontSize: "var(--fs8)", color: bad ? "var(--bad)" : "var(--mid)" }}>
      {n}
    </strong>
  );
}

/**
 * ⚠️ 표는 **반드시** `.tblwrap` 안에 넣는다 — 안 그러면 폰에서 부모를 밀어낸다.
 * ⚠️ `.num` 은 **안 접히는 칸**이다(nowrap). 한글을 넣으면 긴 단원 이름이 표를 밀어내므로
 *    **숫자·날짜 모양일 때만** 붙인다.
 */
const 숫자칸 = (v) => /^[0-9][0-9.\-/:]*\s*(회|개|명|쪽|%|일)?$/.test(String(v ?? ""));

function Rows({ head, rows }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead><tr className="hdstick">{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (
              <td key={j} className={숫자칸(c) ? "num" : undefined}>{c ?? "—"}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
