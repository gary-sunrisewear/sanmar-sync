
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Auto-create profile + give first user admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Supplier enum
CREATE TYPE public.supplier_code AS ENUM ('sanmar', 'ssactivewear', 'ascolour', 'ottocap');

-- Supplier credentials (shared, admin-only)
CREATE TABLE public.supplier_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier supplier_code NOT NULL UNIQUE,
  -- generic credential bag (account #, username, password, api key, feed url, etc.)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_credentials TO authenticated;
GRANT ALL ON public.supplier_credentials TO service_role;
ALTER TABLE public.supplier_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage credentials" ON public.supplier_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "operators can read enabled flag" ON public.supplier_credentials
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER tg_supplier_credentials_updated BEFORE UPDATE ON public.supplier_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Markup rules
CREATE TABLE public.markup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier supplier_code,           -- null = applies to all
  match_field TEXT,                 -- 'vendor' | 'category' | 'brand' | null
  match_value TEXT,
  -- pricing: final = round( cost * multiplier + flat_add , round_to ) then -0.01 if charm_pricing
  multiplier NUMERIC(8,4) NOT NULL DEFAULT 2.0,
  flat_add NUMERIC(10,2) NOT NULL DEFAULT 0,
  round_to NUMERIC(6,2) NOT NULL DEFAULT 0.01,
  charm_pricing BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.markup_rules TO authenticated;
GRANT ALL ON public.markup_rules TO service_role;
ALTER TABLE public.markup_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read markup" ON public.markup_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage markup" ON public.markup_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_markup_rules_updated BEFORE UPDATE ON public.markup_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Imported products (style level)
CREATE TABLE public.imported_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier supplier_code NOT NULL,
  supplier_style_id TEXT NOT NULL,
  supplier_style_name TEXT,
  shopify_product_id TEXT NOT NULL,
  shopify_handle TEXT,
  vendor TEXT,
  product_type TEXT,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_inventory_sync_at TIMESTAMPTZ,
  last_price_sync_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier, supplier_style_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_products TO authenticated;
GRANT ALL ON public.imported_products TO service_role;
ALTER TABLE public.imported_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read imports" ON public.imported_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write imports" ON public.imported_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER tg_imported_products_updated BEFORE UPDATE ON public.imported_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Imported variants
CREATE TABLE public.imported_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.imported_products(id) ON DELETE CASCADE,
  supplier_sku TEXT NOT NULL,
  shopify_variant_id TEXT NOT NULL,
  shopify_inventory_item_id TEXT,
  size TEXT,
  color TEXT,
  cost NUMERIC(10,2),
  price NUMERIC(10,2),
  last_qty INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, supplier_sku)
);
CREATE INDEX ON public.imported_variants(product_id);
CREATE INDEX ON public.imported_variants(supplier_sku);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imported_variants TO authenticated;
GRANT ALL ON public.imported_variants TO service_role;
ALTER TABLE public.imported_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read variants" ON public.imported_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write variants" ON public.imported_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER tg_imported_variants_updated BEFORE UPDATE ON public.imported_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync jobs
CREATE TYPE public.sync_job_kind AS ENUM ('import', 'inventory', 'price');
CREATE TYPE public.sync_job_status AS ENUM ('running', 'success', 'partial', 'failed');

CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind sync_job_kind NOT NULL,
  supplier supplier_code,
  status sync_job_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  items_total INTEGER DEFAULT 0,
  items_ok INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  errors JSONB DEFAULT '[]'::jsonb
);
CREATE INDEX ON public.sync_jobs(started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read jobs" ON public.sync_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert jobs" ON public.sync_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update jobs" ON public.sync_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
