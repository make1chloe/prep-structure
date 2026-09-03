/**
 * 설정 `/settings` — **거의 안 여는 화면.** 처음 한 번 정해 두면 그대로 간다.
 * (계획 ㉖ 배색 5종 · ㊶ 진도 체크 켜고 끄기 · ㊺-b 교재 멈춤 고등 6주·중등 4주 ·
 *  (e) ⑤ 규칙의 임계값은 규칙 줄에 · (e) ⑧ 치환 자리 · 「설정을 한 표에 다 넣지 않는다」)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *    「며칠째 열려 있나」는 `v2.progress_open_days()`,
 *    「이 아이가 지금 고칠 수 있나」는 `v2.can_edit_progress()`,
 *    「이 문구를 지금 보내면 막히나」는 `lib/notify.js` 의 `findHole()`,
 *    「이 규칙의 주기를 아는가」는 `lib/queue.js` 의 `cycleOf()` 가 답한 것을 받아 그린다.
 *
 * ── ⚠️ **설정을 한 표에 다 넣지 않는다.** 학생·학부모가 봐야 하는 값은 여기 없다.
 *    한 표에 몰면 그 표를 학생이 읽을 수 있어야 하고, 그 순간 학원 설정이 통째로 열린다.
 *
 * ── ⚠️ **비밀번호를 바꾸거나 되돌리는 자리를 만들지 않았다** (대전제 12).
 *
 * ── ⚠️ **역할을 스스로 본다.** 문지기(`middleware.js`)는 첫 화면만 고르고
 *    역할로 화면을 안 지킨다 (그 파일 실측 — 학생 세션으로 `/parent` 가 200 이었다).
 *
 * ── ⚠️ **탭이 없다.** 탭 전환은 화면 전체 재조회다 (§속도 1).
 * ── ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys, SCHEMA} from "../../lib/supabase-server.js";
import { readSettings, SKINS, STUDENT_MODES, LEVELS } from "./read.js";
import { SkinPick, ProgressEditSwitch, StudentModes, StopWeeks, Templates, Rules, WhoSees }
  from "./parts.js";
/**
 * ⚠️⚠️ **항목 목록을 이 화면에 다시 적지 않는다** (원칙-1 · 검사-⑲).
 *    무엇을 물을지·어느 역할에 물을지·「끄면 무엇이 사라지나」는 전부 `lib/perm.js` 에서 받는다.
 *    안 하면 무엇이 터지나: 항목을 하나 더한 날 화면과 lib 이 두 벌이 되어
 *    **켜도 안 뜨거나 꺼도 뜬다.** 오류는 안 난다 — 그래서 아무도 모른다.
 * ⚠️⚠️ **켬/끔 값은 이 화면에도 한 줄도 없다.** `everyCell()` 이 저장된 줄을 보고
 *    「켬·끔·아직 안 정함」 셋 중 하나를 준다. 안 정한 것은 **안 정한 대로** 보여야 한다.
 */

// ⚠️ 설정은 사람마다·때마다 다르다. 캐시되면 어제 판이 오늘 화면에 그대로 뜬다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "설정 · 클로이영어" };

/**
 * **설정은 원장만 연다** — 원장님 2026-09-03: 「아니 강사는 수강료 설정 못보게」.
 *
 * ⚠️ 판단은 `lib/menu.js` 의 `canSettings` 한 곳이다(대전제-4 · 원칙-1). 메뉴에서 「설정」을
 *    빼는 것도 **같은 판단**을 쓴다 — 두 벌이면 메뉴엔 없는데 주소로는 열리는 날이 온다.
 * ⚠️ 안 하면 무엇이 터지나: 문지기(`middleware.js`)는 첫 화면만 고르고 역할로 화면을 안 지킨다.
 *    메뉴에서만 빼면 강사가 `/settings` 를 그대로 열어 배색·문구·진도 스위치를 고친다.
 * ⚠️⚠️ **이것도 화면 가리개일 뿐이다.** 설정 표들의 접근 규칙은 `staff_all(is_staff())` 라
 *    강사에게 DB 쪽은 열려 있다(2026-09-03 실측 · 보고에 올렸다).
 */
import { ROLE_LIST, everyCell, unsetCount, loadPerm, blockedBy, PRINCIPAL } from "../../lib/perm.js";
import { canSettings, isPrincipal } from "../../lib/menu.js";

/** 카드 한 장 — 제목 · 왜 여기 있나 · 속 */
function Card({ title, why, children }) {
  return (
    <section className="card">
      <h2 className="cardhd">{title}</h2>
      {why ? <p className="muted">{why}</p> : null}
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  /* ── 누구인가 — `lib/supabase-server.js` 한 곳에서 묻는다 ───────────── */
  let who = { user: null, role: null, why: "", msg: "" };
  const k = keys();
  if (k.ok) {
    try { who = await roleOf(serverClientFromStore(await cookies())); }
    catch (e) { who = { user: null, role: null, why: "threw", msg: String(e?.message ?? e).slice(0, 200) }; }
  }
  /* ⚠️⚠️ **저장값을 읽어서 넘긴다.** 안 넘기면 `canFor` 가 늘 「아직 안 정함」으로 읽어
   *    원장님이 설정을 켜 주셔도 강사에게 영영 안 열린다 — 오류도 안 나서 아무도 못 짚는다.
   * ⚠️ 원장은 묻지 않는다(스스로를 잠글 자리를 안 만든다). */
  const 권한 = !who.user || who.role === PRINCIPAL
    ? { rows: null, why: null }
    : await loadPerm(serverClientFromStore(await cookies()).schema(SCHEMA));
  /* ⚠️ 대메뉴 일곱이 **같은 모양**으로 막는다(원칙-1) — 여기만 다른 손을 쓰면
   *    검사가 「이 화면엔 문지기가 없다」로 읽고, 사람도 어느 쪽이 진짜인지 모른다. */
  /* ⚠️ 막힌 까닭을 **여기서 짓지 않는다**(원칙-1). `blockedBy()` 한 벌이 짓는다 —
   *    화면마다 지으면 한쪽만 「아직 안 정하셨습니다」를 말하고, 조교가 그 글에서 빠진다.
   *    (실제로 그랬다: 「강사는 설정을 안 봅니다」라고만 적혀 있어 조교가 읽을 글이 없었다) */
  const 막힘 = who.user ? blockedBy(who.role, "page.settings", 권한.rows, 권한.why) : null;
  const staff = Boolean(who.user) && 막힘.ok;

  /* ── 읽는다 (문 하나 · 조회 5) ─────────────────────────────────────── */
  const r = staff ? await readSettings(who.user.id) : { ok: false, value: null, why: "", n: 0 };
  const v = r.value;

  /* ── 누가 무엇을 보나 — **세는 것은 `lib/perm.js` 다** (원칙-1 · 원칙-5)
   * ⚠️ 한 번만 세어 넘긴다. 화면 안에서 여러 번 부르면 같은 셈이 여러 벌이 되고,
   *    한 벌만 고치는 날 머리의 숫자와 표의 칸이 어긋난다. */
  const 칸들 = v ? everyCell(v.perm) : [];
  const 안정한칸 = v ? unsetCount(v.perm) : 0;

  return (
    <main className="wrap">
      <div className="row">
        <h1 className="grow">설정</h1>
        <Link className="btn btnghost" href="/">대시보드</Link>
      </div>
      <p className="muted">
        거의 안 여는 화면입니다. 한 번 정해 두면 그대로 갑니다.
      </p>

      <div className="stack">
        {/* ⚠️ 배색은 **DB 가 없어도 된다.** 그래서 맨 앞에 두고, 아래가 막혀도 이 카드는 산다 */}
        <Card title="배색"
              why="원장님·아이·학부모가 각자 고릅니다. 고른 것은 그 브라우저에만 남습니다.">
          <SkinPick skins={SKINS} />
        </Card>

        {!k.ok ? (
          <Card title="⚠️ 로그인 열쇠가 없어 아래를 못 읽습니다">
            <p>
              `.env.local` 과 Vercel 에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 넣어야 합니다.
              그리고 Supabase → Settings → API → Exposed schemas 에 `v2` 를 넣어야 역할을 읽습니다.
              ⚠️ 둘 다 코드로 못 고칩니다.
            </p>
          </Card>
        ) : !who.user ? (
          <Card title="로그인하지 않았습니다">
            <p className="muted">{who.msg || "로그인한 뒤에 다시 열어 주세요."}</p>
          </Card>
        ) : !staff ? (
          <Card title="이 화면은 원장님만 엽니다">
            {/* ⚠️ 글은 `lib/perm.js` 의 `blockedBy()` 한 벌이 짓는다 — 여기서 안 짓는다(원칙-1) */}
            <p className="muted">
              {who.role == null
                ? (who.msg || "역할을 못 읽었습니다 — 지어내지 않습니다.")
                : (막힘?.msg ?? "학생은 /me, 학부모는 /parent 가 첫 화면입니다.")}
            </p>
            {/* ⚠️ **나가는 길**을 같이 적는다(대전제-10) — 홈 화면에 깐 앱엔 주소창도 뒤로가기도 없다 */}
            {(막힘?.how ?? []).length > 0 && (
              <ul className="muted">{막힘.how.map((h, i) => <li key={i}>{h}</li>)}</ul>
            )}
          </Card>
        ) : !r.ok ? (
          <Card title="⚠️ 설정을 못 읽었습니다">
            <p>{r.why}</p>
            <p className="muted">
              무엇이 없어서 비었는지를 그대로 적었습니다. 비어 있는 것을 예쁘게 감추지 않습니다.
            </p>
          </Card>
        ) : (
          <>
            {/* ⚠️⚠️ 원장님 2026-09-03 — 「원장이 학부모·학생·강사·조교에게 각각 페이지를
                어디까지 오픈할지 온오프 및 세부목록 관리하는 페이지 추가해」.
                ⚠️ **이 화면은 원장님만 엽니다** — 위 `staff` 문지기(`canSettings`)가 이미 막습니다.
                ⚠️ 맨 앞에 둡니다: 안 정하면 강사·조교·아이·학부모가 **아무것도 못 봅니다**. */}
            <Card title="누가 무엇을 보나"
                  why={"역할마다 화면·카드를 하나씩 켜고 끕니다. " +
                       "안 정하신 칸은 「아직 안 정함」이고, 그동안 그 사람에게는 안 보입니다 " +
                       "(돈·개인정보가 걸린 자리라 막는 쪽으로 둡니다)."}>
              {/* ⚠️⚠️ **원장님만 여십니다** (원장님 2026-09-03 ①).
                  `canSettings` 가 언젠가 강사에게 열리더라도 **이 자리만은 안 열린다** —
                  안 막으면 그날 강사가 여기서 제 권한을 스스로 켠다. */}
              {!isPrincipal(who.role) ? (
                <p className="sunk" style={{ margin: 0, color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
                  ⚠️ 이 자리는 <b>원장님만 여십니다.</b> 다른 설정은 그대로 쓰실 수 있습니다.
                </p>
              ) : (
                <>
              <p className="muted">
                아직 안 정한 칸 <span className="num">{안정한칸}</span>개 ·
                물어보는 칸 모두 <span className="num">{칸들.length}</span>개.
                <b> 원장님은 이 표에 안 듭니다</b> — 스스로를 잠글 자리를 만들지 않습니다.
              </p>
              <WhoSees roles={ROLE_LIST} cells={칸들} />
              <p className="muted">
                ⚠️ 정직하게 — 여기서 켜고 끄신 값을 <b>지금 실제로 보는 자리는 아직 적습니다.</b>
                대메뉴를 가리는 판단(<span className="mono">lib/menu.js</span>)은 아직 코드에 박힌 값을
                쓰고 있습니다. 그 판단이 이 표를 보게 되는 날 여기 값이 그대로 살아납니다 —
                보고에 적어 두었습니다.
              </p>
                </>
              )}
            </Card>

            <Card title="진도 체크 — 아이가 자기 진도를 찍게 할까"
                  why="전환 첫 주에 켭니다. 아이 말고는 「어디까지 했나」를 아는 사람이 없습니다.">
              <ProgressEditSwitch isOpen={v.editOpen} days={v.editDays} openedOn={v.editFrom} />
            </Card>

            <Card title="진도 체크 — 학생별로 다르게"
                  why="「학원 따라감」이면 위 스위치를 따릅니다. 한 아이만 늘 켜거나 늘 끌 수 있습니다.">
              <StudentModes rows={v.students} modes={STUDENT_MODES} />
            </Card>

            <Card title="교재 멈춤 기본"
                  why="시험철에 평소 교재를 멈추는 시점입니다. 고등 6주 · 중등 4주가 원장님이 정하신 값입니다.">
              <StopWeeks rows={v.stop} levels={LEVELS} />
              <p className="muted">
                ⚠️ 정직하게 — <b>이 값을 읽는 코드가 아직 없습니다.</b> 지금 고쳐 두면 저장은 되지만
                교재가 멈추지는 않습니다. 멈춤 판단(`lib/routine.js` 의 `stopOf`)이 이 값을 보게 되는 날
                그대로 살아납니다.
              </p>
            </Card>

            <Card title="문구"
                  why="원장님이 지어 쓰는 글입니다. 갈래는 발송 코드가 정합니다.">
              <Templates rows={v.msg} />
              <p className="muted">
                <b>{"{{ }}"} 로 남은 자리가 있으면 그 문구는 안 나갑니다</b> — 빠뜨린 채 나가는 것보다
                안 나가는 쪽이 낫기 때문입니다. 되돌아온 것은 「안 보낸 판」으로 남아 빠뜨린 것과 구별됩니다.
              </p>
              <p className="muted">
                ⚠️ 정직하게 — <b>그 자리를 채우는 코드가 아직 한 곳도 없습니다.</b> 표에 줄을 더한다고
                채워지지 않습니다. <b>채우는 것은 코드입니다.</b>
              </p>
            </Card>

            <Card title="되풀이 규칙의 임계값"
                  why="「몇 번째부터 재시험지」 같은 선입니다. 코드에 박으면 원장님이 못 바꿉니다.">
              <Rules rows={v.rules} />
            </Card>

            <Card title="여기 없는 것 — 그리고 왜 없는지">
              <ul>
                <li>
                  <b>보강 요일 · 알림 공개키</b> — 학생·학부모가 봐야 하는 값이라 설정과 <b>따로</b> 둡니다.
                  한 표에 몰면 그 표를 아이가 읽을 수 있어야 하고, 그 순간 학원 설정이 통째로 열립니다.
                  ⚠️ 보강은 <b>요일로 정하지 않습니다</b> — 달력에서 아무 날이나 고르고 시각도 직접 적습니다.
                </li>
                <li>
                  <b>비밀번호 바꾸기·되돌리기</b> — 만들지 않았습니다(대전제 12). 계정은 그 사람이
                  자기 손으로만 바꿉니다. 그래야 「누가 눌렀나」가 뜻을 잃지 않습니다.
                </li>
                <li>
                  <b>진도 체크 「언제까지」</b> — 없습니다. 날짜로 저절로 꺼지지 않고
                  <b> 여기서 끄셔야 꺼집니다</b>(원장님 확정). 그래서 <b>켠 날짜</b>를 남깁니다.
                </li>
                <li>
                  <b>새 문구·새 규칙 만들기</b> — 없습니다. 읽는 코드가 없으면 만들어도 한 번도 안 돕니다.
                  「고쳤다」는 착각만 남습니다.
                </li>
              </ul>
              <p className="muted">
                이 화면이 DB 에 물은 횟수 <span className="num">{r.n}</span>회.
              </p>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
