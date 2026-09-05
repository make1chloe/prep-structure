/** 「누가 무엇을 보나」 — 원장님이 켜고 끄신다(원장님 9/3). 기본값은 코드에 없다: 안 정한 칸은 막혀 있고 여기서 정하신다.
 *  열쇠 목록은 lib/perm.js 한 벌. 옛 앱에서 정하신 32칸이 그대로 옮겨 와 있다 */
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { ROLES, ROLE_NAME } from "@/lib/roles";
import { KEYS, GROUP_NAME, decide } from "@/lib/perm";
import { setAccess } from "./actions.js";
export const dynamic = "force-dynamic";
const ROLE_ORDER = [ROLES.INSTRUCTOR, ROLES.ASSISTANT, ROLES.STUDENT, ROLES.PARENT];
export default async function Access() {
  const { sb, me } = await guard();
  if (me?.role !== ROLES.PRINCIPAL) return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🔐</span>원장님만 여는 자리입니다</div></div></main>;
  const rows = (await db(sb).from("role_access").select("role,key,allowed")).data ?? [];
  const groups = [...new Set(KEYS.map((k) => k.group))];
  return (
    <main className="frame" style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <div className="card">
        <div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나</div>
        <p className="note">켬·끔·안 정함 셋입니다. <b>안 정함은 막혀 있습니다.</b> 원장님은 늘 다 보시므로 여기 없습니다.</p>
        {groups.map((g) => (
          <div key={g} className="tblwrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>{GROUP_NAME[g]}</th>{ROLE_ORDER.filter((r) => KEYS.some((k) => k.group === g && k.roles.includes(r))).map((r) => <th key={r}>{ROLE_NAME[r]}</th>)}</tr></thead>
              <tbody>
                {KEYS.filter((k) => k.group === g).map((k) => (
                  <tr key={k.key}><td><b>{k.name}</b> <small className="note" style={{ display: "inline" }}>{k.key}</small></td>
                    {ROLE_ORDER.filter((r) => KEYS.some((x) => x.group === g && x.roles.includes(r))).map((r) => {
                      if (!k.roles.includes(r)) return <td key={r}>—</td>;
                      const v = decide(r, rows, k.key);
                      return <td key={r}><form className="seg sm" action={setAccess} aria-label={`${ROLE_NAME[r]} ${k.name}`} style={{ display: "inline-flex" }}>
                        <input type="hidden" name="role" value={r} /><input type="hidden" name="key" value={k.key} />
                        <button type="submit" name="allowed" value="1" aria-pressed={v === true}>켬</button>
                        <button type="submit" name="allowed" value="0" aria-pressed={v === false}>끔</button>
                      </form>{v === null && <span className="tag" style={{ marginLeft: 4 }}>안 정함</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </main>
  );
}
