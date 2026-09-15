/** 씨앗·리허설 검사((어45) · 원장님 9/15 「zz 들어가는 반 학생은 다 뭐야 용도가」) · 리허설 줄이 실 DB 에 다시 못 들어가고, 들어간 것은 지우지 않고 내릴 수 있나.
 *  ① 씨앗(scripts/e2e/seed.sql)의 첫 문장은 문지기(눌러보기 DB chloe 에서만) ② 씨앗·0004 의 사람·학생·반·학교·교재·항목 줄은 fixture/rehearsal 표시나 zz_ 이름을 단다(정리 SQL 이 찾을 수 있게)
 *  ③ 정리 SQL(docs/sql-paste/0-리허설-정리.sql)은 delete·truncate 0 · auth 0 · chloe 문지기 · 상태 있는 표 여덟을 다 내린다 · 다시 돌려도 같다(state <> 조건) ④ 붙여넣기 README 에 링크 */
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const stripSql = (s) => s.replace(/--[^\n]*/g, "");
const seed = readFileSync("scripts/e2e/seed.sql", "utf8"), seedS = stripSql(seed);
const firstStmt = seedS.trim().split(";")[0];
ok("씨앗의 첫 문장은 문지기(current_database() <> 'chloe' 면 멈춤) · up.sh 는 chloe 에 넣는다", /current_database\(\) <> 'chloe'/.test(firstStmt) && /raise exception/.test(firstStmt) && /-d chloe/.test(readFileSync("scripts/e2e/up.sh", "utf8")));
const marked = (sql, tables) => { const out = []; for (const m of stripSql(sql).matchAll(/insert into v2\.([a-z_]+)\s*\(([^)]*)\)[\s\S]*?(?=insert into v2\.|$)/g)) { if (!tables.includes(m[1])) continue; const body = m[0]; if (!/'fixture'|'rehearsal'/.test(body) && !/zz_/.test(body)) out.push(m[1]); } return out; };
const PEOPLE = ["profiles", "students", "classes", "schools", "books", "learn_items", "video", "material"];
const SEEDED = ["profiles", "students", "classes", "schools", "books", "learn_items", "video", "material_type"];   // 자료(material)는 제 유형(material_type zz_)으로 잡는다
ok("씨앗의 사람·학생·반·학교·교재·항목·영상·자료 유형 줄은 fixture/rehearsal 표시나 zz_ 이름을 단다(정리 SQL 이 찾는다 · 자료는 제 유형으로)", marked(seed, SEEDED).length === 0, marked(seed, SEEDED).join(","));
const fx = readFileSync("supabase/migrations/0004_fixture.sql", "utf8");
ok("0004 의 사람·학생·반 줄은 전부 import_batch 'fixture'", marked(fx, ["profiles", "students", "classes"]).length === 0, marked(fx, ["profiles", "students", "classes"]).join(","));
const retire = readFileSync("docs/sql-paste/0-리허설-정리.sql", "utf8"), rS = stripSql(retire);
ok("정리 SQL · delete·truncate·drop 0 · auth·public 0 · chloe 문지기 · 지우지 않는다", !/\b(delete|truncate|drop)\b/i.test(rS) && !/auth\.|public\./.test(rS) && /current_database\(\) = 'chloe'/.test(rS) && /raise exception/.test(rS));
const covered = PEOPLE.filter((t) => new RegExp(`update v2\\.${t} set state = '[a-z]+' where state <> '`).test(rS));
ok(`정리 SQL · 상태 있는 표 여덟을 다 내린다(사람 left · 학생 left · 반 closed · 학교 closed · 교재 stopped · 항목 retired · 영상 hidden · 자료 dropped) · 다시 돌려도 같다(state <> 조건) · fixture 또는 zz_ 이름`, covered.length === PEOPLE.length && /import_batch = 'fixture' or name ilike 'zz\\_%'/.test(rS) && /type_id in \(select id from v2\.material_type where name ilike/.test(rS) && /get diagnostics n = row_count/.test(rS), PEOPLE.filter((t) => !covered.includes(t)).join(","));
ok("붙여넣기 README 가 정리 SQL 을 바로 보이는 링크로 안내한다(원장님 9/15 「sql은 항상 바로보이는 링크로줘」)", /raw\.githubusercontent\.com\/make1chloe\/prep-structure\/v2\/docs\/sql-paste\/0-리허설-정리\.sql/.test(readFileSync("docs/sql-paste/README.md", "utf8")));
console.log(`\n■ 씨앗·리허설 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
