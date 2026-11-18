-- Identificadores documentais por etapa (DFD, pesquisa, ETP, processo...).
-- Aditivo: os valores continuam em tarefas.campos. Nada é apagado.

ALTER TABLE public.tarefa_campos
  ADD COLUMN IF NOT EXISTS identificador boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obrigatorio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sigla text;

ALTER TABLE public.tarefa_campos
  DROP CONSTRAINT IF EXISTS tarefa_campos_sigla_check,
  DROP CONSTRAINT IF EXISTS tarefa_campos_identificador_check;

ALTER TABLE public.tarefa_campos
  ADD CONSTRAINT tarefa_campos_sigla_check
    CHECK (sigla IS NULL OR char_length(btrim(sigla)) BETWEEN 1 AND 16),
  ADD CONSTRAINT tarefa_campos_identificador_check
    CHECK (
      (NOT identificador OR tipo IN ('texto', 'numero'))
      AND (NOT obrigatorio OR identificador)
    );

-- O histórico da movimentação guarda os números registrados na etapa de destino.
CREATE OR REPLACE FUNCTION public.tarefas_registrar_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  identificadores jsonb := '[]'::jsonb;
  etapa_alvo uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    etapa_alvo := NEW.etapa_id;
  ELSIF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    etapa_alvo := NEW.etapa_id;
  END IF;

  IF etapa_alvo IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'nome', c.nome,
          'sigla', NULLIF(btrim(c.sigla), ''),
          'valor', btrim(NEW.campos ->> c.id::text)
        )
        ORDER BY c.posicao
      ),
      '[]'::jsonb
    )
    INTO identificadores
    FROM public.tarefa_campos c
    WHERE c.etapa_id = etapa_alvo
      AND c.identificador
      AND NOT c.arquivado
      AND btrim(COALESCE(NEW.campos ->> c.id::text, '')) <> '';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
    VALUES (
      NEW.id,
      'criada',
      jsonb_build_object('etapa_id', NEW.etapa_id, 'identificadores', identificadores),
      auth.uid()
    );
  ELSE
    IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
      INSERT INTO public.tarefa_eventos (tarefa_id, tipo, detalhes, user_id)
      VALUES (
        NEW.id,
        'movida',
        jsonb_build_object('de', OLD.etapa_id, 'para', NEW.etapa_id, 'identificadores', identificadores),
        auth.uid()
      );
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

-- Campos iniciais só nas etapas padrão que ainda não têm identificador com o mesmo nome.
INSERT INTO public.tarefa_campos (etapa_id, nome, tipo, sigla, identificador, obrigatorio, posicao)
SELECT e.id, v.nome, 'texto', v.sigla, true, v.obrigatorio, v.posicao
FROM public.tarefa_etapas e
JOIN (
  VALUES
    ('Pauta',      'Número da demanda',  'DEMANDA',  false, 0),
    ('Pesquisa',   'Número da DFD',      'DFD',      true,  0),
    ('Pesquisa',   'Número da pesquisa', 'PESQUISA', true,  1),
    ('ETP',        'Número do ETP',      'ETP',      true,  0),
    ('Publicação', 'Número do processo', 'PROCESSO', true,  0)
) AS v(etapa, nome, sigla, obrigatorio, posicao)
  ON lower(btrim(e.nome)) = lower(v.etapa) AND NOT e.arquivada
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tarefa_campos c
  WHERE c.etapa_id = e.id
    AND NOT c.arquivado
    AND lower(btrim(c.nome)) = lower(v.nome)
);
