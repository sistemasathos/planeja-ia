-- Tramitação da demanda: data de inclusão, documentos, fases de julgamento e contratos.
-- Aditivo. Não apaga etapas, campos nem valores já gravados.

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS data_inclusao date;

UPDATE public.tarefas
SET data_inclusao = (created_at AT TIME ZONE 'America/Fortaleza')::date
WHERE data_inclusao IS NULL;

ALTER TABLE public.tarefas
  ALTER COLUMN data_inclusao SET DEFAULT (timezone('America/Fortaleza', now()))::date;

ALTER TABLE public.tarefas
  ALTER COLUMN data_inclusao SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.tarefa_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  chave text CHECK (chave IS NULL OR chave IN ('dfd', 'pesquisa', 'etp', 'certame')),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 80),
  numero text CHECK (numero IS NULL OR char_length(numero) <= 80),
  data date,
  horario time,
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 2000),
  link_url text CHECK (link_url IS NULL OR link_url ~* '^https?://'),
  posicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tarefa_documentos_chave_uidx
  ON public.tarefa_documentos (tarefa_id, chave) WHERE chave IS NOT NULL;
CREATE INDEX IF NOT EXISTS tarefa_documentos_tarefa_idx
  ON public.tarefa_documentos (tarefa_id, posicao);

CREATE TABLE IF NOT EXISTS public.tarefa_fases (
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (chave IN (
    'analise', 'exequibilidade', 'habilitacao', 'recursal', 'adjudicacao', 'convocacao'
  )),
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'em_andamento', 'concluida')),
  data date,
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 2000),
  posicao integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, chave)
);

CREATE TABLE IF NOT EXISTS public.tarefa_contratos (
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  contrato_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, contrato_id)
);
CREATE INDEX IF NOT EXISTS tarefa_contratos_contrato_idx
  ON public.tarefa_contratos (contrato_id);

DROP TRIGGER IF EXISTS trg_tarefa_documentos_touch ON public.tarefa_documentos;
CREATE TRIGGER trg_tarefa_documentos_touch BEFORE UPDATE ON public.tarefa_documentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tarefa_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefa_contratos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefa_documentos, public.tarefa_fases, public.tarefa_contratos
  TO authenticated;
GRANT ALL ON public.tarefa_documentos, public.tarefa_fases, public.tarefa_contratos TO service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tarefa_documentos', 'tarefa_fases', 'tarefa_contratos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.tarefas_pode_escrever())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.tarefas_pode_escrever()) WITH CHECK (public.tarefas_pode_escrever())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.tarefas_pode_escrever())', t || '_delete', t);
  END LOOP;
END $$;

-- Copia números já lançados nos identificadores, sem apagar o valor antigo.
INSERT INTO public.tarefa_documentos (tarefa_id, chave, titulo, numero)
SELECT t.id,
  CASE upper(btrim(c.sigla))
    WHEN 'DFD' THEN 'dfd'
    WHEN 'PESQUISA' THEN 'pesquisa'
    WHEN 'ETP' THEN 'etp'
    WHEN 'PROCESSO' THEN 'certame'
  END,
  CASE upper(btrim(c.sigla))
    WHEN 'DFD' THEN 'DFD'
    WHEN 'PESQUISA' THEN 'Pesquisa'
    WHEN 'ETP' THEN 'ETP'
    WHEN 'PROCESSO' THEN 'Certame'
  END,
  btrim(t.campos ->> c.id::text)
FROM public.tarefas t
JOIN public.tarefa_campos c
  ON c.identificador AND NOT c.arquivado
 AND upper(btrim(c.sigla)) IN ('DFD', 'PESQUISA', 'ETP', 'PROCESSO')
WHERE btrim(COALESCE(t.campos ->> c.id::text, '')) <> ''
ON CONFLICT (tarefa_id, chave) WHERE chave IS NOT NULL DO NOTHING;

-- Nomes das etapas do fluxo, só quando o destino ainda não existe.
UPDATE public.tarefa_etapas e
SET nome = 'Pesquisa / Cotação'
WHERE NOT e.arquivada
  AND lower(btrim(e.nome)) = 'pesquisa'
  AND NOT EXISTS (
    SELECT 1 FROM public.tarefa_etapas o
    WHERE NOT o.arquivada AND lower(btrim(o.nome)) = 'pesquisa / cotação'
  );

UPDATE public.tarefa_etapas e
SET nome = 'Contratação'
WHERE NOT e.arquivada
  AND lower(btrim(e.nome)) IN ('contratos', 'contrato', 'contratado')
  AND NOT EXISTS (
    SELECT 1 FROM public.tarefa_etapas o
    WHERE NOT o.arquivada AND lower(btrim(o.nome)) = 'contratação'
  );

-- O evento de movimentação também guarda os documentos já registrados na tarefa.
CREATE OR REPLACE FUNCTION public.tarefas_registrar_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  identificadores jsonb := '[]'::jsonb;
  documentos jsonb := '[]'::jsonb;
  etapa_alvo uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    etapa_alvo := NEW.etapa_id;
  ELSIF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    etapa_alvo := NEW.etapa_id;
  END IF;

  IF etapa_alvo IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nome', c.nome, 'sigla', NULLIF(btrim(c.sigla), ''), 'valor', btrim(NEW.campos ->> c.id::text)
    ) ORDER BY c.posicao), '[]'::jsonb)
    INTO identificadores
    FROM public.tarefa_campos c
    WHERE c.etapa_id = etapa_alvo AND c.identificador AND NOT c.arquivado
      AND btrim(COALESCE(NEW.campos ->> c.id::text, '')) <> '';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'chave', d.chave, 'titulo', d.titulo, 'numero', d.numero, 'data', d.data, 'horario', d.horario
    ) ORDER BY d.posicao), '[]'::jsonb)
    INTO documentos
    FROM public.tarefa_documentos d
    WHERE d.tarefa_id = NEW.id
      AND (btrim(COALESCE(d.numero, '')) <> '' OR d.data IS NOT NULL OR d.horario IS NOT NULL);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
    VALUES (NEW.id, 'criada', jsonb_build_object(
      'etapa_id', NEW.etapa_id, 'identificadores', identificadores, 'documentos', documentos
    ), auth.uid());
  ELSE
    IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (NEW.id, 'movida', jsonb_build_object(
        'de', OLD.etapa_id, 'para', NEW.etapa_id, 'identificadores', identificadores, 'documentos', documentos
      ), auth.uid());
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
