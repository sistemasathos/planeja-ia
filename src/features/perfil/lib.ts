import { z } from "zod";

/** Máscara de telefone BR: (00) 0000-0000 ou (00) 00000-0000. */
export function maskTelefone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const perfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120, "Máximo 120 caracteres"),
  telefone: z
    .string()
    .trim()
    .max(30)
    .refine(
      (v) => v === "" || [10, 11].includes(v.replace(/\D/g, "").length),
      "Telefone inválido (use DDD + número)",
    ),
  cargo: z.string().trim().max(120, "Máximo 120 caracteres"),
  endereco: z.string().trim().max(300, "Máximo 300 caracteres"),
  secretarias: z.array(z.string().uuid()),
  principal: z.string().uuid().nullable(),
});

export type PerfilFormValues = z.infer<typeof perfilSchema>;

export type SecretariaOpcao = {
  id: string;
  /** Todos os ids da sigla, inclusive unidades já vinculadas. */
  ids: string[];
  sigla: string;
  numero: number;
  label: string;
};

type LinhaSecretaria = {
  id: string;
  sigla: string;
  nome: string;
  numero: number;
  m2a_orgao_id: string | null;
};

/** Sigla comparável: sem espaços nas pontas e em maiúsculas. */
export function siglaNormalizada(sigla: string | null | undefined): string {
  return (sigla ?? "").trim().toUpperCase();
}

/**
 * Uma linha por sigla. Prefere órgão vinculado, nome sem " - ",
 * nome mais curto e, por último, o menor número.
 */
export function escolherPrincipal<T extends LinhaSecretaria>(linhas: T[]): T {
  return [...linhas].sort((a, b) => {
    const orgao = Number(Boolean(b.m2a_orgao_id)) - Number(Boolean(a.m2a_orgao_id));
    if (orgao) return orgao;
    const hifen = Number(a.nome.includes(" - ")) - Number(b.nome.includes(" - "));
    if (hifen) return hifen;
    const tamanho = a.nome.length - b.nome.length;
    if (tamanho) return tamanho;
    return a.numero - b.numero;
  })[0];
}

/** Nome da secretaria, sem sigla e sem o complemento depois de " - ". */
export function nomeSecretaria(nome: string): string {
  const base = nome.split(" - ")[0]?.trim() || nome.trim();
  return base;
}

export function agruparSecretarias<T extends LinhaSecretaria>(linhas: T[]): SecretariaOpcao[] {
  const grupos = new Map<string, T[]>();
  for (const linha of linhas) {
    const sigla = siglaNormalizada(linha.sigla);
    const chave = sigla || `sem-sigla-${linha.id}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }
  return [...grupos.values()]
    .map((grupo) => {
      const principal = escolherPrincipal(grupo);
      const sigla = siglaNormalizada(principal.sigla) || principal.sigla.trim();
      return {
        id: principal.id,
        ids: grupo.map((l) => l.id),
        sigla,
        numero: principal.numero,
        label: nomeSecretaria(principal.nome),
      };
    })
    .sort((a, b) => a.numero - b.numero || a.label.localeCompare(b.label, "pt-BR"));
}

/** Troca ids de dotação pelo id principal da mesma sigla, sem repetir. */
export function idsPrincipais(
  ids: string[],
  opcoes: { id: string; ids?: string[] }[],
): string[] {
  const para = new Map<string, string>();
  for (const opcao of opcoes) {
    for (const id of opcao.ids?.length ? opcao.ids : [opcao.id]) para.set(id, opcao.id);
  }
  const saida: string[] = [];
  for (const id of ids) {
    const principal = para.get(id) ?? id;
    if (!saida.includes(principal)) saida.push(principal);
  }
  return saida;
}

export function iniciais(nome: string | null | undefined, email?: string | null) {
  const base = (nome?.trim() || email?.split("@")[0] || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
