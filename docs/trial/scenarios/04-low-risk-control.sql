-- Synthetic low-risk control modeled on an additive feature rollout.
-- Runner transaction behavior is deliberately not stated.

ALTER TABLE public.notifications
  ADD COLUMN delivery_metadata jsonb;

CREATE INDEX CONCURRENTLY notifications_user_created_idx
  ON public.notifications (user_id, created_at);
