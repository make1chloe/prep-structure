import { readFileSync } from "node:fs";

/**
 * **이어져 있어야 하는데 끊어진 자리**를 다시 끊기지 않게 지킨다.
 *
 * 2026-08-28 감사(⑥ 안 이어진 것)에서 「같은 사실이 두 곳에 저장되는데
 * 한쪽을 고쳐도 다른 쪽이 안 따라가는」 자리가 나왔다. 하나씩 이어 붙였고,
 * 이 검사가 **다시 끊어지면 빨개진다.**
 *
 * 검사는 코드 모양을 본다 — 「이 함수를 부르고 있는가」. 실제로 이어지는지는
 * 코드를 읽어야 알지만, 리팩터링하다 그 부름을 지우는 것이 실제로 일어난
 * 사고였다. 그것을 잡는 것이 목적이다.
 */
const bad = [];
const read = (p) => readFileSync(p, "utf8");

// ── 1) 로그인 아이디 (⑥-8) ────────────────────────────────
// 표의 글자(students.login_id)만 고치면 진짜 계정은 그대로라 그 아이디로
// 못 들어온다. 고치는 길은 renameStudentLogin 한 곳이어야 한다.
{
  const act = read("app/students/actions.js");
  const upd = act.slice(act.indexOf("export async function updateStudent"));
  const body = upd.slice(0, upd.indexOf("\nexport async function", 1));

  // allow 목록에 login_id 가 다시 들어오면 계정을 안 거치고 글자만 바뀐다
  const allow = body.slice(body.indexOf("const allow = ["), body.indexOf("];", body.indexOf("const allow = [")));
  if (/["']login_id["']/.test(allow)) {
    bad.push(
      "app/students/actions.js — updateStudent 의 고칠 수 있는 칸 목록에 login_id 가 있습니다. " +
        "아이디는 renameStudentLogin 으로 보내야 진짜 계정까지 같이 바뀝니다 (⑥-8)"
    );
  }
  if (!body.includes("renameStudentLogin(")) {
    bad.push(
      "app/students/actions.js — updateStudent 가 renameStudentLogin 을 안 부릅니다. " +
        "아이디를 고쳐도 그 아이디로 로그인이 안 됩니다 (⑥-8)"
    );
  }

  const acc = read("app/students/accountActions.js");
  if (!/export async function renameStudentLogin/.test(acc)) {
    bad.push("app/students/accountActions.js — renameStudentLogin 이 없습니다 (⑥-8)");
  } else {
    const fn = acc.slice(acc.indexOf("export async function renameStudentLogin"));
    const body2 = fn.slice(0, fn.indexOf("\nexport async function", 1));
    // 진짜 계정의 이메일을 안 바꾸면 이름만 바꾼 셈이다
    if (!/admin\(key, `\/users\/\$\{s\.profile_id\}`, "PUT"/.test(body2) || !body2.includes("emailOf(next)")) {
      bad.push(
        "app/students/accountActions.js — renameStudentLogin 이 진짜 계정 이메일(emailOf)을 " +
          "안 바꿉니다. 표만 바뀌면 그 아이디로 못 들어옵니다 (⑥-8)"
      );
    }
  }
}

if (bad.length) {
  console.log("❌ 이어져 있어야 하는 자리가 끊어졌습니다:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log("✅ 두 곳에 나뉜 값들이 한 길로 이어져 있습니다");
