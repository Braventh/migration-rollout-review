\set ON_ERROR_STOP on
SELECT 'PostgreSQL ' || current_setting('server_version');
CREATE TEMP TABLE probes (name text, passed boolean);
CREATE TABLE t AS SELECT generate_series(1, 1000) AS id;
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN s smallserial;
INSERT INTO probes SELECT 'smallserial rewrites', :before <> pg_relation_filenode('t') AND pg_get_serial_sequence('t', 's') IS NOT NULL;
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN n serial;
INSERT INTO probes SELECT 'serial rewrites', :before <> pg_relation_filenode('t') AND pg_get_serial_sequence('t', 'n') IS NOT NULL;
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN b bigserial;
INSERT INTO probes SELECT 'bigserial rewrites', :before <> pg_relation_filenode('t') AND pg_get_serial_sequence('t', 'b') IS NOT NULL;
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN i int GENERATED ALWAYS AS IDENTITY;
INSERT INTO probes SELECT 'identity rewrites', :before <> pg_relation_filenode('t') AND pg_get_serial_sequence('t', 'i') IS NOT NULL;
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN g int GENERATED ALWAYS AS (id + 1) STORED;
INSERT INTO probes SELECT 'stored generated rewrites and computes existing rows',
  :before <> pg_relation_filenode('t') AND (SELECT bool_and(g = id + 1) FROM t);
SELECT current_setting('server_version_num')::int >= 180000 AS virtual_supported \gset
\if :virtual_supported
SELECT pg_relation_filenode('t') AS before \gset
ALTER TABLE t ADD COLUMN v int GENERATED ALWAYS AS (id + 1) VIRTUAL;
INSERT INTO probes SELECT 'virtual generated does not rewrite',
  :before = pg_relation_filenode('t') AND (SELECT bool_and(v = id + 1) FROM t);
\endif
BEGIN;
SET LOCAL lock_timeout = '1s';
ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0;
UPDATE t SET c = 1;
INSERT INTO probes SELECT 'ACCESS EXCLUSIVE persists through later UPDATE',
  EXISTS (SELECT FROM pg_locks WHERE pid = pg_backend_pid() AND relation = 't'::regclass AND mode = 'AccessExclusiveLock' AND granted);
INSERT INTO probes SELECT 'SET LOCAL lock_timeout in effect in transaction', current_setting('lock_timeout') = '1s';
COMMIT;
INSERT INTO probes SELECT 'commit releases lock and resets local timeout',
  NOT EXISTS (SELECT FROM pg_locks WHERE pid = pg_backend_pid() AND relation = 't'::regclass AND mode = 'AccessExclusiveLock')
  AND current_setting('lock_timeout') = '0';
ALTER TABLE t ADD CONSTRAINT nn CHECK (id IS NOT NULL) NOT VALID;
INSERT INTO probes SELECT 'check starts NOT VALID', NOT convalidated FROM pg_constraint WHERE conrelid = 't'::regclass AND conname = 'nn';
BEGIN;
ALTER TABLE t VALIDATE CONSTRAINT nn;
INSERT INTO probes SELECT 'CHECK validation takes SHARE UPDATE EXCLUSIVE',
  EXISTS (SELECT FROM pg_locks WHERE pid = pg_backend_pid() AND relation = 't'::regclass AND mode = 'ShareUpdateExclusiveLock' AND granted);
COMMIT;
INSERT INTO probes SELECT 'CHECK marked valid', convalidated FROM pg_constraint WHERE conrelid = 't'::regclass AND conname = 'nn';
SELECT 'FAIL: ' || name FROM probes WHERE passed IS NOT TRUE;
SELECT count(*) >= 10 AND bool_and(passed) AS passed FROM probes \gset
\if :passed
SELECT 'PASS ' || count(*) || ' probes' FROM probes;
\else
SELECT 1/0;
\endif
