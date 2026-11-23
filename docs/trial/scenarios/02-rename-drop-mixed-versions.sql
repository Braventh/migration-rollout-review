-- Synthetic user-trial scenario modeled on a phased application deploy.
-- Assume API v1 still reads and writes email and legacy_status while API v2 is rolling out.

ALTER TABLE public.accounts
  RENAME COLUMN email TO primary_email;

ALTER TABLE public.accounts
  DROP COLUMN legacy_status;
