CREATE OR REPLACE FUNCTION public.next_contrato_number(p_sec_num int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo int;
BEGIN
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, 1, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + 1,
        updated_at = now()
  RETURNING contador INTO v_novo;
  RETURN v_novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_contrato_numbers_batch(p_sec_num int, p_qtd int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final int;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'quantidade deve ser > 0';
  END IF;
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, p_qtd, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + p_qtd,
        updated_at = now()
  RETURNING contador INTO v_final;
  RETURN v_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_contrato_number(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch(int, int) TO authenticated;

DROP POLICY IF EXISTS ca_all ON public.contrato_atores;
DROP POLICY IF EXISTS ca_select ON public.contrato_atores;
DROP POLICY IF EXISTS ca_insert ON public.contrato_atores;
DROP POLICY IF EXISTS ca_update ON public.contrato_atores;
DROP POLICY IF EXISTS ca_delete ON public.contrato_atores;
CREATE POLICY ca_select ON public.contrato_atores FOR SELECT TO authenticated USING (true);
CREATE POLICY ca_insert ON public.contrato_atores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ca_update ON public.contrato_atores FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY ca_delete ON public.contrato_atores FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cd_all ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_select ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_insert ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_update ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_delete ON public.contrato_documentos;
CREATE POLICY cd_select ON public.contrato_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_insert ON public.contrato_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cd_update ON public.contrato_documentos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cd_delete ON public.contrato_documentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cidot_all ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_select ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_insert ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_update ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_delete ON public.contrato_item_dotacoes;
CREATE POLICY cid2_select ON public.contrato_item_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY cid2_insert ON public.contrato_item_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cid2_update ON public.contrato_item_dotacoes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cid2_delete ON public.contrato_item_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cij_all ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_select ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_insert ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_update ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_delete ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_insert_operational ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_update_operational ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_delete_manager ON public.contrato_import_jobs;
CREATE POLICY cij_select ON public.contrato_import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY cij_insert ON public.contrato_import_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cij_update ON public.contrato_import_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY cij_delete ON public.contrato_import_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cii_all ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_select ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_insert ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_update ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_delete ON public.contrato_import_itens;
CREATE POLICY cii_select ON public.contrato_import_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY cii_insert ON public.contrato_import_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cii_update ON public.contrato_import_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY cii_delete ON public.contrato_import_itens FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cid_all ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_select ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_insert ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_update ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_delete ON public.contrato_import_dotacoes;
CREATE POLICY ciddot_select ON public.contrato_import_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY ciddot_insert ON public.contrato_import_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ciddot_update ON public.contrato_import_dotacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY ciddot_delete ON public.contrato_import_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS jobs_all ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_select ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_insert ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_update ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_delete ON public.irp_jobs;
CREATE POLICY irpj_select ON public.irp_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY irpj_insert ON public.irp_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpj_update ON public.irp_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpj_delete ON public.irp_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS jobs_sec_all ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_select ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_insert ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_update ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_delete ON public.irp_job_secretarias;
CREATE POLICY irpjs_select ON public.irp_job_secretarias FOR SELECT TO authenticated USING (true);
CREATE POLICY irpjs_insert ON public.irp_job_secretarias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpjs_update ON public.irp_job_secretarias FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpjs_delete ON public.irp_job_secretarias FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS m2a_sync_at timestamptz;

-- m2a_atas / m2a_itens / m2a_contratos_snapshot: já em 20260527210319_828801ca-ccab-4e60-a44c-5c2267e3f6a6.sql