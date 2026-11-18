-- Meu perfil: dados de contato do usuário, secretarias vinculadas e lista da equipe.
-- Não armazena CPF. Campos sensíveis (ativo, email) continuam sob controle do admin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS endereco text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_telefone_len,
  DROP CONSTRAINT IF EXISTS profiles_cargo_len,
  DROP CONSTRAINT IF EXISTS profiles_endereco_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_telefone_len CHECK (telefone IS NULL OR char_length(telefone) <= 30),
  ADD CONSTRAINT profiles_cargo_len CHECK (cargo IS NULL OR char_length(cargo) <= 120),
  ADD CONSTRAINT profiles_endereco_len CHECK (endereco IS NULL OR char_length(endereco) <= 300);

-- profiles_update_own permite atualizar a linha inteira; impede que um usuário
-- comum altere `ativo` ou `email` (apenas admin ou service_role).
CREATE OR REPLACE FUNCTION public.profiles_protect_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND (NEW.ativo IS DISTINCT FROM OLD.ativo OR NEW.email IS DISTINCT FROM OLD.email OR NEW.id IS DISTINCT FROM OLD.id)
  THEN
    RAISE EXCEPTION 'Somente administradores podem alterar status ou e-mail do perfil'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_protect_sensitive_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_protect_sensitive ON public.profiles;
CREATE TRIGGER trg_profiles_protect_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_sensitive_columns();

-- Secretarias vinculadas ao usuário.
CREATE TABLE IF NOT EXISTS public.profile_secretarias (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  secretaria_id uuid NOT NULL REFERENCES public.secretarias(id) ON DELETE CASCADE,
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, secretaria_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_secretarias_principal_uidx
  ON public.profile_secretarias (user_id) WHERE principal;
CREATE INDEX IF NOT EXISTS profile_secretarias_secretaria_idx
  ON public.profile_secretarias (secretaria_id);

ALTER TABLE public.profile_secretarias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_secretarias TO authenticated;
GRANT ALL ON public.profile_secretarias TO service_role;

DROP POLICY IF EXISTS profile_secretarias_select ON public.profile_secretarias;
CREATE POLICY profile_secretarias_select ON public.profile_secretarias
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS profile_secretarias_insert ON public.profile_secretarias;
CREATE POLICY profile_secretarias_insert ON public.profile_secretarias
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS profile_secretarias_update ON public.profile_secretarias;
CREATE POLICY profile_secretarias_update ON public.profile_secretarias
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS profile_secretarias_delete ON public.profile_secretarias;
CREATE POLICY profile_secretarias_delete ON public.profile_secretarias
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

-- Equipe: apenas id, nome e cargo de usuários ativos (operadores e consulta não
-- leem a tabela profiles de outros usuários; usado como responsável das tarefas).
CREATE OR REPLACE FUNCTION public.equipe_usuarios()
RETURNS TABLE (id uuid, nome text, cargo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, COALESCE(NULLIF(btrim(p.nome), ''), split_part(p.email, '@', 1)) AS nome, p.cargo
  FROM public.profiles p
  WHERE p.ativo IS NOT FALSE
    AND auth.uid() IS NOT NULL
  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.equipe_usuarios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_usuarios() TO authenticated, service_role;
