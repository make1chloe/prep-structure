import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import PrincipalOnly from "@/components/PrincipalOnly";
import TuitionBoard from "./TuitionBoard";
import { classSessions, studentAmount, monthRange, unitFor, unitSource } from "@/lib/tuition";
import { loadSettings } from "@/lib/settings";
import { overlaps, isExtra } from "@/lib/classTerm";
import { todaySeoul } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function TuitionPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  // 메뉴에서 감추는 것만으로는 부족하다 — 주소를 알면 그냥 열린다 (0079)
  if (profile?.role !== "principal") {
    return <PrincipalOnly profile={profile} what="수강료 화면" />;
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
  // 이 달에 하루도 안 굴러간 반은 청구할 것이 없다 (지난 특강 · 아직 개강 전)
  classes = (classes || []).filter((c) => overlaps(c, first, last));

  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, date, name, scope, class_id")
    .gte("date", first)
    .lte("date", last)
    .order("date", { ascending: true });

  // 결석 · 보강 — 보강이 이미 잡힌 결석은 '보강 필요'에서 뺀다
  const { data: attRows } = await supabase
    .from("attendance")
    .select("student_id, date, status, makeup_of")
    .gte("date", first)
    .lte("date", last);
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

  // 특강 결석은 반별 출결에서 센다.
  //   정규는 왔는데 특강만 빠지는 날이 있고, 그 반의 보강·차액은 그 반에만
  //   걸려야 한다. 예전처럼 하루 출결 하나로 세면 정규까지 같이 결석 처리된다.
  const { data: clsAtt } = await supabase
    .from("class_attendance")
    .select("class_id, student_id, date, status, makeup_of")
    .gte("date", first)
    .lte("date", last);
  const clsMakeup = new Set(
    (clsAtt || [])
      .filter((a) => a.status === "makeup" && a.makeup_of)
      .map((a) => `${a.class_id}|${a.student_id}|${a.makeup_of}`)
  );
  const extraAbsentOf = new Map();
  (clsAtt || [])
    .filter(
      (a) =>
        a.status === "absent" && !clsMakeup.has(`${a.class_id}|${a.student_id}|${a.date}`)
    )
    .forEach((a) => {
      const k = `${a.class_id}|${a.student_id}`;
      extraAbsentOf.set(k, [...(extraAbsentOf.get(k) || []), a.date]);
    });

  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id");

  let { data: students } = await supabase
    .from("students")
    .select("id, name, grade, status, tuition, started_on, ended_on")
    .in("status", ["enrolled", "paused"]);
  if (!students) {
    ({ data: students } = await supabase.from("students").select("id, name, grade, status"));
  }
  const studentById = new Map((students || []).map((s) => [s.id, s]));

  const settings = await loadSettings(supabase);
  const makeupDays = settings.schedule?.makeupDays || [];

  // 학년별 수강료 — 학년이 오르면 금액이 오른다.
  // 한 반에 학년이 섞여 있어도 학생마다 손으로 고쳐 넣지 않게 한다.
  const { data: tuiRow } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "tuition")
    .maybeSingle();
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
        // 특강은 그 반 출결만, 정규반은 그날 출결을 본다
        const absent = isExtra(klass)
          ? extraAbsentOf.get(`${klass.id}|${s.id}`) || []
          : absentOf.get(s.id) || [];
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

  // 반에 안 들어간 재원생 — 위 목록에 아예 안 나와서 청구를 빠뜨리기 쉽다
  const inClass = new Set((members || []).map((m) => m.student_id));
  const noClass = (students || [])
    .filter((s) => !inClass.has(s.id) && s.status === "enrolled")
    .map((s) => s.name);

  return (
    <>
      <TopBar profile={profile} active="tuition" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">수강료</p>
          <h1 className="h1">이번 달 회차 · 수강료</h1>
          <p className="sub">
            휴강이 있어도 <b>수강료는 깎지 않고 보강으로 채웁니다.</b>
            보강을 못 해줄 경우 다음 달에 덜 받을 <b>차액</b>도 함께 계산해둡니다.
          </p>
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
