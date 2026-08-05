import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * 구글 캘린더가 부르는 주소 — `/api/calendar?t=열쇠`
 *
 * 구글은 **로그인 없이** 이 주소를 부른다. 그래서 로그인 대신 주소에 붙은
 * 긴 열쇠로 확인한다. 확인은 DB 함수(0078)가 하고, 여기서는 받은 것을
 * 달력 파일 모양으로 옮겨 적기만 한다.
 *
 * 한 방향이다 — 앱 → 구글. 구글에서 넣은 일정은 앱으로 안 온다.
 */

/** 달력 파일은 줄 하나가 75옥텟을 넘으면 안 된다 — 넘으면 접어 준다 */
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 73) return line;
  const out = [];
  let cur = Buffer.alloc(0);
  for (const ch of [...line]) {
    const b = Buffer.from(ch, "utf8");
    if (cur.length + b.length > 72) {
      out.push(cur.toString("utf8"));
      cur = Buffer.alloc(0);
    }
    cur = Buffer.concat([cur, b]);
  }
  if (cur.length) out.push(cur.toString("utf8"));
  return out.join("\r\n ");
}

/** 달력 파일에서 뜻이 있는 글자들을 막아준다 */
function esc(v) {
  return (v ?? "")
    .toString()
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const ymd = (d) => `${d}`.slice(0, 10).replace(/-/g, "");

/** 끝나는 날의 **다음 날** — 달력은 끝을 안 포함해서 센다 */
function dayAfter(d) {
  const t = new Date(`${`${d}`.slice(0, 10)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!token) {
    return new Response("주소에 열쇠가 없습니다.", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });

  if (error) {
    // 0078 을 아직 안 넣었거나 주소가 틀렸다 — 어느 쪽인지는 밖에 알리지 않는다
    return new Response("달력을 내줄 수 없습니다.", { status: 404 });
  }

  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//클로이영어//일정//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:클로이영어 일정",
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  for (const e of data || []) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${esc(e.uid)}@chloe-english`);
    lines.push(`DTSTAMP:${now}`);
    // 하루 종일 일정으로 넣는다 — 시간까지 맞추면 시간대 때문에 하루씩 밀린다
    lines.push(`DTSTART;VALUE=DATE:${ymd(e.from_date)}`);
    lines.push(`DTEND;VALUE=DATE:${dayAfter(e.to_date || e.from_date)}`);
    lines.push(fold(`SUMMARY:${esc(`[${e.kind}] ${(e.title || "").trim()}`)}`));
    if (e.note) lines.push(fold(`DESCRIPTION:${esc(e.note)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="chloe-english.ics"',
    },
  });
}
