/**
 * **선언보다 먼저 쓴 변수** — 빌드는 통과하고, 실행하면 터진다.
 *
 * 2026-08-07. `pushToFamilies` 안에서 `withAcademy(supabase, …)` 를
 * `const supabase = createClient()` **위**에 두었다. 자바스크립트는 그러면
 * 그 자리에서 던진다(TDZ). 그런데 `next build` 는 멀쩡히 통과했다 —
 * 문법은 맞기 때문이다. 원장님이 학부모 알림을 보내실 때까지 안 보인다.
 *
 * 같은 종류를 이미 한 번 겪었다 (manifest 의 ROLES 를 지웠는데 빌드가
 * 통과했다). **빌드가 안 잡아주는 자리는 따로 못 박아야 한다.**
 *
 * ── 왜 eslint 규칙을 그냥 쓰지 않나 ──────────────────────
 *
 * `no-use-before-define` 은 **함수 안에서 나중에 쓰는 것**까지 잡는다 —
 *
 *     function pushState() { lastError = e }   ← 나중에 불린다. 멀쩡하다
 *     let lastError = null
 *
 * 이건 사고가 아니라 흔한 모양이다. 다 잡으면 잔소리가 되고, 잔소리가
 * 되면 이 검사를 끄게 된다. 그래서 **같은 함수 안에서 곧바로 위에 쓴 것**
 * 만 잡는다 — 실행 순서가 정해져 있어서 반드시 터지는 경우다.
 *
 * 쓰는 법:  node scripts/check-tdz.mjs
 */
import { Linter } from "eslint";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const linter = new Linter();

/** 이 마디를 감싸는 가장 가까운 함수 (없으면 파일 전체) */
function fnOf(node) {
  for (let n = node; n; n = n.parent) {
    if (/Function/.test(n.type) || n.type === "Program") return n;
  }
  return null;
}

linter.defineRule("tdz/same-scope", {
  create(context) {
    return {
      "Program:exit"() {
        const walk = (scope) => {
          for (const v of scope.variables) {
            const def = v.defs[0];
            // const · let · class 만. var 와 function 은 끌어올려진다
            if (!def || !["Variable", "ClassName"].includes(def.type)) continue;
            if (def.parent?.kind === "var") continue;
            const declAt = def.name.range[0];
            const declFn = fnOf(def.name);
            for (const ref of v.references) {
              const at = ref.identifier.range[0];
              if (at >= declAt) continue;                 // 선언 뒤면 정상
              if (fnOf(ref.identifier) !== declFn) continue; // 다른 함수 안이면 나중에 돈다
              context.report({
                node: ref.identifier,
                message: `'${v.name}' 을 선언(${def.name.loc.start.line}줄)보다 먼저 씁니다 — 실행하면 여기서 터집니다.`,
              });
            }
          }
          scope.childScopes.forEach(walk);
        };
        walk(context.getScope());
      },
    };
  },
});

const files = globSync(["app/**/*.js", "app/**/*.jsx", "lib/**/*.js", "components/**/*.jsx"]);

let bad = 0;
for (const f of files) {
  const msgs = linter.verify(readFileSync(f, "utf8"), {
    parserOptions: { ecmaVersion: 2023, sourceType: "module", ecmaFeatures: { jsx: true } },
    env: { browser: true, node: true, es2023: true },
    rules: { "tdz/same-scope": "error" },
  }, f);
  // 파일 안의 `eslint-disable react-hooks/…` 주석은 여기서 알 바가 아니다
  for (const m of msgs.filter((x) => x.ruleId === "tdz/same-scope")) {
    console.log(`  ✗ ${f}:${m.line}  ${m.message}`);
    bad = 1;
  }
}

if (bad) {
  console.log("\n❌ 선언보다 먼저 쓴 것이 있습니다 (실행하면 터집니다)");
  process.exit(1);
}
console.log(`✅ 선언 순서 통과 (${files.length}개 파일)`);
