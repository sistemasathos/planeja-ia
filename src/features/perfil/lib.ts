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

export function iniciais(nome: string | null | undefined, email?: string | null) {
  const base = (nome?.trim() || email?.split("@")[0] || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
