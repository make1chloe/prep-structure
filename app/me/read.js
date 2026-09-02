/**
 * 학생 화면이 읽는 자리 — **여기 말고 어디서도 DB 를 안 읽는다.**
 *
 * ⚠️⚠️ **서비스 열쇠를 쓰지 않는다.** 로그인한 그 아이의 쿠키로 만든 클라이언트만 쓴다
 *    (`lib/supabase-server.js` 의 `serverClientFromStore`). 서비스 열쇠를 쓰면
 *    접근 규칙(RLS)을 통째로 지나쳐 **남의 아이 자료가 이 화면에 그대로 뜬다.**
 *    그래서 이 파일에는 `lib/db.js`(serviceDb)·`pg`·`SERVICE_ROLE` 이 한 글자도 없다.
 *
 * ⚠️ **판단을 여기 두지 않는다.** 셈은 `./derive.js`, 마감 가리기는 `lib/close.js`,
 *    커서·진도율은 DB 함수(`v2.cursor_of`·`v2.book_progress`)가 한 벌씩 갖는다.
 *
 * ⚠️ **못 읽은 것을 빈 것으로 바꾸지 않는다**(대전제 0). 조회마다 `why` 를 들고 나오고,
 *    화면은 「무엇이 없어서 비었나」를 그대로 적는다.
 *
 * ── 지금 실제로 안 되는 것 (실측, `lib/supabase-server.js` 머리주석과 같은 자리)
 *    ① `.env.local` 에 ANON 열쇠가 없다 → 클라이언트를 못 만든다.
 *    ② PostgREST 가 v2 스키마를 안 내보낸다(PGRST106) → 모든 조회가 여기서 막힌다.
 *    둘 다 코드로 못 고친다. 그래서 이 화면은 **그 두 줄을 화면에 그대로 띄운다.**
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, SCHEMA } from "@/lib/supabase-server";
import { seoulToday } from "@/lib/queue";
import { monthRange, ymd } from "@/lib/session";
import { PREPARING, NOTHING, DAY_OPEN, hideEmptyCards } from "@/lib/close";
import { 카드들, 순서입히기, 달옮기기 } from "./derive";

/**
 * ⚠️ 조회 상한 — 한 화면이 이보다 많이 물으면 아이 폰에서 눈에 띄게 느려진다.
 *    `scripts/check-screen-me.mjs` 가 **이 파일의 조회 자리를 세어** 넘으면 실패시킨다.
 *
 * ⚠️ 지금 19번이라 넉넉하지 않다. 그중 **8번이 교재마다 도는 두 자리**(`cursor_of`·`book_progress`)다.
 *    → `v2.me_books(p_student)` 하나로 묶으면 19 → 12 가 된다. **needsDb 에 적어 두었다.**
 *    화면에서 대신 세지 않는 까닭은 그 둘이 진짜 규칙이라서다(커서·진도율은 DB 한 벌).
 */
export const 조회_상한 = 20;

/** 한 화면에 그리는 교재 수 상한 — 교재마다 DB 함수를 **두 번** 부르므로 여기서 끊는다 */
export const 교재_상한 = 4;

/** 이 화면 이름 — `v2.screen_pref.screen` 의 값 */
export const 화면 = "me";

/** 화면이 그대로 쓰는 글 — **여기서 짓지 않는다**(`lib/close.js` 한 벌) */
export const 글 = Object.freeze({ PREPARING, NOTHING, DAY_OPEN });

/**
 * 한 번의 조회를 감싼다. **던지지 않는다** — 한 자리가 죽어도 나머지를 그린다.
 * @returns { rows, why }  why 가 있으면 「못 읽었다」는 뜻이고, 화면이 그 글을 띄운다
 */
async function 조회(이름, fn) {
  try {
    const r = await fn();
    if (r?.error) return { rows: [], why: 왜못읽었나(이름, r.error) };
    const d = r?.data;
    return { rows: Array.isArray(d) ? d : d == null ? [] : [d], why: null };
  } catch (e) {
    return { rows: [], why: `${이름} 을 못 읽었습니다 — ${String(e?.message ?? e)}` };
  }
}

/** 오류를 아이가 읽을 말로. ⚠️ 안쪽 사정을 그대로 내보내지 않되 **까닭은 남긴다** */
function 왜못읽었나(이름, error) {
  const code = String(error?.code ?? "");
  if (code === "PGRST106")
    return `${이름} 을 못 읽었습니다 — 앱 설정이 아직 덜 됐습니다 (v2 스키마 노출 안 됨). 원장님께 알려주세요.`;
  if (code === "42501" || /permission denied/i.test(String(error?.message ?? "")))
    return `${이름} 은 이 계정으로 볼 수 없게 돼 있습니다 (접근 규칙).`;
  return `${이름} 을 못 읽었습니다 (${code || error?.message || "까닭 모름"}). 원장님께 알려주세요.`;
}

/** 학생 화면에 필요한 것을 **한 번에** 읽는다. 화면은 이 답만 그린다 */
export async function 학생화면읽기() {
  const 오늘 = seoulToday();
  const 빈판 = {
    오늘, 열쇠없음: null, 사람: null, 역할: null, 학생: null,
    막힘: null, 조회수: 0, 카드순서: 카드들, 오늘판: null, 오늘줄: [],
    교재들: [], 이의들: [], 진도체크열림: false, 달력: null, 왜들: [],
  };

  let sb;
  try {
    sb = serverClientFromStore(await cookies());
  } catch (e) {
    // ⚠️ ANON 열쇠가 없다 — **화면을 지어내지 않고** 까닭을 그대로 세운다
    return { ...빈판, 열쇠없음: String(e?.message ?? e) };
  }

  const { user, role, why: 역할why, msg: 역할글 } = await roleOf(sb);
  if (!user) return { ...빈판, 막힘: "로그인이 풀렸습니다. 다시 들어와 주세요." };

  /**
   * ⚠️⚠️ **문지기는 역할로 화면을 안 지킨다** (`middleware.js` 머리주석 · 실측 200).
   *    학부모 세션으로 `/me` 를 열면 그대로 200 이다. 그래서 **여기서 스스로 가른다.**
   *    자료는 접근 규칙이 막지만 화면 구조는 열리고, 무엇보다
   *    「진도 레이스」처럼 **학부모에게 보내면 안 되는 것**이 이 화면에 있다.
   */
  if (role !== "student")
    return { ...빈판, 역할: role,
      막힘: role
        ? "이 화면은 학생 계정으로만 열립니다. 학부모님은 「우리 아이」 화면을 열어 주세요."
        : (역할글 || `역할을 못 읽었습니다 (${역할why || "까닭 모름"}). 원장님께 알려주세요.`) };

  const q = () => sb.schema(SCHEMA);
  const 왜들 = [];
  let 조회수 = 0;
  const 물어본다 = async (이름, fn) => {
    조회수 += 1;
    const r = await 조회(이름, fn);
    if (r.why) 왜들.push(r.why);
    return r;
  };

  // ── ① 나 ────────────────────────────────────────────────────────
  const 나 = await 물어본다("내 정보", () =>
    q().from("students").select("id,name,grade,state,progress_edit").eq("profile_id", user.id).maybeSingle());
  const 학생 = 나.rows[0] ?? null;
  if (!학생)
    return { ...빈판, 사람: user.id, 역할: role, 조회수, 왜들,
      막힘: 나.why ?? "이 계정에 이어진 학생이 없습니다. 원장님께 알려주세요." };

  const sid = 학생.id;

  // ── ② 오늘 판 ───────────────────────────────────────────────────
  // ⚠️ 아이에게는 **마감한 판만** 내려온다(0016 `own_sheet`). 안 내려온 날은 「없는 날」이 아니라
  //    「아직 정리 중」이다 — 그 가름은 `lib/close.js` 의 글을 그대로 쓴다.
  const 오늘것 = await 물어본다("오늘 수업", () =>
    q().from("day_sheet")
      .select("id,date,attend,closed_at,comment," +
        "day_item(id,slot,unit_id,range_note,status,said_done_at,done_note,memo,sort," +
        "learn_items(name,method,tool,checks)," +
        "units(id,chapter,mid,sub,activity,page_start,page_end,q_count,books(name)))")
      .eq("student_id", sid).eq("date", 오늘));
  const 오늘판 = 오늘것.rows[0] ?? null;
  const 오늘줄 = [...(오늘판?.day_item ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  // ── ③ 교재 배정 ─────────────────────────────────────────────────
  const 배정 = await 물어본다("내 교재", () =>
    q().from("student_book")
      .select("id,book_id,round,from_date,to_date,stop_mode,books(id,name,area,order_basis,state)")
      .eq("student_id", sid).lte("from_date", 오늘)
      .or(`to_date.is.null,to_date.gte.${오늘}`)
      .order("from_date"));
  const 배정들 = 배정.rows.slice(0, 교재_상한);
  if (배정.rows.length > 교재_상한)
    왜들.push(`교재가 ${배정.rows.length}권인데 화면에는 ${교재_상한}권까지만 그립니다.`);
  const 교재ids = [...new Set(배정들.map((b) => b.book_id))];

  // ── ④ 단원 · 진도 · 이의 ────────────────────────────────────────
  const 단원 = 교재ids.length
    ? await 물어본다("교재 단원", () =>
        q().from("units").select("id,book_id,chapter,mid,sub,activity,is_workbook,sort")
          .in("book_id", 교재ids).eq("state", "active").order("sort"))
    : { rows: [], why: null };

  const 진도 = 교재ids.length
    ? await 물어본다("내 진도", () =>
        q().from("progress").select("unit_id,round,status,done_on,last_by,confirmed")
          .eq("student_id", sid))
    : { rows: [], why: null };

  const 이의 = await 물어본다("내가 단 ❗", () =>
    q().from("progress_flag").select("id,unit_id,round,kind,said,raised_at,seen_at,outcome")
      .eq("student_id", sid).is("outcome", null));

  // ── ⑤ 진도 체크가 열려 있나 (절 ㊶ · 표 4-9) ────────────────────
  // ⚠️ **화면이 스스로 판정하지 않는다.** `v2.can_edit_progress()` 한 벌이 답한다(0008).
  //    여기서 `students.progress_edit` 와 학원 설정을 다시 조합하면 규칙이 두 벌이 된다.
  const 열림 = await 물어본다("진도 체크 열림", () => q().rpc("can_edit_progress", { p_student: sid }));
  const 진도체크열림 = 열림.rows[0] === true;

  // ── ⑥ 교재마다 「지금 어디」와 「얼마나 왔나」 ───────────────────
  //    ⚠️ 둘 다 **DB 함수 한 벌**을 부른다. 화면에서 다시 세지 않는다(원칙 1·5).
  const 커서들 = new Map(), 진도율들 = new Map();
  for (const b of 배정들) {
    const c = await 물어본다(`「${b.books?.name ?? "교재"}」 지금 어디`, () =>
      q().rpc("cursor_of", { p_student: sid, p_book: b.book_id }));
    커서들.set(b.book_id, c.rows[0] ?? null);
    const p = await 물어본다(`「${b.books?.name ?? "교재"}」 얼마나 왔나`, () =>
      q().rpc("book_progress", { p_student: sid, p_book: b.book_id }));
    진도율들.set(b.book_id, p.rows[0] ?? null);
  }

  // ── ⑦ 달력 ──────────────────────────────────────────────────────
  // ⚠️ **석 달치를 한 번에 읽는다** (지난달·이달·다음달). 달을 넘길 때마다 다시 물으면
  //    그것이 곧 「탭 전환이 화면 전체 재조회」다 — 계획이 탭을 금지한 바로 그 까닭이다.
  //    앞날은 **다음 달까지만**이라 위쪽 테두리는 여기가 끝이다(절 ⑯ 2번).
  const 재원시작 = 배정들.map((b) => ymd(b.from_date)).filter(Boolean).sort()[0] ?? null;
  const 이달 = 오늘.slice(0, 7);
  const 앞달 = 달옮기기(이달, -1), 뒷달 = 달옮기기(이달, 1);
  const first = monthRange(앞달).first, last = monthRange(뒷달).last;

  const 달판 = await 물어본다("달력의 지난 수업", () =>
    q().from("day_sheet").select("id,date,attend,closed_at,comment,day_item(id,slot,status,said_done_at)")
      .eq("student_id", sid).gte("date", first).lte("date", last).order("date"));

  const 수업이력 = await 물어본다("내 수업 요일", () =>
    q().from("class_schedule").select("class_id,from_date,to_date,weekdays,start_time"));

  // ⚠️ 날짜로 미리 거르지 않는다 — 「영어 시험일만 있고 시험 기간이 빈 줄」이 통째로 사라진다
  //    (그 칸은 나이스가 안 줘서 손으로 넣는 자리다 — 0006 주석). 어느 날에 걸리는지는
  //    `달력칸` 이 `시험날인가` 한 벌로 가린다. 접근 규칙이 **내 학교 것과 전국 것**만 준다(0009).
  const 시험 = await 물어본다("시험 일정", () =>
    q().from("exams").select("id,name,scope,term_from,term_to,english_on,state").eq("state", "active"));

  // ── ⑧ 카드 순서 ─────────────────────────────────────────────────
  const 순서 = await 물어본다("내 카드 순서", () =>
    q().from("screen_pref").select("layout").eq("profile_id", user.id).eq("screen", 화면).maybeSingle());

  return {
    오늘, 사람: user.id, 역할: role, 학생, 막힘: null, 열쇠없음: null,
    조회수, 왜들,
    카드순서: 순서입히기(순서.rows[0]?.layout?.order),
    오늘판, 오늘줄,
    빈카드숨김: hideEmptyCards("student"),
    교재들: 배정들.map((b) => ({
      배정: b,
      책: b.books ?? null,
      커서: 커서들.get(b.book_id) ?? null,
      진도율: 진도율들.get(b.book_id) ?? null,
      단원: 단원.rows.filter((u) => u.book_id === b.book_id),
    })),
    진도줄: 진도.rows,
    이의들: 이의.rows,
    진도체크열림,
    달력: {
      이달, 앞달, 뒷달, first, last, 재원시작,
      판들: 달판.rows,
      수업이력: 수업이력.rows,
      시험들: 시험.rows,
      // ⚠️ **못 싣는 것을 조용히 빼지 않는다** — 화면이 이 줄을 그대로 적는다(대전제 0)
      못싣는것: [
        "보강은 이 달력에 안 옵니다 — v2.makeup 에 아이 접근 규칙이 없습니다(0016). 원장님 화면에만 있어요.",
        "휴강도 안 옵니다 — v2.holiday 도 같습니다. 그래서 앞날 「수업 예정」이 실제보다 많을 수 있어요.",
        "「내가 스스로 정한 마감(💬)」은 아직 담을 표가 없어 비워 둡니다 — 지어내지 않습니다.",
        "진도 레이스(순위)는 아직 못 그립니다 — 다른 아이 진도를 아이 계정으로 읽는 길이 없습니다.",
        "달력은 지난달·이달·다음달 석 달만 그립니다 — 달을 넘길 때 다시 조회하지 않으려고 그렇습니다.",
      ],
    },
  };
}
