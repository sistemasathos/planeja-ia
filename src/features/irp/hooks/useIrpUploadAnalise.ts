import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "@/contexts/ProgressContext";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { readWorkbook, analisar, type AnaliseIRP } from "@/lib/irp";
import type { UnidadeIrp } from "../lib";
import { useIrpSalvarResultado } from "./useIrpSalvarResultado";

export interface UseIrpUploadAnaliseOptions {
  unidades: UnidadeIrp[] | undefined;
  onBeforeAnalisar: () => void;
  onJobCriado: (jobId: string) => void;
}

export interface UseIrpUploadAnaliseResult {
  file: File | null;
  setFile: (f: File | null) => void;
  analise: AnaliseIRP | null;
  setAnalise: (a: AnaliseIRP | null) => void;
  progress: number;
  busy: boolean;
  handleAnalisar: () => Promise<void>;
}

export function useIrpUploadAnalise({
  unidades,
  onBeforeAnalisar,
  onJobCriado,
}: UseIrpUploadAnaliseOptions): UseIrpUploadAnaliseResult {
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const { persistirArquivosResultado } = useIrpSalvarResultado();
  const [file, setFile] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseIRP | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleAnalisar = useCallback(async () => {
    if (!file || !unidades) return;
    onBeforeAnalisar();
    setBusy(true);
    setProgress(10);
    startTask("Analisando IRP", "Lendo a planilha enviada...");
    try {
      const tLeitura = performance.now();
      const matrix = await readWorkbook(file);
      console.info(
        `[irp] leitura ${Math.round(performance.now() - tLeitura)}ms (${matrix.length} linhas)`,
      );
      setProgress(40);
      updateProgress(40, "Identificando colunas e unidades...");
      const tAnalise = performance.now();
      const a = analisar(matrix, unidades);
      console.info(
        `[irp] analise ${Math.round(performance.now() - tAnalise)}ms`,
      );
      setAnalise(a);
      setProgress(70);
      updateProgress(70, "Registrando resultado da análise...");

      const { data: jobRow, error } = await supabase
        .from("irp_jobs")
        .insert({
          original_filename: file.name,
          status: "analyzed",
          linha_cabecalho: a.linhaCabecalho,
          idx_natureza: a.idxNatureza,
          idx_descricao: a.idxDescricao,
          idx_especificacao: a.idxEspecificacao,
          idx_unidade: a.idxUnidade,
          total_secretarias: a.resultados.length,
          secretarias_com_itens: a.resultados.filter(
            (r) => r.itens.length > 0,
          ).length,
          secretarias_sem_itens: a.resultados.filter(
            (r) => r.itens.length === 0,
          ).length,
          total_linhas: a.resultados.reduce((s, r) => s + r.itens.length, 0),
          total_valor: a.resultados.reduce((s, r) => s + r.somaValor, 0),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      onJobCriado(jobRow.id);

      const { error: secretariasError } = await supabase
        .from("irp_job_secretarias")
        .insert(
          a.resultados.map((r) => ({
            job_id: jobRow.id,
            unidade_id: r.unidade.id,
            numero: r.unidade.numero,
            nome: r.unidade.nome,
            ref_coluna: r.unidade.ref_coluna,
            cabecalho_coluna: r.cabecalhoColuna,
            itens_validos: r.itens.length,
            soma_valor: r.somaValor,
            status: r.status,
            erro: r.erro ?? null,
          })),
        );
      if (secretariasError) throw secretariasError;

      setProgress(100);
      finishTask(`Planilha analisada: ${a.resultados.length} unidade(s).`);
      notify.success(`Planilha analisada: ${a.resultados.length} unidades`);
      setBusy(false);

      const jobId = jobRow.id;
      const arquivo = file;
      window.setTimeout(() => {
        const tGravacao = performance.now();
        void persistirArquivosResultado(jobId, arquivo, a)
          .then(async () => {
            console.info(
              `[irp] gravacao ${Math.round(performance.now() - tGravacao)}ms`,
            );
            setAnalise((atual) => {
              if (atual !== a) return atual;
              return {
                ...a,
                resultados: a.resultados.map((r) =>
                  r.itens.length > 0 ? { ...r, status: "exportado" } : r,
                ),
              };
            });
            await logAudit({
              action: "irp_analyze",
              entityType: "irp_job",
              entityId: jobId,
              payload: { filename: arquivo.name, total: a.resultados.length },
            });
          })
          .catch((erro: unknown) => {
            const message =
              erro instanceof Error ? erro.message : "Falha ao salvar as planilhas.";
            notify.error("Falha ao salvar as planilhas", { description: message });
          });
      }, 0);
    } catch (e: any) {
      failTask(e?.message ?? "Falha na análise IRP.");
      notify.error("Falha na análise", { description: e?.message });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }, [
    failTask,
    file,
    finishTask,
    onBeforeAnalisar,
    onJobCriado,
    persistirArquivosResultado,
    startTask,
    unidades,
    updateProgress,
  ]);

  return {
    file,
    setFile,
    analise,
    setAnalise,
    progress,
    busy,
    handleAnalisar,
  };
}
