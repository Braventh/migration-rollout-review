-- Synthetic user-trial scenario modeled on a common production migration.
-- Assume public.orders is an existing high-traffic table with millions of rows.

ALTER TABLE public.orders
  ADD COLUMN import_batch_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX orders_import_batch_id_idx
  ON public.orders (import_batch_id);
