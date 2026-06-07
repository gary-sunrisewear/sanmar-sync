
-- Drop overly-permissive write policies
DROP POLICY IF EXISTS "auth write imports" ON public.imported_products;
DROP POLICY IF EXISTS "auth write variants" ON public.imported_variants;
DROP POLICY IF EXISTS "auth insert jobs" ON public.sync_jobs;
DROP POLICY IF EXISTS "auth update jobs" ON public.sync_jobs;

CREATE POLICY "role write imports" ON public.imported_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "role write variants" ON public.imported_variants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "role insert jobs" ON public.sync_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "role update jobs" ON public.sync_jobs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- Lock down SECURITY DEFINER helpers (they're only used internally)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
-- has_role must remain callable from RLS expressions; restrict to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
