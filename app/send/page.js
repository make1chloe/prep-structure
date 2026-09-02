/**
 * 발송 — **원장님이 매일 저녁 여는 화면.** 데일리리포트 · 하원 · 안내.
 *
 * ⚠️ 이 파일은 **읽기만** 하는 서버 컴포넌트다. 그리기는 `./screen.js`(클라이언트),
 *    묻기는 `./sql.js`·`./read.js`, 쓰기는 `./actions.js` 가 한다. 여기엔 판단이 한 줄도 없다.
 *
 * ⚠️ **역할을 스스로 본다.** 문지기(`middleware.js`)는 첫 화면만 고르고 역할로 화면을 안 지킨다 —
 *    그 파일 주석의 실측 그대로 학생 세션으로 `/parent` 가 200 이었다. 발송은 **밖으로 나가는 단추**가
 *    있는 화면이라 다른 어느 화면보다 스스로 봐야 한다.
 *
 * ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 * ⚠️ 조회 상한(§속도 — 발송은 **조회 6 · 2단**)을 넘으면 **감추지 않고 화면에 띄운다.**
 */
import "./send.css";
import { staffOnly } from "./who.js";
import { openAs, QUERY_CAP } from "./db.js";
import { loadBoard } from "./read.js";
import { plain } from "./kinds.js";
import Screen from "./screen.js";

// ⚠️ 그날 판은 날마다 다르다. 캐시되면 어제 자취가 오늘 화면에 그대로 뜬다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "발송 · 클로이영어" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v) => (Array.isArray(v) ? v[0] : v);

/** 「무엇이 없어서 비었나」 — ⚠️ 빈 카드를 예쁘게 만들지 않는다 */
function Why({ children }) { return <p className="sn-why">{children}</p>; }

export default async function Send({ searchParams }) {
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}));
  const me = await staffOnly();

  if (!me.ok) {
    return (
      <main className="wrap">
        <div className="stack">
          <h1>발송</h1>
          <div className="card">
            <div className="cardhd">이 화면을 못 엽니다</div>
            <Why>{plain(me.msg)}</Why>
            {me.how?.length ? <ul>{me.how.map((h) => <li key={h}>{plain(h)}</li>)}</ul> : null}
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
          <h1>발송</h1>
          <div className="card"><div className="cardhd">DB 에 못 붙었습니다</div><Why>{plain(conn.why)}</Why></div>
        </div>
      </main>
    );
  }

  try {
    const askedOn = DATE.test(String(one(sp.on) ?? "")) ? one(sp.on) : null;
    const board = await loadBoard(conn.db, askedOn);
    const q = conn.count();

    // ⚠️ 못 쓰는 표를 화면이 **알고 있어야** 한다 — 규칙(RLS)은 열려 있는데 권한(GRANT)이 없으면
    //    단추가 「할 수 있는 척」을 한다. 목록을 글자로 박지 않고 **매번 물어본** 값을 읽는다
    const blocked = Object.entries(board.facts?.canWrite ?? {})
      .filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);

    const why = [];
    if (q > QUERY_CAP) why.push(`⚠️ 이 화면이 서버에 ${q}번 물었습니다 (상한 ${QUERY_CAP}).`);
    if (blocked.length) {
      why.push(`⚠️ 지금 못 쓰는 표: ${blocked.join(" · ")} — 규칙은 열려 있는데 권한이 없습니다. 눌러도 0줄이 바뀝니다.`);
    }
    if (!board.today) why.push("⚠️ DB 에서 「학원의 오늘」을 못 읽었습니다 — 날짜를 지어내지 않습니다.");

    return (
      <Screen
        on={board.on}
        today={board.today}
        daily={board.daily}
        late={board.late}
        notice={board.notice}
        sched={board.sched}
        reads={board.reads}
        facts={board.facts}
        text={board.text}
        sink={board.sink}
        ready={board.ready}
        lockBody={board.lockBody}
        queries={q}
        cap={QUERY_CAP}
        why={why}
      />
    );
  } finally {
    await conn.end();
  }
}
