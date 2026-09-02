/**
 * 운영 `/ops` — **돈 · 상담 · 신규.** 한 달에 몇 번 여는 화면이다.
 * (계획 5단계 · 3단계의 수강료 절 · 「처음부터 넣는 것 ①」 돈의 이력)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *
 * ── 세우는 차례 (급한 것이 위. **탭이 없다** — 탭 전환은 화면 전체 재조회다)
 *      🆕 신규 문의   전화 끊고 **바로** 적는 자리라 맨 위다. 폼이 늘 펴져 있다
 *      💳 수강료      한 달에 한 번. **금액 넣고 받은 날 체크가 전부**다
 *      🗒 상담일지    아이마다 모아 본다
 *
 * ── ⚠️⚠️ **청구서를 만들지 않는다** (오류 대장 83 — 계획이 통째로 틀렸던 자리).
 *    · **정규는 월정액**이고 회차와 무관하다 — 회차를 곱하면 안 된다.
 *    · **특강만 회차만큼** 받는다(5회면 5회분). 그래도 **곱셈은 화면이 안 한다** —
 *      단가 줄과 회차를 나란히 보이고 금액은 원장님이 적으신다.
 *    · **금액이 비면 0원이 아니라 「아직 안 적음」**이다.
 *
 * ── ⚠️ **역할을 스스로 본다.** 문지기는 첫 화면만 고르고 역할로 화면을 안 지킨다
 *    (`middleware.js` 주석의 실측 — 학생 세션으로 `/parent` 가 200 이었다).
 *    이 화면은 **수강료·상담일지·학부모 전화**를 읽는다. 앱에서 제일 민감한 자리다.
 *
 * ── ⚠️⚠️ **강사에게는 수강료 부분만 안 보인다** (원장님 2026-09-03: 「아니 강사는 수강료 설정 못보게」).
 *    상담일지·신규 문의는 **강사도 본다** — 원장님이 그 둘은 안 집으셨다.
 *    그래서 화면을 통째로 막지 않고 **수강료 카드 하나만** 뺀다.
 *    ⚠️ 안 그리는 것으로 끝내지 않고 **조회 자체를 안 한다**(`loadFee`·`loadSpecial`) —
 *       안 보일 자료를 읽어 오면 조회 상한만 먹고, 다음 사람이 「이미 읽었으니 그리자」로 되돌린다.
 *    ⚠️⚠️ **이것은 화면 가리개일 뿐이다.** `v2.fee_rule`·`v2.payment` 의 접근 규칙은
 *       `staff_all … using (v2.is_staff())` 하나뿐이고 `is_staff()` 에 강사가 든다(2026-09-03 실측).
 *       강사가 PostgREST 로 직접 물으면 수강료가 그대로 나온다 — **DB 쪽은 아직 안 막혔다.**
 * ── ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 * ── ⚠️ **퇴원생은 재원 기간만 보인다** (파기와 부딪힌다). 못 그린 줄은 **개수를 밝힌다.**
 */
import Link from "next/link";
import "./ops.css";
import LogoutButton from "../logout-button";
import { staffOnly } from "./who.js";
// ⚠️ 「강사에게 수강료를 보이나」는 `lib/menu.js` 한 곳이 판단한다 (대전제-4 · 원칙-1).
//    메뉴에서 가리는 것과 화면에서 가리는 것이 **같은 함수**여야 두 벌이 안 된다.
import { canSeeFees } from "../../lib/menu.js";
import { openAs, QUERY_CAP, SPECIAL_BUDGET } from "./db.js";
import { loadHead, loadFee, loadInquiry, loadConsult, loadSpecial } from "./read.js";
import { PayLine, FeeRules, InquiryBox, InquiryLine, ConsultBox } from "./ui.js";

// ⚠️ 돈·상담이 캐시되면 **어제 숫자를 오늘 것처럼** 보여 준다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "운영 · 클로이영어" };

const YM = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-fA-F-]{36}$/;
const one = (v) => (Array.isArray(v) ? v[0] : v);
const won = (n) => (n == null ? "—" : Number(n).toLocaleString("ko-KR"));

/** 진행 중인 문의 — 끝난 것(등록·안 옴)과 가른다. **가르기만 하고 안 지운다** (대전제 6) */
const OPEN_STAGE = new Set(["new", "test", "visit"]);

export default async function Ops({ searchParams }) {
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}));

  const me = await staffOnly();
  if (!me.ok) return <Blocked title="운영" msg={me.msg} how={me.how} />;

  const conn = await openAs(me.profileId);
  if (!conn.ok) return <Blocked title="운영" msg={conn.why} how={[]} />;

  try {
    // ⚠️ 달 모양이 아니면 **주소줄 값을 안 믿는다.** 비워 보내면 DB 가 「학원의 오늘」로 채운다
    const asked = String(one(sp.m) ?? "");
    const head = await loadHead(conn.db, YM.test(asked) ? asked : null);

    // ⚠️ 강사면 수강료를 **아예 안 읽는다.** 판단은 `lib/menu.js` 한 곳(대전제-4)
    const 수강료 = canSeeFees(me.role);

    const fee = 수강료 ? await loadFee(conn.db, head.ym) : null;
    const inquiries = await loadInquiry(conn.db);
    const pickedId = UUID.test(String(one(sp.s) ?? "")) ? one(sp.s) : null;
    const consult = await loadConsult(conn.db, pickedId);

    // 특강 아이만 회차를 센다 (`lib/session.js`). 정규는 월정액이라 안 부른다
    const special = 수강료
      ? await loadSpecial(conn.db, fee.people, head.ym, head.today, { budget: SPECIAL_BUDGET })
      : null;

    const can = head.canWrite ?? {};
    const canPay = can.payment?.ins === true && can.payment?.upd === true;
    const picked = consult.byStudent.find((s) => s.id === pickedId) ?? null;

    return (
      <main className="wrap">
        <div className="stack">
          <Head head={head} can={can} />

          {/* ① 전화 끊고 바로 — 맨 위 */}
          <section className="card">
            <div className="cardhd">
              🆕 신규 문의
              <span className="num">진행 중 {inquiries.filter((i) => OPEN_STAGE.has(i.stage)).length}건</span>
            </div>
            <InquiryBox rows={inquiries.filter((i) => OPEN_STAGE.has(i.stage))}
                        classes={head.classes} today={head.today}
                        canWrite={can.inquiry?.ins === true}
                        canEnroll={can.students?.ins === true} />
            <Closed rows={inquiries.filter((i) => !OPEN_STAGE.has(i.stage))}
                    classes={head.classes} today={head.today}
                    canWrite={can.inquiry?.upd === true}
                    canEnroll={can.students?.ins === true} />
          </section>

          {/* ② 한 달에 한 번 — ⚠️ **강사에게는 이 카드가 통째로 없다**(원장님 2026-09-03) */}
          {수강료 ? (
          <section className="card">
            <div className="cardhd">💳 수강료 <span className="num">{head.label}</span></div>
            <Months head={head} sp={sp} />
            <Counts fee={fee} canPay={canPay} />
            <FeeRules rules={head.rules} students={fee.people} classes={head.classes}
                      canWrite={can.fee_rule?.ins === true} today={head.today} />
            <div className="op-list">
              {fee.people.map((p) => (
                <PayLine key={p.studentId} studentId={p.studentId} ym={head.ym}
                         name={p.name} grade={p.grade} state={p.state}
                         classes={p.classes} rules={p.rules}
                         sessions={special.byStudent.get(p.studentId)?.total ?? null}
                         amount={p.amount} paidOn={p.paidOn} method={p.method} note={p.note}
                         canWrite={canPay} today={head.today} />))}
              {fee.people.length === 0
                ? <p className="op-note">
                    이 달에 줄에 설 아이가 없습니다 — 재원생도 없고, 그 달에 반이 있던 아이도 없습니다.
                  </p>
                : null}
            </div>
            {special.skipped.length ? (
              <p className="op-note">
                ⚠️ 특강 회차를 <b>안 센 아이 {special.skipped.length}명</b>이 있습니다
                ({special.skipped.join(" · ")}) — 아이마다 조회가 늘어 상한을 넘지 않으려고 멈췄습니다.
                조용히 빠뜨리면 그 아이 특강비가 영영 안 걷힙니다.
              </p>) : null}
            {fee.hiddenLeft > 0 ? (
              <p className="op-note">
                퇴원한 아이의 수납 줄 <b>{fee.hiddenLeft}개</b>를 안 그렸습니다 —
                그 달에 반이 없어서 <b>재원 기간 밖</b>입니다(파기와 부딪히는 자리).
                줄은 <b>그대로 있습니다</b> — 지우지 않았습니다.
              </p>) : null}
          </section>
          ) : (
            /* ⚠️ **숨긴 것을 숨기지 않는다**(대전제-0). 왜 안 보이는지 한 줄로 밝힌다 —
                  안 그러면 강사가 「화면이 고장 났나」 하고 원장님께 묻는다 */
            <p className="op-note">
              💳 수강료는 <b>원장님만</b> 보십니다 — 이 화면에서 안 그렸습니다.
              상담일지와 신규 문의는 그대로 보실 수 있습니다.
            </p>
          )}

          {/* ③ 아이마다 모아 본다 */}
          <section className="card">
            <div className="cardhd">
              🗒 상담일지
              {picked ? <span className="num">{picked.name} · {picked.n}줄</span>
                      : <span className="muted">아이를 고르면 그 아이 것만 모입니다</span>}
            </div>
            <Who list={consult.byStudent} pickedId={pickedId} sp={sp} />
            <ConsultBox studentId={pickedId} studentName={picked?.name ?? null}
                        rows={consult.rows} showName={!pickedId}
                        canWrite={can.consult?.ins === true} />
            {!pickedId
              ? <p className="op-note">아이를 안 골라서 <b>최근 20줄</b>만 그렸습니다. 위에서 아이를 고르면 그 아이 것이 다 모입니다.</p>
              : null}
            {consult.hidden > 0 ? (
              <p className="op-note">
                퇴원한 아이의 상담 <b>{consult.hidden}줄</b>을 안 그렸습니다 — 재원 기간 밖입니다.
                줄은 <b>그대로 있습니다</b>.
              </p>) : null}
            {consult.noStudent > 0 ? (
              <p className="op-note">아이가 안 붙은 상담 줄이 <b>{consult.noStudent}개</b> 있습니다 — 여기서는 못 찾습니다.</p>
              ) : null}
          </section>

          <Speed n={conn.count()} log={conn.log()} />

          {/* ⚠️ 대전제 10 — 홈 화면에 깐 앱엔 주소창도 뒤로가기도 없다. 닫는 길은 **늘 화면 안에** */}
          <p><Link className="btn btnghost" href="/">← 대시보드</Link></p>
          <LogoutButton />
        </div>
      </main>
    );
  } finally {
    await conn.end();
  }
}

/* ── 머리 ──────────────────────────────────────────────────────── */

function Head({ head, can }) {
  const blocked = Object.entries(can).filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);
  return (
    <div className="stack">
      <div className="op-head">
        <h1>운영</h1>
        <span className="num">{head.today}</span>
        <span className="muted">돈 · 상담 · 신규</span>
        {head.ym !== head.thisYm
          ? <span className="pill pillwarn">지난 달({head.label})을 보고 있습니다</span>
          : null}
      </div>
      {blocked.length ? (
        <details className="op-fold">
          <summary className="op-foldhd">
            <span className="pill pillbad">지금 못 하는 것 {blocked.length}가지</span>
            <span className="muted">규칙은 열려 있는데 권한이 없습니다</span>
          </summary>
          <div className="op-foldbd">
            <p>
              접근 규칙(RLS)은 원장에게 <b>staff_all</b> 로 열려 있는데, 표 권한(GRANT)이 <b>SELECT 뿐</b>이라
              아래 표에는 한 줄도 못 씁니다 — 눌러도 「permission denied」로 되돌아옵니다.
              0005 가 적어 둔 그 함정입니다: 「규칙만 있고 권한이 없으면 아무도 못 본다 — <b>둘 다</b> 있어야 한다」.
            </p>
            <ul>{blocked.map((t) => <li key={t}><code className="mono">v2.{t}</code></li>)}</ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/* ── 달 고르기 ─────────────────────────────────────────────────── */

function Months({ head, sp }) {
  const keep = sp.s ? `&s=${one(sp.s)}` : "";
  return (
    <p className="op-mon">
      <Link className="btn btnghost" href={`/ops?m=${head.prevYm}${keep}`}>◀ {head.prevYm}</Link>
      <span className="num">{head.firstDay} ~ {head.lastDay}</span>
      <Link className="btn btnghost" href={`/ops?m=${head.nextYm}${keep}`}>{head.nextYm} ▶</Link>
      {head.ym !== head.thisYm
        ? <Link className="btn btnghost" href={`/ops?m=${head.thisYm}${keep}`}>이번 달로</Link>
        : null}
    </p>
  );
}

/**
 * 본 것만 센다. ⚠️ **「미납」을 판정하지 않는다** — 「며칠 지나면 미납인가」가 계획서에도
 * `v2.auto_rule` 에도 없다. 기준을 지어내면 원장님이 안 보셔도 될 아이가 빨갛게 뜬다.
 */
function Counts({ fee, canPay }) {
  return (
    <div className="stack">
      <p className="op-kv">
        <span className="chip">줄에 선 아이</span><span className="num">{fee.people.length}명</span>
        <span className="chip">수납 줄 없음</span><span className="num">{fee.noRow}</span>
        <span className="chip">금액 안 적음</span><span className="num">{fee.noAmount}</span>
        <span className="chip">받은 날 빔</span><span className="num">{fee.noPaid}</span>
        <span className="chip">받은 금액 합</span>
        <span className="num">{won(fee.people.reduce((a, p) => a + (p.amount ?? 0), 0))}원</span>
      </p>
      <p className="op-note">
        <b>금액이 비면 0원이 아니라 「아직 안 적음」</b>입니다 — 청구를 안 만듭니다.
        <br />「미납 N명」은 <b>안 셉니다.</b> 「며칠 지나면 미납인가」가 계획서에도 <code className="mono">v2.auto_rule</code> 에도
        없습니다. 기준을 지어내면 안 보셔도 될 아이가 빨갛게 뜹니다.
        <br />⚠️ <b>정규는 월정액</b>이라 회차와 무관합니다. <b>특강만 회차만큼</b> 받습니다 —
        그래도 <b>곱셈은 이 화면이 안 합니다.</b> 단가 줄과 회차를 옆에 두고 금액은 직접 적으세요.
      </p>
      {!canPay
        ? <p className="op-note">⚠️ <code className="mono">v2.payment</code> 에 쓸 권한이 없어 <b>저장이 안 됩니다.</b></p>
        : null}
    </div>
  );
}

/* ── 아이 고르기 (상담일지) ────────────────────────────────────── */

function Who({ list, pickedId, sp }) {
  const m = sp.m ? String(one(sp.m)) : null;
  const keep = m ? `&m=${m}` : "";
  return (
    <div className="row">
      {pickedId
        ? <Link className="btn btnghost" href={m ? `/ops?m=${m}` : "/ops"}>← 전체로</Link>
        : null}
      {list.map((s) => (
        <Link key={s.id} className={"op-who" + (s.id === pickedId ? " is-sel" : "")}
              href={`/ops?s=${s.id}${keep}`}>
          <span>{s.name}{s.state !== "active" ? " (퇴원)" : ""}</span>
          <span className="muted num">{s.n}줄{s.last ? ` · ${s.last}` : " · 없음"}</span>
        </Link>))}
      {list.length === 0 ? <p className="op-note">아이가 하나도 없습니다.</p> : null}
    </div>
  );
}

/* ── 끝난 문의 — 접어서 줄인다. 안 지운다 ──────────────────────── */

function Closed({ rows, classes, today, canWrite, canEnroll }) {
  if (!rows.length) return null;
  return (
    <details className="op-fold">
      <summary className="op-foldhd">
        끝난 문의 <span className="num">{rows.length}건</span>
        <span className="muted">등록 {rows.filter((r) => r.stage === "joined").length} · 안 옴 {rows.filter((r) => r.stage === "dropped").length}</span>
      </summary>
      <div className="op-foldbd">
        <div className="op-list">
          {rows.map((r) => (
            <InquiryLine key={r.id} row={r} classes={classes}
                         canWrite={canWrite} canEnroll={canEnroll} today={today} />))}
        </div>
      </div>
    </details>
  );
}

/* ── 조회 수 — **감추지 않는다** (대전제 0) ────────────────────── */

function Speed({ n, log }) {
  const over = n > QUERY_CAP;
  return (
    <details className="op-fold">
      <summary className="op-foldhd">
        {over
          ? <span className="pill pillwarn">조회 {n}번 — 내가 정한 상한 {QUERY_CAP}을 넘었습니다</span>
          : <span className="pill pillok">조회 {n}번 (상한 {QUERY_CAP})</span>}
      </summary>
      <div className="op-foldbd">
        <p className="mono">{log.join(" · ")}</p>
        <p className="muted">
          계획 「속도」 표에 <code className="mono">/ops</code> 줄이 없어서 상한은 제가 정한 값입니다.
          기본은 넷(머리 · 수납 · 문의 · 상담)이고, 특강 아이가 있으면 회차를 세느라 늡니다.
        </p>
      </div>
    </details>
  );
}

/* ── 못 열었을 때 — 「무엇이 없어서 비었나」 ────────────────────── */

function Blocked({ title, msg, how = [] }) {
  return (
    <main className="wrap">
      <div className="stack">
        <div className="op-head"><h1>{title}</h1></div>
        <div className="card">
          <div className="cardhd">못 열었습니다</div>
          <p className="op-note">{msg}</p>
          {how.length ? <ul>{how.map((h, i) => <li key={i}>{h}</li>)}</ul> : null}
        </div>
        <LogoutButton />
      </div>
    </main>
  );
}
