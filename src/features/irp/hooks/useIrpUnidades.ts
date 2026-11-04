import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { irpQueryKeys, type UnidadeIrp } from "../lib";

// Índice 0-based da coluna de soma na planilha. O cadastro guarda a ref
// 1-based; quando ela foi preenchida com o índice do mapa (30/40/49), o −1
// lia a parcela anterior (AD, AN, AW) em vez do total.
const COLUNA_SOMA_POR_UO: Record<string, number> = {
  "12904": 30, // FUNDEB → AE (AC+AD)
  "12906": 40, // FMS → AO (SUM AK:AN)
  "12909": 49, // FUNDO → AX (SUM AS:AW)
};

function refColunaDaSecretaria(m2aRefColuna: number, m2aUoId: string | null): number {
  const uo = String(m2aUoId ?? "").trim();
  const soma = COLUNA_SOMA_POR_UO[uo];
  if (soma !== undefined) return soma;
  return m2aRefColuna - 1;
}

export interface UseIrpUnidadesResult {
  unidades: UnidadeIrp[] | undefined;
  unidadeById: Map<string, UnidadeIrp>;
  isLoading: boolean;
}

/**
 * Fonte das "unidades de processamento" do IRP.
 *
 * Antes: `irp_unidades_processamento` (1 linha por UO) — colapsava dotações
 * distintas (ex.: SME FUNDEB-EF e SME FUNDEB-EI) numa única DFD.
 *
 * Agora: reaproveitamos o cadastro de `secretarias` (a MESMA fonte usada na
 * importação de contratos): cada linha com `m2a_ref_coluna` vira uma unidade
 * separada, com sua própria dotação (`m2a_dot_id`) e coluna na planilha.
 * Isso permite ao worker gerar 1 DFD por dotação no fluxo comum, replicando
 * o comportamento já validado em contratos.
 */
export function useIrpUnidades(): UseIrpUnidadesResult {
  const { data: unidades, isLoading } = useQuery({
    queryKey: irpQueryKeys.unidades,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, m2a_ref_coluna, m2a_dotacao_default, m2a_uo_id, m2a_dot_id",
        )
        .eq("ativa", true)
        .not("m2a_ref_coluna", "is", null)
        .order("numero")
        .order("m2a_ref_coluna");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        numero: number;
        sigla: string | null;
        nome: string;
        m2a_ref_coluna: number | null;
        m2a_dotacao_default: string | null;
        m2a_uo_id: string | null;
        m2a_dot_id: string | null;
      }>;
      // `secretarias.m2a_ref_coluna` é armazenado 1-based (mesma convenção do
      // parser de contratos — ver `contratoImport.ts` que faz `oneBased - 1`).
      // O parser IRP (`src/lib/irp.ts`) consome índices 0-based sobre a matriz
      // da planilha, então convertemos aqui. Sem essa conversão, cada coluna
      // era lida com offset +1 (ex.: FF Fundeb caía em AD em vez de AC).
      // FUNDEB, FMS e FUNDO ignoram o número gravado e leem a coluna de soma.
      return rows
        .filter((r) => typeof r.m2a_ref_coluna === "number" && r.m2a_ref_coluna >= 1)
        .map<UnidadeIrp>((r) => ({
          id: r.id,
          numero: Number(r.numero),
          nome: r.m2a_dotacao_default
            ? `${r.nome} · ${r.m2a_dotacao_default}`
            : r.nome,
          ref_coluna: refColunaDaSecretaria(Number(r.m2a_ref_coluna), r.m2a_uo_id),
          secretaria_id: r.id,
        }));
    },
  });

  const unidadeById = useMemo(
    () => new Map(((unidades ?? []) as UnidadeIrp[]).map((u) => [u.id, u])),
    [unidades],
  );

  return { unidades, unidadeById, isLoading };
}
