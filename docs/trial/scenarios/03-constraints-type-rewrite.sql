-- Synthetic user-trial scenario modeled on tightening integrity in an existing table.
-- Assume public.order_items is large and quantity is integer today.

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_order_id_fk
    FOREIGN KEY (order_id) REFERENCES public.orders (id),
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(12, 4) USING quantity::numeric(12, 4);
