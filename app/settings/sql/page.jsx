import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import CopyBox from "./CopyBox";
import { checkSchema } from "./status";
import { loadSteps } from "./steps";
import { SUPABASE_URL } from "@/lib/supabase/env";
import StepBox from "./StepBox";

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

  // 앱이 실제로 붙어 있는 프로젝트 — SQL 을 돌리는 곳과 같아야 한다
  const host = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return SUPABASE_URL;
    }
  })();
  const projectRef = host.split(".")[0];

  const checks = await checkSchema();
  const done = checks.filter((c) => c.ok).length;
  const steps = await loadSteps();
  const missing = checks.filter((c) => !c.ok).map((c) => c.id);

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

        <div className="card" style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 14 }}>앱이 보고 있는 프로젝트</b>
          <p
            className="mono"
            style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700, letterSpacing: 0.3 }}
          >
            {projectRef}
          </p>
          <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.8 }}>
            SQL 을 실행하신 Supabase 화면의 주소창을 보세요.
            <br />
            <code>supabase.com/dashboard/project/<b>{projectRef}</b></code> 이어야 합니다.
            <br />
            <b>다르면 다른 프로젝트에 SQL 을 넣고 계신 겁니다.</b> 아무리 Run 해도 앱은 안 바뀝니다.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
            <b style={{ fontSize: 14 }}>지금 DB 상태</b>
            <span className={`tag ${done === checks.length ? "tag-mint" : "tag-amber"}`}>
              {done} / {checks.length}
            </span>
            {done === checks.length && <span className="hint">다 들어가 있습니다</span>}
          </div>
          <div className="stack" style={{ gap: 3, marginTop: 8 }}>
            {checks.map((c) => (
              <div className="unitrow" key={c.id + c.col}>
                <span className={`tag ${c.ok ? "tag-mint" : "tag-amber"}`}>{c.ok ? "OK" : "없음"}</span>
                <span className="hint" style={{ minWidth: 44 }}>{c.id}</span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{c.label}</span>
                {!c.ok && (
                  <span className="hint" style={{ fontSize: 11, maxWidth: 320, textAlign: "right" }}>
                    {c.why}
                  </span>
                )}
              </div>
            ))}
          </div>
          {done < checks.length && (
            <div className="hint" style={{ marginTop: 10, lineHeight: 1.9 }}>
              <b>없음</b> 이 있으면 아래 SQL 을 실행해주세요. 실행하고 이 화면을 새로고침하면 바뀝니다.
              <br />
              <b>실행했는데도 숫자가 그대로라면 = 에러가 나서 아무것도 안 들어간 것입니다.</b>{" "}
              (Supabase 는 한 덩어리로 실행해서, 하나라도 실패하면 전부 취소됩니다)
              <br />
              그럴 때는 맨 아래 <b>하나씩 실행하기</b> 에서 <b>안 들어간 것 중 맨 위 하나</b>만 따로
              Run 해보세요. 어느 구문이 문제인지 바로 나옵니다.
              <br />
              <br />
              <b>Success 가 떴는데도 여기가 안 바뀐다면</b> 둘 중 하나입니다.
              <br />
              ① 위에 적힌 프로젝트가 아닌 <b>다른 프로젝트</b>에 넣었다
              <br />
              ② Supabase 가 바뀐 표를 아직 못 읽었다 — SQL Editor 에 아래 한 줄만 Run 해보세요
              <br />
              <code style={{ fontSize: 12 }}>notify pgrst, &apos;reload schema&apos;;</code>
            </div>
          )}
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

        <StepBox steps={steps} missing={missing} />
      </main>
    </>
  );
}
