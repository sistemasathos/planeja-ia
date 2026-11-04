import { useCallback } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { gerarPlanilhaSecretaria, type AnaliseIRP } from "@/lib/irp";
import { uploadIrpFile, XLSX_MIME, ZIP_MIME } from "../lib";

const CONCORRENCIA_UPLOAD = 4;

async function emParalelo<T>(
  items: T[],
  limite: number,
  tarefa: (item: T) => Promise<void>,
) {
  if (!items.length) return;
  let proximo = 0;
  const trabalhadores = Array.from(
    { length: Math.min(limite, items.length) },
    async () => {
      while (proximo < items.length) {
        const item = items[proximo];
        proximo += 1;
        await tarefa(item);
      }
    },
  );
  await Promise.all(trabalhadores);
}

export interface UseIrpSalvarResultadoResult {
  persistirArquivosResultado: (
    jobId: string,
    arquivoOriginal: File,
    resultado: AnaliseIRP,
  ) => Promise<void>;
}

/**
 * Faz upload do XLSX original, gera cada planilha por secretaria,
 * empacota em .zip e marca o job como `completed`.
 * A sessão é lida uma vez e os envios correm em paralelo limitado.
 */
export function useIrpSalvarResultado(): UseIrpSalvarResultadoResult {
  const persistirArquivosResultado = useCallback(
    async (jobId: string, arquivoOriginal: File, resultado: AnaliseIRP) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw (
          userError ??
          new Error("Sessão expirada. Entre novamente para enviar arquivos.")
        );
      }
      const userId = user.id;

      const zip = new JSZip();
      const resultadosComItens = resultado.resultados.filter(
        (r) => r.itens.length > 0,
      );
      const gerados: Array<{
        unidadeId: string;
        refColuna: number;
        filename: string;
        blob: Blob;
      }> = [];

      for (const r of resultadosComItens) {
        const { filename, blob } = await gerarPlanilhaSecretaria(r);
        zip.file(filename, await blob.arrayBuffer());
        gerados.push({
          unidadeId: r.unidade.id,
          refColuna: r.unidade.ref_coluna,
          filename,
          blob,
        });
      }

      const zipBlob =
        gerados.length > 0
          ? await zip.generateAsync({ type: "blob" })
          : null;

      const tarefas: Array<() => Promise<void>> = [
        async () => {
          const uploadFile = await uploadIrpFile({
            jobId,
            folder: "upload",
            filename: arquivoOriginal.name,
            blob: arquivoOriginal,
            fileKind: "irp_upload",
            mimeType: arquivoOriginal.type || XLSX_MIME,
            userId,
          });
          const { error: uploadJobError } = await supabase
            .from("irp_jobs")
            .update({ upload_file_id: uploadFile.id })
            .eq("id", jobId);
          if (uploadJobError) throw uploadJobError;
        },
      ];

      for (const item of gerados) {
        tarefas.push(async () => {
          const outputFile = await uploadIrpFile({
            jobId,
            folder: "exports",
            filename: item.filename,
            blob: item.blob,
            fileKind: "irp_export",
            mimeType: XLSX_MIME,
            userId,
          });
          const { error: secUpdateError } = await supabase
            .from("irp_job_secretarias")
            .update({
              output_file_id: outputFile.id,
              output_filename: item.filename,
              status: "exportado",
            })
            .eq("job_id", jobId)
            .eq("unidade_id", item.unidadeId)
            .eq("ref_coluna", item.refColuna);
          if (secUpdateError) throw secUpdateError;
        });
      }

      if (zipBlob) {
        tarefas.push(async () => {
          await uploadIrpFile({
            jobId,
            folder: "zip",
            filename: `IRP_${new Date().toISOString().slice(0, 10)}.zip`,
            blob: zipBlob,
            fileKind: "zip_export",
            mimeType: ZIP_MIME,
            userId,
          });
        });
      }

      await emParalelo(tarefas, CONCORRENCIA_UPLOAD, (tarefa) => tarefa());

      const { error: completedError } = await supabase
        .from("irp_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (completedError) throw completedError;
    },
    [],
  );

  return { persistirArquivosResultado };
}
