import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { agruparSecretarias, type PerfilFormValues } from "./lib";

export const PERFIL_QUERY_KEY = ["perfil"] as const;

export type PerfilData = {
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  endereco: string | null;
  secretarias: string[];
  principal: string | null;
};

export function usePerfil() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [...PERFIL_QUERY_KEY, uid],
    enabled: Boolean(uid),
    queryFn: async (): Promise<PerfilData> => {
      const [{ data: p, error: pErr }, { data: links, error: lErr }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("nome, email, telefone, cargo, endereco")
            .eq("id", uid!)
            .maybeSingle(),
          supabase
            .from("profile_secretarias")
            .select("secretaria_id, principal")
            .eq("user_id", uid!),
        ]);
      if (pErr) throw pErr;
      if (lErr) throw lErr;
      return {
        nome: p?.nome ?? "",
        email: p?.email ?? user?.email ?? "",
        telefone: p?.telefone ?? null,
        cargo: p?.cargo ?? null,
        endereco: p?.endereco ?? null,
        secretarias: (links ?? []).map((l) => l.secretaria_id),
        principal: links?.find((l) => l.principal)?.secretaria_id ?? null,
      };
    },
  });
}

export function useSecretariasOpcoes() {
  return useQuery({
    queryKey: ["secretarias-opcoes"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select("id, sigla, nome, numero, m2a_orgao_id, ativa")
        .order("numero");
      if (error) throw error;
      return agruparSecretarias(
        (data ?? [])
          .filter((s) => s.ativa !== false)
          .map((s) => ({
            id: s.id,
            sigla: s.sigla,
            nome: s.nome,
            numero: s.numero,
            m2a_orgao_id: s.m2a_orgao_id,
          })),
      );
    },
  });
}

export function useSalvarPerfil() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PerfilFormValues) => {
      if (!user) throw new Error("Sessão expirada");
      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          nome: v.nome,
          telefone: v.telefone || null,
          cargo: v.cargo || null,
          endereco: v.endereco || null,
        })
        .eq("id", user.id);
      if (upErr) throw upErr;

      // Sincroniza secretarias: remove as desmarcadas e faz upsert das atuais.
      const { data: atuais, error: curErr } = await supabase
        .from("profile_secretarias")
        .select("secretaria_id")
        .eq("user_id", user.id);
      if (curErr) throw curErr;
      const manter = new Set(v.secretarias);
      const remover = (atuais ?? [])
        .map((a) => a.secretaria_id)
        .filter((sid) => !manter.has(sid));
      if (remover.length) {
        const { error } = await supabase
          .from("profile_secretarias")
          .delete()
          .eq("user_id", user.id)
          .in("secretaria_id", remover);
        if (error) throw error;
      }
      if (v.secretarias.length) {
        // Zera principal antes para respeitar o índice único parcial.
        const { error: clearErr } = await supabase
          .from("profile_secretarias")
          .update({ principal: false })
          .eq("user_id", user.id);
        if (clearErr) throw clearErr;
        const principal =
          v.principal && manter.has(v.principal) ? v.principal : null;
        const { error } = await supabase.from("profile_secretarias").upsert(
          v.secretarias.map((sid) => ({
            user_id: user.id,
            secretaria_id: sid,
            principal: sid === principal,
          })),
          { onConflict: "user_id,secretaria_id" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PERFIL_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["perfil-nome"] });
      void qc.invalidateQueries({ queryKey: ["equipe-usuarios"] });
    },
  });
}

/** Nome exibido no bloco do usuário (menu lateral). */
export function useNomeUsuario() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ["perfil-nome", uid],
    enabled: Boolean(uid),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data?.nome ?? null;
    },
  });
}
