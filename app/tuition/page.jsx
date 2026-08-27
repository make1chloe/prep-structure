import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import Help from "@/components/Help";
import PrincipalOnly from "@/components/PrincipalOnly";
import TuitionBoard from "./TuitionBoard";
import { classSessions, studentAmount, monthRange, unitFor, unitSource, sessionDates } from "@/lib/tuition";
import { offSetFor } from "@/lib/extraTerm";
import { loadSettings } from "@/lib/settings";
import { overlaps, isExtra } from "@/lib/classTerm";
import { todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function TuitionPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  // 메뉴에서 감추는 것만으로는 부족하다 — 주소를 알면 그냥 열린다 (0079)
  if (profile?.role !== "principal") {
    return <PrincipalOnly what="수강료 화면" />;
  }

  const ym = searchParams?.m || todaySeoul().slice(0, 7);
  const { first, last } = monthRange(ym);

  // 반 (수강료 컬럼이 없으면 기본 조회)
  const BASE = "id, name, days, start_time, category, tuition, base_sessions";
  const TERM = "starts_on, ends_on, archived_at";
  let { data: classes, error: clsErr } = await supabase
    .from("classes")
    .select(`${BASE}, ${TERM}`)
    .order("start_time", { ascending: true });
  const ready = !clsErr;
  if (clsErr) {
    // 기간 칸이 없는 DB → 기간 없이, 그것도 안 되면 최소 칸만
    ({ data: classes, error: clsErr } = await supabase
      .from("classes")
      .select(BASE)
      .order("start_time", { ascending: true }));
    if (clsErr) {
      ({ data: classes } = await supabase
        .from("classes")
        .select("id, name, days, start_time")
        .order("start_time", { ascending: true }));
    }
  }
  // 이 달에 하루도 안 굴러간 반은 청구할 것이 없다 (아직 개강 전 · 이미 종강).
  // 특강반은 반이 아니라 재원생 속성이다 (0164) — 아래 「특강」 그룹이 잇는다.
  classes = (classes || []).filter((c) => overlaps(c, first, last) && !isExtra(c));

  /**
   * **파도** (속도 대원칙 1, 2026-08-21) — 서로 필요한 것이 없는 조회
   * 일곱을 직렬로 기다리고 있었다 (한 달에 한 번 여는 화면이지만
   * 3초짜리일 이유가 없다).
   */
  const [holQ, attQ, extQ, memQ, stuQ1, settings, tuiQ] = await Promise.all([
    supabase
      .from("holidays")
      .select("id, date, name, scope, class_id")
      .gte("date", first)
      .lte("date", last)
      .order("date", { ascending: true }),
    // fetchAll — 잘리면 결석·보강 필요·차액이 덜 계산된다 (돈이 틀린다)
    fetchAll(() => supabase
      .from("attendance")
      .select("student_id, date, status, makeup_of")
      .gte("date", first)
      .lte("date", last)
      .order("date").order("student_id")),
    // 이 달에 걸린 특강 (재원생 속성 — 0164). 요일·휴강 셈은 아래 JS 에서.
    // 0164 전 DB 면 error 로 오고, 그때는 특강 그룹이 안 뜰 뿐이다
    supabase
      .from("student_extra_schedules")
      .select("id, student_id, label, days, start_time, from_date, to_date, fee, off_dates")
      .lte("from_date", last)
      .gte("to_date", first),
    supabase.from("class_students").select("class_id, student_id"),
    supabase
      .from("students")
      // 시작일은 enrolled_on 하나 (0127 — A18 합침)
      .select("id, name, grade, status, tuition, enrolled_on, ended_on")
      .in("status", ["enrolled", "paused"]),
    loadSettings(supabase),
    supabase.from("integrations").select("config").eq("id", "tuition").maybeSingle(),
  ]);
  const holidays = holQ.data;

  // 결석 · 보강 — 보강이 이미 잡힌 결석은 '보강 필요'에서 뺀다
  const attRows = attQ.data;
  const doneMakeup = new Set(
    (attRows || [])
      .filter((a) => a.status === "makeup" && a.makeup_of)
      .map((a) => `${a.student_id}|${a.makeup_of}`)
  );
  const absentOf = new Map();
  (attRows || [])
    .filter((a) => a.status === "absent" && !doneMakeup.has(`${a.student_id}|${a.date}`))
    .forEach((a) => {
      absentOf.set(a.student_id, [...(absentOf.get(a.student_id) || []), a.date]);
    });

  const members = memQ.data;

  let students = stuQ1.data;
  if (!students) {
    // 0127 전 폴백 — 실패했을 때만 그대로 내려간다
    ({ data: students } = await supabase.from("students").select("id, name, grade, status"));
  }
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  const makeupDays = settings.schedule?.makeupDays || [];

  // 학년별 수강료 — 학년이 오르면 금액이 오른다.
  // 한 반에 학년이 섞여 있어도 학생마다 손으로 고쳐 넣지 않게 한다.
  const tuiRow = tuiQ.data;
  const byGrade = tuiRow?.config?.byGrade || {};

  // 받았는가 — 금액은 여기서 다시 계산하지 않는다. 저장하는 건 '받았다'뿐이다 (원칙1)
  const payQ = await supabase
    .from("payments")
    .select("student_id, ym, amount, paid_on, method, source, note")
    .eq("ym", ym);
  const payReady = !payQ.error;
  const payOf = new Map((payQ.error ? [] : payQ.data || []).map((p) => [p.student_id, p]));

  let total = 0;
  let totalCredit = 0;
  let totalMakeup = 0;
  let totalUnpaid = 0;
  const groups = (classes || []).map((klass) => {
    const { all, off, live, makeupOnly } = classSessions(ym, klass, holidays || [], makeupDays);
    const base = klass.base_sessions || live.length;
    const ids = (members || [])
      .filter((m) => m.class_id === klass.id)
      .map((m) => m.student_id);
    const rows = ids
      .map((id) => studentById.get(id))
      .filter(Boolean)
      .map((s) => {
        const unit = unitFor(s, klass, byGrade);
        const unitFrom = unitSource(s, klass, byGrade);
        const absent = absentOf.get(s.id) || [];
        const calc = studentAmount(live, base, unit, s, all, absent);
        const pay = payOf.get(s.id) || null;
        const paid = !!pay?.paid_on;
        // 안 받은 돈 — 금액이 안 적힌 학생은 셀 수 없으므로 뺀다
        if (!paid && calc.amount) totalUnpaid += calc.amount;
        return { student: s, ...calc, unit, unitFrom, pay, paid };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
    const sum = rows.reduce((a, r) => a + (r.amount || 0), 0);
    const makeupSum = rows.reduce((a, r) => a + (r.makeupNeeded || 0), 0);
    const creditSum = rows.reduce((a, r) => a + (r.credit || 0), 0);
    total += sum;
    totalCredit += creditSum;
    totalMakeup += makeupSum;
    return { klass, all, off, live, base, rows, sum, makeupSum, creditSum, makeupOnly };
  });

  // ── 특강 (재원생 속성 — 0164) ──────────────────────────────
  // label 이 곧 그룹. 금액은 정액 fee — 결석·휴강 무접촉(원장 확정).
  // 납부(받음) 체크는 안 그린다 — payments 는 학생당 한 달 한 줄이라
  // (0055 unique) 특강 줄의 체크가 정규 줄까지 「받음」 으로 덮는다.
  // 특강비 분리 납부는 미정(원장) — 그래서 pay 를 아예 안 싣고,
  // totalUnpaid 에도 특강 fee 를 안 더한다. 합계(total)에만 들어간다.
  {
    const inMonth = (extQ?.data || []).filter((x) => x.fee !== null && x.fee !== undefined);
    const byLabel = new Map();
    inMonth.forEach((x) => {
      if (!byLabel.has(x.label)) byLabel.set(x.label, []);
      byLabel.get(x.label).push(x);
    });
    [...byLabel.entries()]
      .sort((a, b) => (a[1][0].start_time || "").localeCompare(b[1][0].start_time || ""))
      .forEach(([label, scheds]) => {
        const first0 = scheds[0];
        const klass = { id: `extra:${label}`, name: `특강 · ${label}`, days: first0.days || [],
                        virtual: true, tuition: null, base_sessions: null };
        // 회차 표시용 — 금액과 무관 (6단계 offSetFor 를 그대로 쓴다)
        const off0 = offSetFor(first0, holidays || []);
        const allD = sessionDates(ym, first0.days || [])
          .filter((d) => d >= first0.from_date && d <= first0.to_date);
        const rows = scheds.map((x) => {
          const s = studentById.get(x.student_id);
          if (!s) return null;
          return { student: s, amount: x.fee, sessions: allD.length, planned: allD.length,
                   base: allD.length, credit: 0, makeupNeeded: 0, full: true,
                   unit: x.fee, unitFrom: "특강", pay: null, paid: false };
        }).filter(Boolean).sort((a, b) => a.student.name.localeCompare(b.student.name, "ko"));
        if (rows.length === 0) return;
        const sum = rows.reduce((a, r) => a + (r.amount || 0), 0);
        total += sum;
        groups.push({ klass, all: allD, off: allD.filter((d) => off0.has(d)),
                      live: allD.filter((d) => !off0.has(d)), base: allD.length,
                      rows, sum, makeupSum: 0, creditSum: 0, makeupOnly: [] });
      });
  }

  // 반에 안 들어간 재원생 — 위 목록에 아예 안 나와서 청구를 빠뜨리기 쉽다
  const inClass = new Set((members || []).map((m) => m.student_id));
  // 특강만 듣는 학생은 반이 없어도 위 특강 그룹에 나온다 — 경고 대상이 아니다
  (extQ?.data || []).forEach((x) => inClass.add(x.student_id));
  const noClass = (students || [])
    .filter((s) => !inClass.has(s.id) && s.status === "enrolled")
    .map((s) => s.name);

  return (
    <>
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">운영</p>
          <h1 className="h1">수강료</h1>
          <Help>
            <p className="sub">
              휴강이 있어도 <b>수강료는 깎지 않고 보강으로 채웁니다.</b>
              보강을 못 해줄 경우 다음 달에 덜 받을 <b>차액</b>도 함께 계산해둡니다.
            </p>
          </Help>
        </div>
        <TuitionBoard
          ym={ym}
          groups={groups}
          holidays={holidays || []}
          total={total}
          totalCredit={totalCredit}
          totalMakeup={totalMakeup}
          makeupDays={makeupDays}
          noClass={noClass}
          unavailable={!ready}
          totalUnpaid={totalUnpaid}
          payReady={payReady}
          byGrade={byGrade}
          grades={[...new Set((students || []).map((s) => s.grade).filter(Boolean))].sort()}
        />
      </main>
    </>
  );
}
