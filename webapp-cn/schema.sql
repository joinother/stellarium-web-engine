-- 星象仪网页版 · 云数据库结构（WorkBuddy 云服务 / Postgres）
-- 每条语句单独执行（该环境不支持一次执行多条）。

-- 用户档案：记录注册方式与已验证的邮箱 / 手机号
CREATE TABLE IF NOT EXISTS sweb_profiles (
  owner_id TEXT PRIMARY KEY DEFAULT auth.uid(),
  email TEXT,
  phone TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sweb_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sweb_profiles TO authenticated;
CREATE POLICY sweb_profiles_sel ON sweb_profiles FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY sweb_profiles_ins ON sweb_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY sweb_profiles_upd ON sweb_profiles FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 通行密钥索引（公钥本体加密存放在应用服务端，这里只做用户可见的清单）
CREATE TABLE IF NOT EXISTS sweb_passkeys (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT auth.uid(),
  credential_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, credential_id)
);
ALTER TABLE sweb_passkeys ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweb_passkeys TO authenticated;
CREATE POLICY sweb_pk_all ON sweb_passkeys FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 手机号占用登记：insert-only，防止一个手机号被多个账号绑定
CREATE TABLE IF NOT EXISTS sweb_phone_claims (
  phone TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sweb_phone_claims ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE public.sweb_phone_claims TO authenticated;
CREATE POLICY sweb_phone_sel ON sweb_phone_claims FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY sweb_phone_ins ON sweb_phone_claims FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- 观测点收藏（每用户私有）
CREATE TABLE IF NOT EXISTS sky_places (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT auth.uid(),
  owner_name TEXT,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  fov TEXT,
  lat TEXT,
  lng TEXT,
  elev INTEGER,
  az TEXT,
  alt TEXT,
  observed_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);
ALTER TABLE sky_places ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sky_places TO authenticated;
CREATE POLICY sky_places_select_own ON sky_places FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY sky_places_insert_own ON sky_places FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY sky_places_update_own ON sky_places FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY sky_places_delete_own ON sky_places FOR DELETE TO authenticated USING (owner_id = auth.uid());
