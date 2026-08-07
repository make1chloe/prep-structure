import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import PrincipalOnly from "@/components/PrincipalOnly";
import IconBox from "../screen/IconBox";
import { checkSchema } from "../sql/status";

export const dynamic = "force-dynamic";

/**
 * **관리자** — 다 만들고 나면 안 여는 것들 (2026-08-07).
 *
 * 원장님 — 「노션이관과 sql db등 웹앱 자체가 완성되고 나면 안쓰는 기능들은
 * 따로 모아줘」
 *
 * 설정 메뉴에 「알림·연동」·「문구」·「화면」 과 나란히 「Supabase SQL」·
 * 「노션 이관」 이 있었다. 앞의 셋은 운영하면서 계속 여는 것이고 뒤의 둘은
 * **집을 다 짓고 나면 안 쓰는 연장**이다. 같은 줄에 있으면 매번 눈으로
 * 걸러야 하고, 조교 선생님이 잘못 눌러 들어갈 자리도 된다.
 *
 * 없애지는 않는다 — 새 기능을 넣을 때마다 SQL 은 한 번씩 돌려야 하고,
 * 옛 자료를 다시 볼 일도 생긴다. 한 칸 뒤로 옮길 뿐이다.
 */
export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }
  if (profile?.role !== "principal") {
    return <PrincipalOnly profile={profile} what="관리자 화면" />;
  }

  // 아직 안 돌린 SQL 이 있으면 그것만은 눈에 띄어야 한다 —
  // 표가 없으면 그 기능이 **조용히** 안 되기 때문이다
  const checks = await checkSchema();
  const missing = checks.filter((c) => !c.ok);

  const ROWS = [
    {
      href: "/settings/sql",
      label: "Supabase SQL",
      desc: "새 기능을 넣으면 표를 한 번 만들어줘야 합니다",
      tag: missing.length
        ? { text: `안 돌린 것 ${missing.length}`, cls: "tag-amber" }
        : { text: "전부 돌아감", cls: "tag-mint" },
    },
    {
      href: "/import",
      label: "노션 이관",
      desc: "노션에서 내보낸 CSV 를 올려 옛 기록을 가져옵니다",
    },
    {
      href: "/install",
      label: "홈 화면에 담기",
      desc: "원장 · 학부모 · 학생 앱을 따로 담아 확인할 때",
    },
  ];

  return (
    <>
      <TopBar profile={profile} active="settings" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">관리자</h1>
          <p className="sub">
            처음 한 번 하고 <b>거의 안 여는 것들</b>입니다. 매일 쓰는 설정과 섞이지 않게 여기 모아뒀어요.
          </p>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          {ROWS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="unitrow"
              style={{ textDecoration: "none" }}
            >
              <b style={{ fontSize: 13.5, minWidth: 120 }}>{r.label}</b>
              {r.tag && <span className={`tag ${r.tag.cls}`}>{r.tag.text}</span>}
              <span className="hint" style={{ flex: 1 }}>{r.desc}</span>
              <span className="hint">›</span>
            </Link>
          ))}
        </div>

        {/* 아이콘은 로고를 바꾸실 때만 여는 것이라 여기 둔다 */}
        <div style={{ marginTop: 14 }}>
          <IconBox />
        </div>
      </main>
    </>
  );
}
