-- Tarefas (Kanban da equipe): etapas, campos configuráveis, tarefas, secretarias,
-- anexos e histórico. Quadro compartilhado: todos os autenticados leem;
-- admin/gestor/operador escrevem; consulta é somente leitura.

CREATE OR REPLACE FUNCTION public.tarefas_pode_escrever()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
      OR public.has_role((select auth.uid()), 'operador'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.tarefas_pode_escrever() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tarefas_pode_escrever() TO authenticated, service_role;

-- ============ Etapas ============
CREATE TABLE IF NOT EXISTS public.tarefa_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 60),
  cor text NOT NULL DEFAULT '#64748b' CHECK (cor ~ '^#[0-9a-fA-F]{6}$'),
  posicao double precision NOT NULL DEFAULT 0,
  arquivada boolean NOT NULL DEFAULT false,
  finaliza boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tarefa_etapas_nome_ativa_uidx
  ON public.tarefa_etapas (lower(btrim(nome))) WHERE NOT arquivada;

-- ============ Campos configuráveis por etapa ============
CREATE TABLE IF NOT EXISTS public.tarefa_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.tarefa_etapas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 60),
  tipo text NOT NULL CHECK (tipo IN ('texto','numero','data','link','lista')),
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  usa_como_fase boolean NOT NULL DEFAULT false,
  posicao integer NOT NULL DEFAULT 0,
  arquivado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tarefa_campos_etapa_idx ON public.tarefa_campos (etapa_id);

-- ============ Tarefas ============
CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 300),
  etapa_id uuid NOT NULL REFERENCES public.tarefa_etapas(id) ON DELETE RESTRICT,
  posicao double precision NOT NULL DEFAULT 0,
  tipo text,
  modalidade text,
  todas_secretarias boolean NOT NULL DEFAULT false,
  processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  link_url text CHECK (link_url IS NULL OR link_url ~* '^https?://'),
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  situacao text NOT NULL DEFAULT 'ok' CHECK (situacao IN ('ok','atencao','travada')),
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 10000),
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  etapa_desde timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tarefas_etapa_posicao_idx ON public.tarefas (etapa_id, posicao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tarefas_processo_idx ON public.tarefas (processo_id) WHERE processo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tarefas_responsavel_idx ON public.tarefas (responsavel_id) WHERE responsavel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tarefa_secretarias (
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  secretaria_id uuid NOT NULL REFERENCES public.secretarias(id) ON DELETE CASCADE,
  PRIMARY KEY (tarefa_id, secretaria_id)
);
CREATE INDEX IF NOT EXISTS tarefa_secretarias_secretaria_idx ON public.tarefa_secretarias (secretaria_id);

CREATE TABLE IF NOT EXISTS public.tarefa_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes <= 26214400),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tarefa_anexos_tarefa_idx ON public.tarefa_anexos (tarefa_id);

CREATE TABLE IF NOT EXISTS public.tarefa_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tarefa_eventos_tarefa_idx ON public.tarefa_eventos (tarefa_id, created_at DESC);

-- ============ Triggers ============
CREATE OR REPLACE FUNCTION public.tarefas_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    NEW.etapa_desde := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_registrar_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
    VALUES (NEW.id, 'criada', jsonb_build_object('etapa_id', NEW.etapa_id), auth.uid());
  ELSE
    IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (NEW.id, 'movida', jsonb_build_object('de', OLD.etapa_id, 'para', NEW.etapa_id), auth.uid());
    END IF;
    IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (NEW.id, 'situacao', jsonb_build_object('de', OLD.situacao, 'para', NEW.situacao), auth.uid());
    END IF;
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (NEW.id, 'responsavel', jsonb_build_object('de', OLD.responsavel_id, 'para', NEW.responsavel_id), auth.uid());
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (NEW.id, CASE WHEN NEW.deleted_at IS NULL THEN 'restaurada' ELSE 'excluida' END, '{}'::jsonb, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tarefas_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tarefas_registrar_evento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tarefas_before_update ON public.tarefas;
CREATE TRIGGER trg_tarefas_before_update BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_before_update();

DROP TRIGGER IF EXISTS trg_tarefas_evento ON public.tarefas;
CREATE TRIGGER trg_tarefas_evento AFTER INSERT OR UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_registrar_evento();

DROP TRIGGER IF EXISTS trg_tarefa_etapas_touch ON public.tarefa_etapas;
CREATE TRIGGER trg_tarefa_etapas_touch BEFORE UPDATE ON public.tarefa_etapas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tarefa_campos_touch ON public.tarefa_campos;
CREATE TRIGGER trg_tarefa_campos_touch BEFORE UPDATE ON public.tarefa_campos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RLS ============
ALTER TABLE public.tarefa_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_secretarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_eventos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefa_etapas, public.tarefa_campos, public.tarefas,
  public.tarefa_secretarias, public.tarefa_anexos TO authenticated;
GRANT SELECT ON public.tarefa_eventos TO authenticated;
GRANT ALL ON public.tarefa_etapas, public.tarefa_campos, public.tarefas, public.tarefa_secretarias,
  public.tarefa_anexos, public.tarefa_eventos TO service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tarefa_etapas','tarefa_campos','tarefas','tarefa_secretarias','tarefa_anexos','tarefa_eventos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['tarefa_etapas','tarefa_campos','tarefas','tarefa_secretarias','tarefa_anexos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.tarefas_pode_escrever())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.tarefas_pode_escrever()) WITH CHECK (public.tarefas_pode_escrever())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.tarefas_pode_escrever())', t || '_delete', t);
  END LOOP;
END $$;

-- ============ Storage: bucket privado de anexos ============
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tarefas-files', 'tarefas-files', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

DROP POLICY IF EXISTS tarefas_files_select ON storage.objects;
CREATE POLICY tarefas_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tarefas-files');

DROP POLICY IF EXISTS tarefas_files_insert ON storage.objects;
CREATE POLICY tarefas_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tarefas-files' AND public.tarefas_pode_escrever());

DROP POLICY IF EXISTS tarefas_files_update ON storage.objects;
CREATE POLICY tarefas_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tarefas-files' AND public.tarefas_pode_escrever())
  WITH CHECK (bucket_id = 'tarefas-files' AND public.tarefas_pode_escrever());

DROP POLICY IF EXISTS tarefas_files_delete ON storage.objects;
CREATE POLICY tarefas_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tarefas-files' AND public.tarefas_pode_escrever());

-- ============ Seed idempotente das etapas ============
INSERT INTO public.tarefa_etapas (nome, cor, posicao, finaliza)
SELECT v.nome, v.cor, v.posicao, v.finaliza
FROM (VALUES
  ('Pauta',      '#6366f1', 1000::double precision, false),
  ('Pesquisa',   '#0ea5e9', 2000::double precision, false),
  ('ETP',        '#f59e0b', 3000::double precision, false),
  ('Publicação', '#8b5cf6', 4000::double precision, false),
  ('Julgamento', '#ef4444', 5000::double precision, false),
  ('Contratos',  '#10b981', 6000::double precision, true)
) AS v(nome, cor, posicao, finaliza)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarefa_etapas e
  WHERE lower(btrim(e.nome)) = lower(v.nome) AND NOT e.arquivada
);
