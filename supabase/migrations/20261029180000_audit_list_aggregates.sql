-- Agregações para listas/dashboard (evita corte de 1000 linhas do PostgREST)
-- e filtro opcional em get_secretarias_cpfs.

CREATE OR REPLACE FUNCTION public.get_contratos_valor_total(p_contrato_ids uuid[])
RETURNS TABLE(contrato_id uuid, valor_total numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT ci.contrato_id,
         COALESCE(SUM(ci.valor_total), 0)::numeric AS valor_total
    FROM public.contrato_itens ci
   WHERE ci.contrato_id = ANY (p_contrato_ids)
   GROUP BY ci.contrato_id;
$$;

REVOKE ALL ON FUNCTION public.get_contratos_valor_total(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contratos_valor_total(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_contratos_por_secretaria()
RETURNS TABLE(secretaria_sigla text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(c.secretaria_sigla, '') AS secretaria_sigla,
         COUNT(*)::bigint AS total
    FROM public.contratos c
   WHERE c.deleted_at IS NULL
   GROUP BY 1
   ORDER BY total DESC;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_contratos_por_secretaria() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_contratos_por_secretaria() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_secretarias_cpfs();

CREATE OR REPLACE FUNCTION public.get_secretarias_cpfs(p_secretaria_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, m2a_gestor_cpf text, m2a_fiscal_cpf text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores e gestores podem consultar CPFs.';
  END IF;

  RETURN QUERY
    SELECT s.id,
           max(CASE WHEN sc.papel = 'gestor' THEN sc.cpf END) AS m2a_gestor_cpf,
           max(CASE WHEN sc.papel = 'fiscal' THEN sc.cpf END) AS m2a_fiscal_cpf
      FROM public.secretarias s
      LEFT JOIN public.secretaria_contatos sc ON sc.secretaria_id = s.id
     WHERE p_secretaria_ids IS NULL
        OR s.id = ANY (p_secretaria_ids)
     GROUP BY s.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_secretarias_cpfs(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs(uuid[]) TO authenticated, service_role;
