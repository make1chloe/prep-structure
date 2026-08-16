import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { CC_ITEM_KIND, ccJudge, ccUserIdxOf } from "@/lib/classcard";

export const dynamic = "force-dynamic";

/**
 * **한 달치 백테스트** (원장님, 2026-08-17 — 「가상으로 지금 한 달치
 * 검사를 검증해보라는 거야. 그래야 쓰지」).
 *
 * 확장이 지난 30일의 클카 플래너 자료를 넣은 뒤 이 주소를 부르면,
 * 원장님이 이미 찍어둔 실제 검사(daily_report_items)와 자동 판정을
 * 전부 대조해 일치율을 돌려준다. 판정은 lib/classcard 한 곳 그대로.
 *
 * 읽기 전용 — 아무것도 바꾸지 않는다. 열쇠는 수신 주소와 같은 것.
 *
 * 주의(결과 읽을 때): 클카 자료는 「지금」 완료 상태라, 수업 뒤에 마저
 * 한 것은 자동=완료 vs 실제=미흡으로 어긋난다 — 자동이 틀린 게 아니라
 * 시점 차이다. 그래서 「자동이 후함/박함」 을 갈라 센다.
 */
export async function GET(request) {
  const secret = (process.env.CLASSCARD_KEY || process.env.CRON_SECRET || "").trim();
  const url = new URL(request.url);
  const got = (url.searchParams.get("key") || "").trim();
  if (!secret || got !== secret) {
    return NextResponse.json({ error: "키가 맞지 않아요." }, { status: 401 });
  }
  const supa = adminClient();
  if (!supa) return NextResponse.json({ error: "서버 열쇠가 없어요." }, { status: 500 });

  const days = Math.min(60, Number(url.searchParams.get("days")) || 31);
  const to = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const from = new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);

  const [stuQ, rosterQ, itemQ, dayQ] = await Promise.all([
    supa.from("students").select("id, name, login_id, classcard_login"),
    supa.from("classcard_students").select("user_idx, login_id"),
    supa.from("homework_items").select("id, name"),
    supa.from("classcard_day").select("user_idx, date, sets").gte("date", from).lte("date", to),
  ]);

  const kindOfItem = new Map(
    (itemQ.data || [])
      .filter((i) => CC_ITEM_KIND[i.name])
      .map((i) => [i.id, { kind: CC_ITEM_KIND[i.name], name: i.name }])
  );
  if (kindOfItem.size === 0) {
    return NextResponse.json({ error: "단어(온라인)·문장암기(온라인) 항목을 못 찾았어요." });
  }
  const daySets = new Map(
    (dayQ.data || []).map((d) => [`${d.user_idx}|${d.date}`, d.sets || []])
  );
  const uidxOf = new Map(
    (stuQ.data || []).map((s) => [s.id, ccUserIdxOf(s, rosterQ.data || [])])
  );
  const nameOf = new Map((stuQ.data || []).map((s) => [s.id, s.name]));

  // 실제 검사 — 그 기간의 리포트에 달린 두 항목의 done/weak/missing
  const { data: reps } = await supa
    .from("daily_reports")
    .select("id, student_id, date")
    .gte("date", from)
    .lte("date", to);
  const repOf = new Map((reps || []).map((r) => [r.id, r]));
  const { data: dri } = await supa
    .from("daily_report_items")
    .select("daily_report_id, homework_item_id, status")
    .in("daily_report_id", (reps || []).map((r) => r.id))
    .in("homework_item_id", [...kindOfItem.keys()])
    .in("status", ["done", "weak", "missing"]);

  const rows = [];
  (dri || []).forEach((x) => {
    const rep = repOf.get(x.daily_report_id);
    const meta = kindOfItem.get(x.homework_item_id);
    if (!rep || !meta) return;
    const uidx = uidxOf.get(rep.student_id);
    if (!uidx) return;                                   // 클카에 안 이어진 학생
    const sets = daySets.get(`${uidx}|${rep.date}`);
    if (!sets) return;                                   // 그날 클카 자료 없음
    const v = ccJudge(sets, meta.kind);
    if (!v) return;                                      // 그날 그 종류 마감 세트 없음
    rows.push({
      name: nameOf.get(rep.student_id) || "?",
      date: rep.date,
      item: meta.name,
      auto: v.status,
      actual: x.status,
      autoNote: v.missed.join(" · ").slice(0, 160),
    });
  });

  const agree = rows.filter((r) => r.auto === r.actual);
  const RANK = { done: 2, weak: 1, missing: 0 };
  const generous = rows.filter((r) => RANK[r.auto] > RANK[r.actual]);   // 시점 차이 후보
  const strict = rows.filter((r) => RANK[r.auto] < RANK[r.actual]);

  return NextResponse.json({
    ok: true,
    from,
    to,
    compared: rows.length,
    agree: agree.length,
    pct: rows.length ? Math.round((agree.length / rows.length) * 100) : null,
    generous: generous.length,   // 자동이 후함 (수업 뒤에 마저 한 시점 차이 포함)
    strict: strict.length,       // 자동이 박함 — 진짜 문제 후보
    byItem: Object.fromEntries(
      [...new Set(rows.map((r) => r.item))].map((it) => {
        const mine = rows.filter((r) => r.item === it);
        return [it, { n: mine.length, agree: mine.filter((r) => r.auto === r.actual).length }];
      })
    ),
    mismatches: rows.filter((r) => r.auto !== r.actual).slice(0, 60),
  });
}
