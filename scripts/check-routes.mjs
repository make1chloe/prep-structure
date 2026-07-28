// 학생이 열 수 있는 화면이 늘어나지 않았는지 본다.
//
// 막는 곳은 미들웨어 한 군데다. 새 페이지를 만들면 자동으로 막힌다 —
// 하지만 누군가 lib/roles.js 의 목록에 무심코 한 줄을 더하면 그날로 뚫린다.
// 그래서 **목록 자체를 못 박아 둔다.** 늘리려면 이 파일도 같이 고쳐야 한다.

import { canOpen, isStaff } from "../lib/roles.js";
import fs from "node:fs";
import path from "node:path";

// 학생·학부모가 열어도 되는 것 — 여기 없는 것이 열리면 실패다
const ALLOWED = ["/me", "/logout", "/auth", "/login", "/apply", "/push", "/manifest", "/icons"];

const bad = [];

// 1) 앱 안의 모든 화면을 훑어 학생이 열 수 있는지 본다
function routes(dir, base = "") {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("_") || e.name.startsWith("(") || e.name.startsWith("[")) continue;
    const full = path.join(dir, e.name);
    const url = `${base}/${e.name}`;
    if (fs.existsSync(path.join(full, "page.jsx")) || fs.existsSync(path.join(full, "page.js"))) {
      out.push(url);
    }
    out.push(...routes(full, url));
  }
  return out;
}

for (const r of routes("app")) {
  const open = canOpen("student", r);
  const listed = ALLOWED.some((p) => r === p || r.startsWith(`${p}/`));
  if (open && !listed) bad.push(`학생이 열 수 있는데 목록에 없음: ${r}`);
  if (!open && listed) bad.push(`목록에 있는데 막혀 있음: ${r}`);
}

// 2) 선생님 화면 몇 개는 반드시 막혀 있어야 한다
for (const r of ["/today", "/students", "/tuition", "/settings", "/report", "/classes", "/import"]) {
  if (canOpen("student", r)) bad.push(`학생에게 열려 있음: ${r}`);
  if (canOpen("parent", r)) bad.push(`학부모에게 열려 있음: ${r}`);
  if (canOpen(null, r)) bad.push(`역할을 모르는 사람에게 열려 있음: ${r}`);
  if (!canOpen("principal", r)) bad.push(`원장이 못 여는 곳: ${r}`);
}

// 3) 역할 판정
if (isStaff("student") || isStaff("parent") || isStaff(null) || isStaff("")) {
  bad.push("학생·학부모가 선생님으로 판정됨");
}
if (!isStaff("principal") || !isStaff("instructor") || !isStaff("assistant")) {
  bad.push("선생님이 선생님으로 판정 안 됨");
}

if (bad.length) {
  console.log(bad.map((b) => `  ${b}`).join("\n"));
  process.exit(1);
}
console.log("  학생이 열 수 있는 화면 그대로");
