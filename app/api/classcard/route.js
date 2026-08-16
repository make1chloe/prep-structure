import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * **클래스카드 확장의 수신 주소** (0131, docs/클래스카드-연동-설계.md).
 *
 * 원장님 크롬의 확장이 플래너를 읽어 여기로 보낸다. 로그인 쿠키가 없는
 * 요청이라 서버 열쇠로 저장한다. 문단속: 환경변수 CLASSCARD_KEY 가
 * 있어야만 받는다 (확장 팝업에 같은 값을 넣는다) — 예약 발송 크론과
 * 달리 이 주소는 **쓰기**라서 열쇠 없이는 아예 안 받는다.
 *
 * body: {
 *   roster:  [{ user_idx, login_id, user_name }],
 *   days:    [{ user_idx, date, sets: [{name, complete, status, cards}] }],
 *   planner: [{ user_idx, month, days: ["YYYY-MM-DD", ...] }],
 * }
 */
export async function POST(request) {
  const secret = (process.env.CLASSCARD_KEY || process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CLASSCARD_KEY 가 Vercel 환경변수에 없어요." },
      { status: 500 }
    );
  }
  const got = (request.headers.get("x-cc-key") || "").trim();
  if (got !== secret) {
    return NextResponse.json({ error: "키가 맞지 않아요." }, { status: 401 });
  }

  const supa = adminClient();
  if (!supa) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 없어요." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 이 아니에요." }, { status: 400 });
  }

  const out = { roster: 0, days: 0, planner: 0 };
  const now = new Date().toISOString();

  const roster = (body.roster || []).filter((r) => r?.user_idx);
  if (roster.length) {
    const { error } = await supa.from("classcard_students").upsert(
      roster.map((r) => ({
        user_idx: String(r.user_idx),
        login_id: (r.login_id || "").trim() || null,
        user_name: (r.user_name || "").trim() || null,
        seen_at: now,
      }))
    );
    if (error) return NextResponse.json({ error: `명단: ${error.message}` }, { status: 500 });
    out.roster = roster.length;
  }

  const days = (body.days || []).filter(
    (d) => d?.user_idx && /^\d{4}-\d{2}-\d{2}$/.test(d?.date || "")
  );
  if (days.length) {
    const { error } = await supa.from("classcard_day").upsert(
      days.map((d) => ({
        user_idx: String(d.user_idx),
        date: d.date,
        // 필요한 칸만 — 세트 내용 미러링 금지 (설계 문서)
        sets: (d.sets || []).slice(0, 50).map((s) => {
          const num = (o) =>
            Object.fromEntries(
              Object.entries(o || {})
                .slice(0, 8)
                .map(([k, v]) => [String(k).slice(0, 12), Number(v) || 0])
            );
          return {
            name: String(s.name || "").slice(0, 120),
            type: String(s.type || "").slice(0, 8),
            complete: !!s.complete,
            status: Number(s.status) || 0,
            cards: Number(s.cards) || 0,
            goals: num(s.goals),   // 필수 모드 목표 (매칭 3000점 등)
            got: num(s.got),       // 그 모드의 결과
          };
        }),
        fetched_at: now,
      }))
    );
    if (error) return NextResponse.json({ error: `일별: ${error.message}` }, { status: 500 });
    out.days = days.length;
  }

  const planner = (body.planner || []).filter(
    (p) => p?.user_idx && /^\d{4}-\d{2}$/.test(p?.month || "")
  );
  if (planner.length) {
    const { error } = await supa.from("classcard_planner").upsert(
      planner.map((p) => ({
        user_idx: String(p.user_idx),
        month: p.month,
        days: (p.days || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 62),
        fetched_at: now,
      }))
    );
    if (error) return NextResponse.json({ error: `달력: ${error.message}` }, { status: 500 });
    out.planner = planner.length;
  }

  return NextResponse.json({ ok: true, ...out });
}
