#!/usr/bin/env bash
# **진짜 Postgres 한 대** — 리눅스면 그 자리 initdb 로, 없으면 도커로.
#
# ── 왜 이 파일이 생겼나 (2026-08-28) ─────────────────────────
#
# 진짜 DB 가 있어야 도는 검사 다섯이 전부 이렇게 시작했다:
#
#     command -v initdb >/dev/null || { echo "postgres 가 없어 건너뜁니다"; exit 0; }
#
# 맥에는 initdb 가 없다. 그래서 RLS 유출(check-leak) · 학부모 가시성
# (check-parent) · 조교 차단(check-roles) · SETUP_ALL 멱등(check-sql) ·
# 옛 시험 이관(check-exam-merge) 다섯이 **한 줄도 안 돌고 rc=0** 으로 끝났고,
# check-pages 맨 끝에는 「✅ 전부 통과」 가 찍혔다. 학생 계정에 남의 것이
# 보이는지는 **한 번도 확인된 적이 없는데 통과로 보고**되고 있었다.
#
# 검사를 믿을 수 없으면 검사가 없는 것보다 나쁘다 — 있다고 여기게 되니까.
# 그래서 (1) 도커가 있으면 도커의 postgres:16 으로 진짜 돌리고,
#        (2) 그마저 없으면 「통과」 가 아니라 **「건너뜀」 으로 크게** 알린다.
#
# ── 쓰는 법 ─────────────────────────────────────────────────
#
#   . "$(dirname "$0")/pg-boot.sh"
#   pg_boot pgleak 55434 /var/tmp/pgleak || { pg_skip "학생 계정 유출 (RLS)"; exit 0; }
#   trap pg_stop EXIT
#   $Q -c "create database chloe;"
#
# 돌려주는 것:  Q (psql 앞머리) · PGMODE (native|docker)
# 도커일 때는 저장소의 supabase/ 를 컨테이너 /work 안에 넣어두므로
# `-f supabase/SETUP_ALL.sql` 같은 **상대 경로가 그대로 통한다.**

# ── postgres 가 어디 있나 — **맥과 리눅스가 다르다** (2026-09-03) ────────────
#
# 앞판은 리눅스 자리 하나만 봤다: /usr/lib/postgresql/16/bin.
# 맥에 postgresql@16 을 깔아도 그것은 **keg-only** 라 기본 PATH 에 안 올라온다
# (/opt/homebrew/opt/postgresql@16/bin). 그래서 `command -v initdb` 가 계속 빈손이고
# **검사 일곱이 그대로 건너뛰었다** — 이 파일이 없애려던 바로 그 일이다.
# → 있을 만한 자리를 차례로 물어본다. 못 찾으면 그때 도커로 간다.
_pg_bin() {
  local c
  for c in "${PG:-}" /usr/lib/postgresql/16/bin \
           /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
    [ -n "$c" ] && [ -x "$c/initdb" ] && { echo "$c"; return 0; }
  done
  # brew 가 다른 자리에 깔았을 수도 있다 — 사람에게 묻지 말고 brew 에게 묻는다
  if command -v brew >/dev/null 2>&1; then
    c=$(brew --prefix postgresql@16 2>/dev/null)/bin
    [ -x "$c/initdb" ] && { echo "$c"; return 0; }
  fi
  # 마지막으로 이미 PATH 에 있으면 그것을 쓴다
  c=$(command -v initdb 2>/dev/null) && [ -n "$c" ] && { dirname "$c"; return 0; }
  return 1
}
PG=$(_pg_bin || echo "")
[ -n "$PG" ] && export PATH="$PG:$PATH"
# 부르는 쪽은 모두 저장소 뿌리에서 도는 것을 전제로 `supabase/…` 를 적는다
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

PGMODE=""
PG_NAME=""
PG_DATA=""
Q=""

# 진짜로 못 돌렸을 때 — **통과라고 말하지 않는다.**
# check-pages 가 PGSKIP_FILE 을 쥐어주면 거기에도 한 줄 남겨서
# 맨 끝 요약에 노란 경고로 다시 뜨게 한다.
pg_skip() {
  echo "  ⚠️  건너뜀 (통과가 아닙니다) — $1"
  echo "     진짜 Postgres 가 없습니다. 리눅스면 postgresql-16,"
  echo "     맥이면 도커를 켜고 한 번만:  docker pull postgres:16"
  [ -n "${PGSKIP_FILE:-}" ] && echo "$1" >> "$PGSKIP_FILE"
  return 0
}

# pg_boot <도커이름> <포트(리눅스용)> <자료방(리눅스용)>
pg_boot() {
  local name=$1 port=$2 data=$3 i

  # ── 그 자리 postgres 로 띄운다 ────────────────────────────────────────
  #
  # ⚠️⚠️ **두 갈래다** (2026-09-03).
  #   리눅스 CI 는 root 로 돌고, postgres 는 root 로 못 뜬다 → `su postgres` 로 내려간다.
  #   맥은 제 계정으로 돌고 **`postgres` 라는 사용자가 아예 없다** → 그대로 띄운다.
  #   앞판은 리눅스 갈래 하나뿐이라, 맥에서는 initdb 를 깔아도 `chown postgres` 에서
  #   죽고 **아무 말 없이 건너뛰었다.**
  # ⚠️ 그리고 **떴는지 실제로 물어보고** 아니면 거짓을 준다 — 앞판은 `sleep 2` 뒤
  #   무조건 성공이라 했다. 안 떴는데 성공이라 하면 뒤따르는 psql 이 줄줄이 터진다.
  if [ -n "$PG" ] && command -v initdb >/dev/null 2>&1; then
    PGMODE=native; PG_DATA=$data
    rm -rf "$data"; mkdir -p "$data"

    if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
      chown postgres "$data"; chmod 700 "$data"
      su postgres -c "PATH=$PG:\$PATH initdb -D $data -U postgres -A trust" >/dev/null 2>&1
      su postgres -c "PATH=$PG:\$PATH pg_ctl -D $data -o '-p $port -k /var/tmp' -l $data/log start" >/dev/null 2>&1
    else
      # ⚠️⚠️ **맥에서는 LC_ALL 을 반드시 준다** (2026-09-03 실측).
      #   안 주면 initdb 는 되는데 pg_ctl 이 이렇게 죽는다:
      #     「포스트마스터가 시작하면서 멀티쓰레드 환경이 되었습니다」
      #     「LC_ALL 환경 설정값으로 알맞은 로케일 이름을 지정하세요」
      #   Homebrew 안내문도 같은 말을 한다. 이 한 줄이 없으면 **일곱이 그대로 건너뛴다.**
      chmod 700 "$data"
      LC_ALL="${LC_ALL:-en_US.UTF-8}" initdb -D "$data" -U postgres -A trust >/dev/null 2>&1
      LC_ALL="${LC_ALL:-en_US.UTF-8}" \
        pg_ctl -D "$data" -o "-p $port -k /var/tmp" -l "$data/log" start >/dev/null 2>&1
    fi

    Q="psql -h /var/tmp -p $port -U postgres -q"
    for i in $(seq 1 30); do
      pg_isready -h /var/tmp -p "$port" -U postgres >/dev/null 2>&1 && return 0
      sleep 1
    done
    # 안 떴다 — **성공이라 말하지 않는다.** 치운 뒤 도커 갈래로 넘어간다
    pg_stop; PGMODE=""; Q=""
  fi

  # 도커 — 이미지를 미리 받아둔 경우에만 (검사 도중에 몇 백 MB 를 받지 않는다)
  #
  # **이름을 두 가지로 물어본다** (2026-08-28, 원장님 맥에서 실측).
  # `docker images` 에는 `postgres:16` 이 멀쩡히 보이는데
  # `docker image inspect postgres:16` 만 「No such image」 였다 —
  # 요즘 Docker Desktop(containerd 이미지 저장소)에서 짧은 이름을 못 찾는 경우다.
  # 그래서 이 한 줄 때문에 **이미지를 받아두고도 여섯 검사가 통째로 건너뛰었다.**
  # 그게 바로 이 파일이 없애려던 그 일이다. 긴 이름으로 한 번 더 물어본다.
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 \
     && { docker image inspect postgres:16 >/dev/null 2>&1 \
          || docker image inspect docker.io/library/postgres:16 >/dev/null 2>&1; }; then
    PGMODE=docker; PG_NAME=$name
    docker rm -f "$name" >/dev/null 2>&1
    docker run -d --name "$name" \
      -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_PASSWORD=chloe \
      postgres:16 >/dev/null 2>&1 || { PGMODE=""; return 1; }
    for i in $(seq 1 60); do
      docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
      sleep 1
    done
    if ! docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then
      docker rm -f "$name" >/dev/null 2>&1; PGMODE=""; return 1
    fi
    # SQL 파일을 컨테이너 안에서 그대로 -f 로 읽게 넣어둔다
    docker exec "$name" mkdir -p /work >/dev/null 2>&1
    docker cp supabase "$name":/work/supabase >/dev/null 2>&1 || { pg_stop; return 1; }
    Q="docker exec -i -w /work $name psql -U postgres -q"
    return 0
  fi

  return 1
}

pg_stop() {
  case "$PGMODE" in
    docker) docker rm -f "$PG_NAME" >/dev/null 2>&1 ;;
    native) if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
              su postgres -c "PATH=$PG:\$PATH pg_ctl -D $PG_DATA stop" >/dev/null 2>&1
            else
              pg_ctl -D "$PG_DATA" stop >/dev/null 2>&1
            fi
            rm -rf "$PG_DATA" ;;
  esac
}

# ── 이 파일을 **직접 불렀을 때** (source 가 아니라) ─────────────────────────
#
# ⚠️⚠️ 왜 이 자리가 생겼나 (2026-09-03)
#   `scripts/live-month.mjs` 는 노드라서 이 파일을 source 못 한다. 그래서
#   **postgres 를 띄우는 일을 제 손으로 한 벌 더** 갖고 있었다(`startPg`/`stopPg`).
#   그 두 벌이 실제로 갈렸다 — 여기는 맥 갈래를 넣었는데 저기는 `su postgres` 뿐이라
#   **여섯은 돌고 「한 달 살아보기」만 계속 건너뛰었다.** 같은 값 두 벌이 하는 일이 그것이다(원칙 1).
#   → 노드가 이 문으로 물어보게 한다. 띄우는 법은 **이 파일 한 곳**에만 산다.
#
#   scripts/pg-boot.sh --bin                     → postgres 가 깔린 자리 (없으면 빈 줄)
#   scripts/pg-boot.sh --start <이름> <포트> <자료방>  → PGMODE=… / Q=… 두 줄. 못 띄우면 1
#   scripts/pg-boot.sh --stop  <모드> <이름> <자료방>  → 치운다
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --bin)   echo "${PG:-}" ;;
    --start) pg_boot "${2:?이름}" "${3:?포트}" "${4:?자료방}" || exit 1
             echo "PGMODE=$PGMODE"; echo "Q=$Q" ;;
    --stop)  PGMODE="${2:-}"; PG_NAME="${3:-}"; PG_DATA="${4:-}"; pg_stop ;;
    *)       echo "쓰는 법: $0 --bin | --start <이름> <포트> <자료방> | --stop <모드> <이름> <자료방>" >&2
             exit 2 ;;
  esac
fi
