import { inspect, draft } from '../../../review.mjs';

const cases = [
  ['a', 'ALTER TABLE t ADD COLUMN c bigserial;'],
  ['b', 'ALTER TABLE t ADD COLUMN c float8 DEFAULT random();'],
  ['c', "SET lock_timeout = '5s'; ALTER TABLE t ADD COLUMN z int;"],
  ['d', 'BEGIN; ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0; UPDATE t SET a = 1; CREATE INDEX ON t(a); COMMIT;'],
  ['e', 'CREATE TABLE n(id int); CREATE INDEX ON n(id); ALTER TABLE n ADD COLUMN x int NOT NULL;'],
  ['f', 'ALTER TABLE t ALTER COLUMN v TYPE varchar(200);'],
  ['g', 'DROP INDEX i;'],
  ['h', 'ALTER TABLE t ADD CONSTRAINT ck CHECK (a IS NOT NULL) NOT VALID; ALTER TABLE t VALIDATE CONSTRAINT ck; ALTER TABLE t ALTER COLUMN a SET NOT NULL;'],
  ['i', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON t(a);'],
  ['j', 'ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 5;'],
  ['k', "ALTER TYPE e ADD VALUE 'x';"],
  ['l', 'ALTER TABLE t ADD COLUMN c uuid NOT NULL DEFAULT uuid_generate_v4();'],
  ['m', 'ALTER TABLE t ADD PRIMARY KEY (a);'],
  ['n', 'ALTER TABLE t ADD CONSTRAINT u UNIQUE USING INDEX t_a_idx;']
];

const slimFinding = ({ kind, note, statement, target }) => ({ kind, note, statement, target });
const slimGate = ({ kind, note, statement, target, label }) => ({ kind, note, statement, target, label });

for (const [id, sql] of cases) {
  console.log(`\n=== CASE ${id} ===`);
  console.log('sql=' + JSON.stringify(sql));
  try {
    const inspected = await inspect(sql);
    console.log('inspect.findings=' + JSON.stringify(inspected.findings.map(slimFinding)));
    console.log('inspect.uncovered=' + JSON.stringify(inspected.uncovered));
    console.log('inspect.notices=' + JSON.stringify(inspected.notices));
  } catch (error) {
    console.log('inspect.error=' + JSON.stringify(error.message));
  }
  try {
    const plan = await draft({ title: `Engine probe ${id}`, sql });
    console.log('draft.gates=' + JSON.stringify(plan.gates.map(slimGate)));
    console.log('draft.uncovered=' + JSON.stringify(plan.uncovered));
    console.log('draft.notices=' + JSON.stringify(plan.notices));
  } catch (error) {
    console.log('draft.error=' + JSON.stringify(error.message));
  }
}
