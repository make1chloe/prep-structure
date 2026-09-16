set -o pipefail
cd /tmp/v2wt
bash scripts/e2e/run.sh > .gate-run-full.log 2>&1; echo "run exit $?"
grep -E "❌|■ 화면 걷기|■ 오늘 수업 걷기|어62|어63" .gate-run-full.log | tail -16
echo "=== all"
DATABASE_URL="postgres://postgres@127.0.0.1:55440/chloe" SKIP_BUILD=1 bash scripts/check-all.sh > .gate-all-full.log 2>&1; echo "all exit $?"
grep -E "❌|합계" .gate-all-full.log | tail -10
echo "gate done"
