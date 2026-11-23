#!/usr/bin/env bash
set -uo pipefail

AUDIT_DIR="${AUDIT_DIR:-$HOME/audit}"
LOG_DIR="$AUDIT_DIR/logs"
mkdir -p "$LOG_DIR"
VERSIONS=(12 13 14 16 17 18)

PSQL_HEADER=$'\\pset tuples_only on\n\\pset format unaligned\n'
RESET_T=$'DROP TABLE IF EXISTS t CASCADE;\nCREATE TABLE t(id int primary key, a int);\nINSERT INTO t SELECT i, i FROM generate_series(1,1000) g(i);'
RESET_FK=$'DROP TABLE IF EXISTS t CASCADE;\nDROP TABLE IF EXISTS fkparent CASCADE;\nCREATE TABLE fkparent(id int primary key);\nINSERT INTO fkparent SELECT i FROM generate_series(1,1000) g(i);\nCREATE TABLE t(id int primary key, a int);\nINSERT INTO t SELECT i, i FROM generate_series(1,1000) g(i);'
RFN_BEFORE="SELECT 'RFN_BEFORE|' || relfilenode::text FROM pg_class WHERE oid = 't'::regclass;"
RFN_AFTER="SELECT 'RFN_AFTER|' || relfilenode::text FROM pg_class WHERE oid = 't'::regclass;"
LOCKS="SELECT 'LOCK|' || relation::regclass::text || '|' || mode FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'relation' ORDER BY 1;"
LOCKS_ADD_NOT_VALID="SELECT 'LOCK_ADD_NOT_VALID|' || relation::regclass::text || '|' || mode FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'relation' ORDER BY 1;"
LOCKS_VALIDATE="SELECT 'LOCK_VALIDATE|' || relation::regclass::text || '|' || mode FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'relation' ORDER BY 1;"

annotate_probe() {
  local tmp="$1" rc="$2"
  local before after rewrite locks errors notices debugs hints
  before=$(awk -F'|' '$1 == "RFN_BEFORE" { v = $2 } END { if (v != "") print v }' "$tmp")
  after=$(awk -F'|' '$1 == "RFN_AFTER" { v = $2 } END { if (v != "") print v }' "$tmp")
  if [[ -n "$before" || -n "$after" ]]; then
    if [[ -n "$before" && -n "$after" ]]; then
      if [[ "$before" == "$after" ]]; then rewrite=no; else rewrite=yes; fi
    else
      rewrite=unknown
    fi
    printf 'REWRITE|%s|before=%s|after=%s\n' "$rewrite" "${before:-missing}" "${after:-missing}"
  fi
  locks=$(awk -F'|' '$1 ~ /^LOCK/ { print $2 "=" $3 }' "$tmp" | sort -u | paste -sd ';' -)
  printf 'LOCK_SUMMARY|%s\n' "${locks:-none}"
  errors=$(awk '/^(ERROR|FATAL|PANIC):/ { line = $0; gsub(/\|/, "/", line); out = out (out ? " ;; " : "") line } END { print out }' "$tmp")
  hints=$(awk '/^(HINT|DETAIL):/ { line = $0; gsub(/\|/, "/", line); out = out (out ? " ;; " : "") line } END { print out }' "$tmp")
  notices=$(awk '/^NOTICE:/ { line = $0; gsub(/\|/, "/", line); out = out (out ? " ;; " : "") line } END { print out }' "$tmp")
  debugs=$(awk '/^DEBUG:/ { line = $0; gsub(/\|/, "/", line); out = out (out ? " ;; " : "") line } END { print out }' "$tmp")
  printf 'ERROR_SUMMARY|%s\n' "${errors:-none}"
  printf 'HINT_DETAIL_SUMMARY|%s\n' "${hints:-none}"
  printf 'NOTICE_SUMMARY|%s\n' "${notices:-none}"
  printf 'DEBUG_SUMMARY|%s\n' "${debugs:-none}"
  if [[ -n "$errors" ]]; then
    echo 'OUTCOME|error'
  else
    echo 'OUTCOME|no-error'
  fi
  printf 'PSQL_EXIT|%s\n' "$rc"
}

run_probe() {
  local version="$1" label="$2" sql="$3"
  local container="pg$version" tmp rc
  tmp=$(mktemp "$LOG_DIR/.probe.XXXXXX") || return 1
  printf '\n===== PROBE %s =====\n' "$label"
  {
    printf '%s' "$PSQL_HEADER"
    printf '%s\n' "$sql"
  } | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 >"$tmp" 2>&1
  rc=${PIPESTATUS[1]}
  cat "$tmp"
  annotate_probe "$tmp" "$rc"
  rm -f "$tmp"
}

run_psql_c() {
  local version="$1" label="$2" sql="$3"
  local container="pg$version" tmp rc
  tmp=$(mktemp "$LOG_DIR/.probe.XXXXXX") || return 1
  printf '\n===== PROBE %s =====\n' "$label"
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 -c "$sql" >"$tmp" 2>&1
  rc=$?
  cat "$tmp"
  annotate_probe "$tmp" "$rc"
  rm -f "$tmp"
}

control_query() {
  local container="$1" sql="$2"
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 -Atqc "$sql" 2>/dev/null | tr -d '[:space:]'
}

print_queue_file() {
  local scenario="$1" label="$2" file="$3"
  printf -- '--- lock-queue %s %s raw ---\n' "$scenario" "$label"
  cat "$file"
  printf 'exit=%s\n' "$(cat "$file.exit" 2>/dev/null || echo missing)"
}

run_queue_scenario() {
  local scenario="$1"
  local container=pg17 dir="$LOG_DIR/pg17-lockqueue"
  local resetout="$dir/$scenario-reset.out" aout="$dir/$scenario-A.out" bout="$dir/$scenario-B.out" cout="$dir/$scenario-C.out"
  local asql bsql csql pidA pidB pidC rc count seen_a seen_b
  local astart bstart cstart aend bend cend bwaitdetect boutcome coutcome aoutcome
  mkdir -p "$dir"
  rm -f "$resetout" "$resetout.exit" "$aout" "$aout.exit" "$bout" "$bout.exit" "$cout" "$cout.exit"

  {
    printf '%s' "$PSQL_HEADER"
    printf '%s\n' "$RESET_T"
  } | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 >"$resetout" 2>&1
  rc=${PIPESTATUS[1]}
  printf '%s\n' "$rc" >"$resetout.exit"
  printf 'QUEUE|%s|RESET_EXIT|%s\n' "$scenario" "$rc"

  asql=$'BEGIN;\nSELECT * FROM t LIMIT 1;\nSELECT pg_sleep(9);\nROLLBACK;'
  astart=$(date +%s%3N)
  (
    {
      printf '%s' "$PSQL_HEADER"
      printf '%s\n' "$asql"
    } | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 >"$aout" 2>&1
    echo "${PIPESTATUS[1]}" >"$aout.exit"
  ) &
  pidA=$!

  seen_a=no
  count=''
  for _ in $(seq 1 100); do
    count=$(control_query "$container" "SELECT count(*) FROM pg_locks WHERE relation = 't'::regclass AND locktype = 'relation' AND mode = 'AccessShareLock' AND granted")
    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= 1 )); then
      seen_a=yes
      break
    fi
    sleep 0.02
  done
  printf 'QUEUE|%s|A_LOCK_SEEN|%s|count=%s\n' "$scenario" "$seen_a" "$count"

  if [[ "$scenario" == locktimeout ]]; then
    bsql=$'SET lock_timeout = \'1s\';\nALTER TABLE t ADD COLUMN z int;'
  else
    bsql='ALTER TABLE t ADD COLUMN z int;'
  fi
  bstart=$(date +%s%3N)
  (
    {
      printf '%s' "$PSQL_HEADER"
      printf '%s\n' "$bsql"
    } | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 >"$bout" 2>&1
    echo "${PIPESTATUS[1]}" >"$bout.exit"
  ) &
  pidB=$!

  seen_b=no
  count=''
  bwaitdetect=missing
  for _ in $(seq 1 100); do
    count=$(control_query "$container" "SELECT count(*) FROM pg_locks WHERE relation = 't'::regclass AND locktype = 'relation' AND mode = 'AccessExclusiveLock' AND NOT granted")
    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= 1 )); then
      seen_b=yes
      bwaitdetect=$(( $(date +%s%3N) - bstart ))
      break
    fi
    sleep 0.02
  done
  printf 'QUEUE|%s|B_WAITING_SEEN|%s|count=%s|detected_after_ms=%s\n' "$scenario" "$seen_b" "$count" "$bwaitdetect"

  csql=$'SET statement_timeout = \'2s\';\nSELECT count(*) FROM t;'
  cstart=$(date +%s%3N)
  (
    {
      printf '%s' "$PSQL_HEADER"
      printf '%s\n' "$csql"
    } | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=0 >"$cout" 2>&1
    echo "${PIPESTATUS[1]}" >"$cout.exit"
  ) &
  pidC=$!

  wait "$pidC"
  cend=$(date +%s%3N)
  wait "$pidB"
  bend=$(date +%s%3N)
  wait "$pidA"
  aend=$(date +%s%3N)

  boutcome=unknown
  if grep -q 'canceling statement due to lock timeout' "$bout"; then
    boutcome=lock-timeout
  elif grep -q '^ALTER TABLE' "$bout"; then
    boutcome=completed
  elif grep -q '^ERROR:' "$bout"; then
    boutcome=other-error
  fi
  coutcome=unknown
  if grep -q 'canceling statement due to statement timeout' "$cout"; then
    coutcome=statement-timeout
  elif grep -Eq '^1000[[:space:]]*$' "$cout"; then
    coutcome=count-returned
  elif grep -q '^ERROR:' "$cout"; then
    coutcome=other-error
  fi
  aoutcome=unknown
  if grep -q '^ROLLBACK' "$aout"; then
    aoutcome=rollback
  fi

  printf 'QUEUE|%s|SUMMARY|B_OUTCOME=%s|B_ELAPSED_MS=%s|C_OUTCOME=%s|C_ELAPSED_MS=%s|A_OUTCOME=%s|A_ELAPSED_MS=%s\n' \
    "$scenario" "$boutcome" "$((bend - bstart))" "$coutcome" "$((cend - cstart))" "$aoutcome" "$((aend - astart))"

  print_queue_file "$scenario" reset "$resetout"
  print_queue_file "$scenario" A "$aout"
  print_queue_file "$scenario" B "$bout"
  print_queue_file "$scenario" C "$cout"
}

probe_lock_queue() {
  local version="$1"
  printf '\n===== PROBE 17-lock-queue =====\n'
  if [[ "$version" != "17" ]]; then
    echo 'SKIPPED|PG17-only'
    return
  fi
  run_queue_scenario plain
  run_queue_scenario locktimeout
}

probe_version() {
  local v="$1"
  printf '\n########## PostgreSQL %s ##########\n' "$v"

  run_probe "$v" "00-version" "SELECT version();"

  run_probe "$v" "01-add-column-int-not-null-default-5" "$RESET_T
$RFN_BEFORE
BEGIN;
ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 5;
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "02-add-column-timestamptz-not-null-default-now" "$RESET_T
$RFN_BEFORE
BEGIN;
ALTER TABLE t ADD COLUMN c timestamptz NOT NULL DEFAULT now();
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "03-add-column-float8-default-random" "$RESET_T
$RFN_BEFORE
BEGIN;
ALTER TABLE t ADD COLUMN c float8 DEFAULT random();
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "04-add-column-bigserial" "$RESET_T
$RFN_BEFORE
BEGIN;
ALTER TABLE t ADD COLUMN c bigserial;
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "05-add-column-not-null-no-default-nonempty" "$RESET_T
ALTER TABLE t ADD COLUMN c int NOT NULL;"

  run_probe "$v" "06a-set-not-null-baseline" "$RESET_T
SET client_min_messages = debug1;
BEGIN;
ALTER TABLE t ALTER COLUMN a SET NOT NULL;
$LOCKS
COMMIT;"

  run_probe "$v" "06b-set-not-null-validated-check" "$RESET_T
ALTER TABLE t ADD CONSTRAINT ck CHECK (a IS NOT NULL) NOT VALID;
ALTER TABLE t VALIDATE CONSTRAINT ck;
SET client_min_messages = debug1;
BEGIN;
ALTER TABLE t ALTER COLUMN a SET NOT NULL;
$LOCKS
COMMIT;"

  run_probe "$v" "07a-add-foreign-key" "$RESET_FK
BEGIN;
ALTER TABLE t ADD CONSTRAINT fk_t_parent FOREIGN KEY (id) REFERENCES fkparent(id);
$LOCKS
COMMIT;"

  run_probe "$v" "07b-add-foreign-key-not-valid-then-validate" "$RESET_FK
BEGIN;
ALTER TABLE t ADD CONSTRAINT fk_t_parent FOREIGN KEY (id) REFERENCES fkparent(id) NOT VALID;
$LOCKS_ADD_NOT_VALID
COMMIT;
SELECT 'PHASE|validate-constraint';
BEGIN;
ALTER TABLE t VALIDATE CONSTRAINT fk_t_parent;
$LOCKS_VALIDATE
COMMIT;"

  run_probe "$v" "08-fk-not-valid-partitioned-child" "DROP TABLE IF EXISTS p CASCADE;
DROP TABLE IF EXISTS plain_parent CASCADE;
CREATE TABLE plain_parent(id int primary key);
CREATE TABLE p(id int, pid int) PARTITION BY RANGE (id);
CREATE TABLE p0 PARTITION OF p FOR VALUES FROM (0) TO (1000);
ALTER TABLE p ADD CONSTRAINT fk_p_parent FOREIGN KEY (pid) REFERENCES plain_parent(id) NOT VALID;"

  run_probe "$v" "09a-create-index-locks" "$RESET_T
BEGIN;
CREATE INDEX idx_t_a ON t(a);
$LOCKS
COMMIT;"

  run_probe "$v" "09b-cic-inside-begin" "$RESET_T
BEGIN;
CREATE INDEX CONCURRENTLY idx_t_a ON t(a);
ROLLBACK;"

  run_probe "$v" "09c-cic-partitioned-parent" "DROP TABLE IF EXISTS p CASCADE;
CREATE TABLE p(id int) PARTITION BY RANGE (id);
CREATE TABLE p0 PARTITION OF p FOR VALUES FROM (0) TO (1000);
INSERT INTO p SELECT generate_series(1,999);
CREATE INDEX CONCURRENTLY idx_p_id ON p(id);"

  run_probe "$v" "09d-cic-implicit-transaction-cleanup" "DROP TABLE IF EXISTS x CASCADE;"
  run_psql_c "$v" "09d-cic-one-multistatement-psql-c" 'CREATE TABLE x(i int); CREATE INDEX CONCURRENTLY ON x(i);'
  run_probe "$v" "09d-cic-implicit-transaction-aftermath" "SELECT 'X_EXISTS|' || coalesce(to_regclass('x')::text, '<none>');"

  run_probe "$v" "10-failed-cic-invalid-index-if-not-exists" "$RESET_T
UPDATE t SET a = 1;
CREATE UNIQUE INDEX CONCURRENTLY idx_invalid ON t(a);
SELECT 'VALID_AFTER_FAIL|' || coalesce(i.indisvalid::text, 'missing') || '|' || coalesce(i.indisready::text, 'missing')
FROM (SELECT to_regclass('idx_invalid')::oid AS oid) r
LEFT JOIN pg_index i ON i.indexrelid = r.oid;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_invalid ON t(a);
SELECT 'VALID_AFTER_RETRY|' || coalesce(i.indisvalid::text, 'missing') || '|' || coalesce(i.indisready::text, 'missing')
FROM (SELECT to_regclass('idx_invalid')::oid AS oid) r
LEFT JOIN pg_index i ON i.indexrelid = r.oid;"

  run_probe "$v" "11a-add-unique-constraint" "$RESET_T
BEGIN;
ALTER TABLE t ADD CONSTRAINT u UNIQUE (a);
$LOCKS
COMMIT;"

  run_probe "$v" "11b-add-primary-key-nullable-column" "$RESET_T
DROP TABLE IF EXISTS npk CASCADE;
CREATE TABLE npk(id int, a int);
INSERT INTO npk SELECT i, i FROM generate_series(1,1000) g(i);
BEGIN;
ALTER TABLE npk ADD PRIMARY KEY (id);
$LOCKS
COMMIT;"

  run_probe "$v" "12-enum-add-value-use-in-transaction-and-drop-syntax" "DROP TYPE IF EXISTS e CASCADE;
CREATE TYPE e AS ENUM ('a','b');
BEGIN;
ALTER TYPE e ADD VALUE 'x';
SELECT 'x'::e;
ROLLBACK;
SELECT 'PHASE|drop-enum-syntax';
ALTER TYPE e DROP VALUE 'x';"

  run_probe "$v" "13a-type-int-to-bigint" "$RESET_T
$RFN_BEFORE
BEGIN;
ALTER TABLE t ALTER COLUMN a TYPE bigint;
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "13b-type-varchar10-to-varchar20" "$RESET_T
ALTER TABLE t ADD COLUMN v varchar(10);
UPDATE t SET v = 'abcdef';
$RFN_BEFORE
BEGIN;
ALTER TABLE t ALTER COLUMN v TYPE varchar(20);
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "13c-type-varchar20-to-text" "$RESET_T
ALTER TABLE t ADD COLUMN v varchar(20);
UPDATE t SET v = 'abcdef';
$RFN_BEFORE
BEGIN;
ALTER TABLE t ALTER COLUMN v TYPE text;
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "13d-type-text-to-varchar10" "$RESET_T
ALTER TABLE t ADD COLUMN v text;
UPDATE t SET v = 'abcdef';
$RFN_BEFORE
BEGIN;
ALTER TABLE t ALTER COLUMN v TYPE varchar(10);
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "13e-type-numeric-10-2-to-12-2" "$RESET_T
ALTER TABLE t ADD COLUMN n numeric(10,2);
UPDATE t SET n = 123.45;
$RFN_BEFORE
BEGIN;
ALTER TABLE t ALTER COLUMN n TYPE numeric(12,2);
$LOCKS
COMMIT;
$RFN_AFTER"

  run_probe "$v" "14a-rename-column" "$RESET_T
BEGIN;
ALTER TABLE t RENAME COLUMN a TO a2;
$LOCKS
COMMIT;"

  run_probe "$v" "14b-drop-column" "$RESET_T
BEGIN;
ALTER TABLE t DROP COLUMN a;
$LOCKS
COMMIT;"

  run_probe "$v" "14c-drop-index" "$RESET_T
CREATE INDEX idx_t_a ON t(a);
BEGIN;
DROP INDEX idx_t_a;
$LOCKS
COMMIT;"

  run_probe "$v" "14d-drop-index-concurrently-inside-begin" "$RESET_T
CREATE INDEX idx_t_a ON t(a);
BEGIN;
DROP INDEX CONCURRENTLY idx_t_a;
ROLLBACK;"

  run_probe "$v" "15a-attach-partition" "DROP TABLE IF EXISTS p CASCADE;
DROP TABLE IF EXISTS pchild CASCADE;
CREATE TABLE p(id int) PARTITION BY RANGE (id);
CREATE TABLE pchild(id int);
INSERT INTO pchild SELECT generate_series(1,999);
BEGIN;
ALTER TABLE p ATTACH PARTITION pchild FOR VALUES FROM (0) TO (1000);
$LOCKS
COMMIT;"

  if (( v < 14 )); then
    printf '\n===== PROBE 15b-detach-partition-concurrently-inside-begin =====\n'
    echo 'SKIPPED|PG14-plus-only'
  else
    run_probe "$v" "15b-detach-partition-concurrently-inside-begin" "DROP TABLE IF EXISTS p CASCADE;
DROP TABLE IF EXISTS pchild CASCADE;
CREATE TABLE p(id int) PARTITION BY RANGE (id);
CREATE TABLE pchild(id int);
ALTER TABLE p ATTACH PARTITION pchild FOR VALUES FROM (0) TO (1000);
BEGIN;
ALTER TABLE p DETACH PARTITION pchild CONCURRENTLY;
ROLLBACK;"
  fi

  run_probe "$v" "16a-reindex-table-concurrently-inside-begin" "$RESET_T
CREATE INDEX idx_t_a ON t(a);
BEGIN;
REINDEX TABLE CONCURRENTLY t;
ROLLBACK;"

  run_probe "$v" "16b-reindex-table-locks" "$RESET_T
CREATE INDEX idx_t_a ON t(a);
BEGIN;
REINDEX TABLE t;
$LOCKS
COMMIT;"

  probe_lock_queue "$v"

  run_probe "$v" "18-fresh-table-reltuples" "DROP TABLE IF EXISTS fresh;
CREATE TABLE fresh(id int);
INSERT INTO fresh SELECT generate_series(1,1000);
SELECT 'RELTUPLES|' || reltuples::text FROM pg_class WHERE oid = 'fresh'::regclass;"
}

ensure_container() {
  local v="$1" image="postgres:$v" mirror="mirror.gcr.io/library/postgres:$v" name="pg$v"
  local actual running i
  if docker inspect "$name" >/dev/null 2>&1; then
    actual=$(docker inspect -f '{{.Config.Image}}' "$name")
    if [[ "$actual" != "$image" ]]; then
      printf 'SKIP_VERSION|%s|container %s already exists with image %s\n' "$v" "$name" "$actual"
      return 1
    fi
    running=$(docker inspect -f '{{.State.Running}}' "$name")
    if [[ "$running" != true ]]; then
      docker start "$name" || return 1
    fi
  else
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      printf 'PULL|%s|docker pull %s\n' "$v" "$image"
      if ! docker pull "$image"; then
        printf 'PULL_DIRECT_FAILED|%s|trying %s\n' "$v" "$mirror"
        if ! docker pull "$mirror"; then
          printf 'SKIP_VERSION|%s|pull failed\n' "$v"
          return 1
        fi
        docker tag "$mirror" "$image" || return 1
      fi
    fi
    printf 'RUN|%s|docker run -d --name %s %s\n' "$v" "$name" "$image"
    docker run -d --name "$name" -e POSTGRES_PASSWORD=pw "$image" || return 1
  fi
  for i in $(seq 1 60); do
    if docker exec "$name" pg_isready -U postgres -q >/dev/null 2>&1; then
      printf 'READY|%s\n' "$v"
      return 0
    fi
    sleep 1
  done
  printf 'SKIP_VERSION|%s|container did not become ready\n' "$v"
  return 1
}

main() {
  local setup_log="$LOG_DIR/setup.log" containers_log="$LOG_DIR/containers.txt"
  local available=() v log
  : >"$setup_log"
  echo "Rollout Desk PostgreSQL probe run: $(date -Is)" | tee -a "$setup_log"
  echo "Docker: $(docker version --format 'client={{.Client.Version}} server={{.Server.Version}}' 2>&1)" | tee -a "$setup_log"
  for v in "${VERSIONS[@]}"; do
    if ensure_container "$v" >>"$setup_log" 2>&1; then
      echo "VERSION_AVAILABLE|$v" | tee -a "$setup_log"
      available+=("$v")
    else
      echo "VERSION_UNAVAILABLE|$v" | tee -a "$setup_log"
    fi
  done
  if ((${#available[@]})); then
    printf '%s\n' "${available[@]}" >"$LOG_DIR/available-versions.txt"
  else
    : >"$LOG_DIR/available-versions.txt"
  fi
  for v in "${available[@]}"; do
    log="$LOG_DIR/pg$v.log"
    echo "Starting probes for PostgreSQL $v (log: $log)"
    : >"$log"
    probe_version "$v" 2>&1 | tee "$log"
  done
  {
    echo "docker ps -a at $(date -Is)"
    docker ps -a
    echo
    echo "postgres image digests"
    for v in "${VERSIONS[@]}"; do
      docker image inspect "postgres:$v" --format "postgres:$v {{index .RepoDigests 0}}" 2>/dev/null || echo "postgres:$v unavailable"
    done
  } >"$containers_log" 2>&1
  echo "Done. Containers were left running. Logs are in $LOG_DIR"
}

main "$@"
