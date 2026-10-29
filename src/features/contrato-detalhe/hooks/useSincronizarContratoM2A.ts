import { useCallback, useState } from "react";
import { notify } from "@/lib/notify";
import {
  fetchSincronizarContrato,
  persistDocumentosGerados,
  syncContratoDocumentos,
  syncContratoItens,
} from "@/lib/m2a/sincronizar-contrato";
import type { ContratoFull } from "../lib";

export function useSincronizarContratoM2A(
  contrato: ContratoFull | null | undefined,
  onDone: () => void,
) {
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async () => {
    if (!contrato) return;
    const c = contrato.contrato;
    const m2aContratoId = c.m2a_contrato_id;
    if (!m2aContratoId) {
      notify.error(
        "Este contrato ainda não foi enviado à M2A — não há ID para sincronizar.",
      );
      return;
    }

    setSincronizando(true);
    const toastId = notify.loading("Consultando dados na M2A…");
    try {
      const data = await fetchSincronizarContrato(String(m2aContratoId));
      const { atualizados, semMatch, semMudanca } = await syncContratoItens({
        itens: contrato.itens,
        remoteItens: data.itens ?? [],
        throwOnError: true,
      });

      const partes = [
        `${atualizados} item(ns) atualizado(s)`,
        `${semMudanca} sem mudança`,
      ];
      if (semMatch > 0) partes.push(`${semMatch} sem correspondência na M2A`);

      const docsVinculados = await syncContratoDocumentos({
        contratoId: c.id,
        documentosRemotos: data.documentos ?? [],
        insertUnmatched: false,
      });
      if (docsVinculados > 0) {
        partes.push(`${docsVinculados} link(s) de documento vinculados`);
      }
      await persistDocumentosGerados(c.id, data.documentos ?? []);

      notify.success(`Sincronização concluída: ${partes.join(" · ")}.`, {
        id: toastId,
      });
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error(`Falha ao sincronizar com a M2A: ${msg}`, { id: toastId });
    } finally {
      setSincronizando(false);
    }
  }, [contrato, onDone]);

  return { sincronizar, sincronizando };
}
