import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import {
  fetchSincronizarContrato,
  persistDocumentosGerados,
  syncContratoDocumentos,
  syncContratoItens,
} from "@/lib/m2a/sincronizar-contrato";
import type { ContratoRow } from "../lib";

export function useSincronizarProcessoM2A(
  processoId: string,
  contratos: ContratoRow[],
) {
  const qc = useQueryClient();
  const [sincronizando, setSincronizando] = useState(false);
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const sincronizar = useCallback(async () => {
    const { data: dbContratos } = await supabase
      .from("contratos")
      .select("id, numero_contrato, m2a_contrato_id, m2a_documentos_gerados")
      .eq("processo_id", processoId)
      .not("m2a_contrato_id", "is", null);

    if (!dbContratos || dbContratos.length === 0) {
      notify.error(
        "Nenhum contrato deste processo foi enviado à M2A ainda.",
      );
      return;
    }

    const contratosParaSinc = dbContratos.filter((c) => {
      const docs = c.m2a_documentos_gerados as any[];
      return !docs || docs.length === 0;
    });

    if (contratosParaSinc.length === 0) {
      const resetConfirm = await notify.confirmAsync(
        "Todos os contratos já parecem ter documentos sincronizados. Deseja forçar uma nova sincronização geral?",
      );
      if (!resetConfirm) return;
      contratosParaSinc.push(...dbContratos);
    }

    setSincronizando(true);
    startTask(
      "Sincronizando Processo",
      `Sincronizando ${contratosParaSinc.length} contrato(s) que possuem documentos pendentes...`,
    );

    let sucessos = 0;
    let falhas = 0;
    let totalItensAtualizados = 0;
    let totalDocsVinculados = 0;

    try {
      for (let i = 0; i < contratosParaSinc.length; i++) {
        const c = contratosParaSinc[i];
        const progresso = (i / contratosParaSinc.length) * 100;
        updateProgress(
          progresso,
          `Sincronizando contrato ${c.numero_contrato} (${i + 1}/${contratosParaSinc.length})...`,
        );

        try {
          const data = await fetchSincronizarContrato(String(c.m2a_contrato_id));
          const { data: dbItens } = await supabase
            .from("contrato_itens")
            .select(
              "id, m2a_item_id, numero_item, quantidade, valor_unitario, valor_total",
            )
            .eq("contrato_id", c.id);

          const itemStats = await syncContratoItens({
            itens: dbItens ?? [],
            remoteItens: data.itens ?? [],
            throwOnError: false,
          });
          totalItensAtualizados += itemStats.atualizados;

          const docsVinculados = await syncContratoDocumentos({
            contratoId: c.id,
            documentosRemotos: data.documentos ?? [],
            insertUnmatched: true,
          });
          totalDocsVinculados += docsVinculados;

          await persistDocumentosGerados(c.id, data.documentos ?? []);
          sucessos++;
        } catch (err) {
          console.error(`Erro ao sincronizar contrato ${c.numero_contrato}:`, err);
          falhas++;
        }
      }

      const msgFinal =
        `Sincronização concluída: ${sucessos} sucesso(s), ${falhas} falha(s). ` +
        `${totalItensAtualizados} itens e ${totalDocsVinculados} docs atualizados.`;

      finishTask(msgFinal);
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      notify.success("Sincronização do processo concluída.");
    } catch (e) {
      failTask(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }, [processoId, contratos, qc, startTask, updateProgress, finishTask, failTask]);

  return { sincronizar, sincronizando };
}
