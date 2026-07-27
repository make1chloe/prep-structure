import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import CopyBox from "./CopyBox";

export const dynamic = "force-dynamic";

/**
 * Supabase 에 붙여 넣을 SQL.
 *
 * SQL 은 깃 저장소 안의 파일이라 Supabase 화면에서는 찾을 수 없다.
 * (SQL Editor 의 "Untitled query" 는 그냥 빈 종이다.)
 * 매번 깃허브에 들어가 복사해 오는 게 번거로워서 여기서 바로 복사한다.
 */
export default async function SqlPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  let sql = "";
  try {
    sql = await fs.readFile(path.join(process.cwd(), "supabase", "SETUP_ALL.sql"), "utf8");
  } catch {
    sql = "";
  }

  return (
    <>
      <TopBar profile={profile} active="settings" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">Supabase SQL</h1>
        </div>

        <div className="card">
          <b style={{ fontSize: 14 }}>이 순서로 하시면 됩니다</b>
          <ol className="hint" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            <li>아래 <b>전체 복사</b> 를 누릅니다.</li>
            <li>
              Supabase → 왼쪽 <b>SQL Editor</b> → Untitled query 안을 클릭하고{" "}
              <b>Ctrl+A 로 전체 선택 후 지웁니다.</b>
            </li>
            <li>
              빈 칸에 붙여넣습니다. <b>지난번 내용 아래에 덧붙이지 마세요</b> — 통째로 갈아끼우는
              것입니다.
            </li>
            <li>
              오른쪽 아래 <b>Run</b> (또는 Ctrl+Enter) 을 누릅니다.
            </li>
            <li>
              <b>Success</b> 가 뜨면 끝입니다. 여러 번 눌러도 안전하게 만들어 두었습니다.
            </li>
          </ol>
          <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.8 }}>
            <b>빨간 에러가 났다면</b> — 한 덩어리로 실행되기 때문에{" "}
            <b>아무것도 반영되지 않습니다.</b> DB 가 망가진 게 아니니 그대로 두셔도 됩니다.
            에러 문구를 알려주시면 봐드릴게요.
          </p>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 14 }}>SETUP_ALL.sql</b>
          <p className="hint" style={{ margin: "4px 0 10px" }}>
            처음부터 지금까지가 순서대로 다 들어 있습니다. 이미 있는 것은 전부 건너뜁니다.
            새 프로젝트든 쓰던 프로젝트든 <b>이 파일 하나면</b> 됩니다.
            아래 줄 수가 편집기에 붙여넣은 줄 수와 같아야 합니다.
          </p>
          <CopyBox sql={sql} empty={!sql} />
        </div>
      </main>
    </>
  );
}
