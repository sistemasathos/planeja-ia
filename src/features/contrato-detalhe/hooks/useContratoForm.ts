import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { getDataFimContrato, isNumericM2AId } from "@/lib/m2a";
import type { ContratoFull } from "../lib";

export function useContratoForm(
  id: string,
  contrato: ContratoFull | null | undefined,
) {
  const qc = useQueryClient();

  const [editNumeroContrato, setEditNumeroContrato] = useState("");
  const [editAtaId, setEditAtaId] = useState("");
  const [editData, setEditData] = useState("");
  const [editDataFim, setEditDataFim] = useState("");
  const [editObjeto, setEditObjeto] = useState("");
  const [editPreposto, setEditPreposto] = useState("");
  const [editFiscal, setEditFiscal] = useState("");
  const [editM2AContratoId, setEditM2AContratoId] = useState("");
  const [limpandoVinculoM2A, setLimpandoVinculoM2A] = useState(false);
  const [salvandoM2AConfig, setSalvandoM2AConfig] = useState(false);

  useEffect(() => {
    if (!contrato?.contrato) return;
    const cc = contrato.contrato;
    setEditNumeroContrato(cc.numero_contrato ?? "");
    setEditAtaId(cc.m2a_ata_id ?? "");
    const dataIni = cc.data ? String(cc.data).slice(0, 10) : "";
    setEditData(dataIni);
    setEditDataFim(
      cc.data_fim
        ? String(cc.data_fim).slice(0, 10)
        : dataIni
          ? getDataFimContrato(dataIni)
          : "",
    );
    setEditObjeto(cc.objeto ?? "");
    setEditPreposto(cc.preposto ?? "");
    setEditFiscal(cc.fiscal ?? "");
    setEditM2AContratoId(cc.m2a_contrato_id ?? "");
  }, [contrato?.contrato]);

  /**
   * Remove o vínculo com o portal: usado quando o contrato foi apagado na
   * M2A e o sistema fica tentando retomar um ID inexistente.
   */
  const handleLimparVinculoM2A = useCallback(async () => {
    setLimpandoVinculoM2A(true);
    const { error } = await supabase
      .from("contratos")
      .update({
        m2a_contrato_id: null,
        m2a_documentos_gerados: [] as any,
        enviado_m2a_em: null,
        ultimo_erro_m2a: null,
        status_envio_m2a: "pendente",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setLimpandoVinculoM2A(false);
    if (error) {
      notify.error(error.message);
      return;
    }
    setEditM2AContratoId("");
    notify.success("Vínculo com o portal removido. Contrato pronto para reenvio.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["contrato-full", id] }),
      qc.invalidateQueries({ queryKey: ["processo-detail"] }),
    ]);
  }, [id, qc]);


  const handleSalvarContratoM2AConfig = useCallback(async () => {
    if (!contrato) return;
    const numero = editNumeroContrato.trim();
    if (!numero) {
      notify.error("Informe o número do contrato.");
      return;
    }
    if (editAtaId && !isNumericM2AId(editAtaId)) {
      notify.error("Selecione uma ata válida.");
      return;
    }
    const idPortal = editM2AContratoId.trim();
    if (idPortal && !isNumericM2AId(idPortal)) {
      notify.error("O ID do contrato no portal deve conter apenas números.");
      return;
    }
    const ataSelecionada = editAtaId
      ? contrato.m2aAtas.find((ata) => ata.m2a_ata_id === editAtaId)
      : null;
    setSalvandoM2AConfig(true);
    const { error } = await supabase
      .from("contratos")
      .update({
        numero_contrato: numero,
        m2a_ata_id: editAtaId || undefined,
        m2a_ata_numero: ataSelecionada?.numero_ata ?? undefined,
        fornecedor_nome: ataSelecionada?.fornecedor_nome ?? undefined,
        data: editData ? editData : undefined,
        data_fim: editDataFim ? editDataFim : null,
        objeto: editObjeto.trim() || undefined,
        preposto: editPreposto.trim() || undefined,
        fiscal: editFiscal.trim() || undefined,
        m2a_contrato_id: idPortal || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSalvandoM2AConfig(false);
    if (error) {
      notify.error(error.message);
      return;
    }
    notify.success("Contrato atualizado para envio.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["contrato-full", id] }),
      qc.invalidateQueries({ queryKey: ["processo-detail"] }),
    ]);
  }, [
    contrato,
    editNumeroContrato,
    editAtaId,
    editData,
    editDataFim,
    editObjeto,
    editPreposto,
    editFiscal,
    editM2AContratoId,
    id,
    qc,
  ]);


  return {
    editNumeroContrato,
    setEditNumeroContrato,
    editAtaId,
    setEditAtaId,
    editData,
    setEditData,
    editDataFim,
    setEditDataFim,
    editObjeto,
    setEditObjeto,
    editPreposto,
    setEditPreposto,
    editFiscal,
    setEditFiscal,
    editM2AContratoId,
    setEditM2AContratoId,
    limpandoVinculoM2A,
    handleLimparVinculoM2A,
    salvandoM2AConfig,
    handleSalvarContratoM2AConfig,
  };
}
