import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SecretariasMultiSelect } from "@/components/layout/SecretariasMultiSelect";
import { notify } from "@/lib/notify";
import {
  ConflitoTarefaError,
  abrirAnexo,
  useAnexos,
  useAtualizarTarefa,
  useEnviarAnexo,
  useEventos,
  useExcluirTarefa,
  useRemoverAnexo,
} from "../hooks";
import {
  MAX_ANEXO_BYTES,
  SITUACOES,
  formatarData,
  urlSegura,
  type Campo,
  type Etapa,
  type EventoRow,
  type MembroEquipe,
  type Tarefa,
} from "../lib";
import { ProcessoPicker } from "./ProcessoPicker";

type Draft = {
  titulo: string;
  etapa_id: string;
  tipo: string;
  modalidade: string;
  todas_secretarias: boolean;
  secretaria_ids: string[];
  processo_id: string | null;
  link_url: string;
  responsavel_id: string | null;
  situacao: string;
  observacao: string;
  campos: Record<string, string>;
};

function draftDe(t: Tarefa): Draft {
  return {
    titulo: t.titulo,
    etapa_id: t.etapa_id,
    tipo: t.tipo ?? "",
    modalidade: t.modalidade ?? "",
    todas_secretarias: t.todas_secretarias,
    secretaria_ids: [...t.secretaria_ids].sort(),
    processo_id: t.processo_id,
    link_url: t.link_url ?? "",
    responsavel_id: t.responsavel_id,
    situacao: t.situacao,
    observacao: t.observacao ?? "",
    campos: { ...t.campos },
  };
}

function iguais(a: Draft, b: Draft): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
}

function normalizar(d: Draft) {
  const campos = Object.fromEntries(
    Object.entries(d.campos)
      .filter(([, v]) => v.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { ...d, secretaria_ids: [...d.secretaria_ids].sort(), campos };
}

function formatarTamanho(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  tarefa: Tarefa | null;
  etapas: Etapa[];
  campos: Campo[];
  equipe: MembroEquipe[];
  secretarias: { id: string; label: string }[];
  modalidades: string[];
  tipos: string[];
  podeEditar: boolean;
  onFechar: () => void;
};

export function TarefaSheet({
  tarefa,
  etapas,
  campos,
  equipe,
  secretarias,
  modalidades,
  tipos,
  podeEditar,
  onFechar,
}: Props) {
  const atualizar = useAtualizarTarefa();
  const excluir = useExcluirTarefa();
  const [draft, setDraft] = useState<Draft | null>(null);
  const baseRef = useRef<{ id: string; updatedAt: string } | null>(null);
  const originalRef = useRef<Draft | null>(null);
  const [externo, setExterno] = useState(false);

  // Inicializa ao abrir outra tarefa; sincroniza quando não há edição pendente.
  useEffect(() => {
    if (!tarefa) {
      setDraft(null);
      baseRef.current = null;
      originalRef.current = null;
      setExterno(false);
      return;
    }
    const mudouTarefa = baseRef.current?.id !== tarefa.id;
    const mudouNoServidor = baseRef.current?.updatedAt !== tarefa.updated_at;
    const sujo =
      draft && originalRef.current ? !iguais(draft, originalRef.current) : false;
    if (mudouTarefa || (mudouNoServidor && !sujo)) {
      const novo = draftDe(tarefa);
      setDraft(novo);
      originalRef.current = novo;
      baseRef.current = { id: tarefa.id, updatedAt: tarefa.updated_at };
      setExterno(false);
    } else if (mudouNoServidor && sujo) {
      setExterno(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa]);

  const sujo = useMemo(
    () => (draft && originalRef.current ? !iguais(draft, originalRef.current) : false),
    [draft],
  );

  const etapasVisiveis = useMemo(
    () => etapas.filter((e) => !e.arquivada || e.id === draft?.etapa_id),
    [etapas, draft?.etapa_id],
  );
  const camposAtivos = useMemo(
    () => campos.filter((c) => !c.arquivado),
    [campos],
  );
  const camposDaEtapa = camposAtivos.filter((c) => c.etapa_id === draft?.etapa_id);
  const camposOutras = camposAtivos.filter((c) => c.etapa_id !== draft?.etapa_id);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }
  function setCampo(id: string, v: string) {
    setDraft((d) => (d ? { ...d, campos: { ...d.campos, [id]: v } } : d));
  }

  function recarregar() {
    if (!tarefa) return;
    const novo = draftDe(tarefa);
    setDraft(novo);
    originalRef.current = novo;
    baseRef.current = { id: tarefa.id, updatedAt: tarefa.updated_at };
    setExterno(false);
  }

  async function salvar() {
    if (!tarefa || !draft || !baseRef.current) return;
    const titulo = draft.titulo.trim();
    if (!titulo) {
      notify.error("Informe o título da tarefa");
      return;
    }
    const link = draft.link_url.trim();
    if (link && !urlSegura(link)) {
      notify.error("Link inválido", {
        description: "Use um endereço começando com http:// ou https://",
      });
      return;
    }
    const valores: Record<string, string> = {};
    for (const c of camposAtivos) {
      const v = (draft.campos[c.id] ?? "").trim();
      if (!v) continue;
      if (c.tipo === "link" && !urlSegura(v)) {
        notify.error(`Link inválido em "${c.nome}"`, {
          description: "Use um endereço começando com http:// ou https://",
        });
        return;
      }
      valores[c.id] = v.slice(0, 1000);
    }
    // Preserva valores de campos já arquivados.
    for (const [k, v] of Object.entries(draft.campos)) {
      if (!(k in valores) && !camposAtivos.some((c) => c.id === k) && v.trim()) {
        valores[k] = v;
      }
    }
    try {
      const res = await atualizar.mutateAsync({
        id: tarefa.id,
        baseUpdatedAt: baseRef.current.updatedAt,
        secretariaIds: draft.secretaria_ids,
        patch: {
          titulo,
          etapa_id: draft.etapa_id,
          tipo: draft.tipo.trim() || null,
          modalidade: draft.modalidade.trim() || null,
          todas_secretarias: draft.todas_secretarias,
          processo_id: draft.processo_id,
          link_url: link ? (urlSegura(link) ?? null) : null,
          responsavel_id: draft.responsavel_id,
          situacao: draft.situacao,
          observacao: draft.observacao.trim() || null,
          campos: valores,
        },
      });
      baseRef.current = { id: tarefa.id, updatedAt: res.updated_at };
      const salvo = { ...draft, titulo, campos: valores };
      setDraft(salvo);
      originalRef.current = salvo;
      setExterno(false);
      notify.success("Tarefa salva");
    } catch (e) {
      if (e instanceof ConflitoTarefaError) {
        setExterno(true);
        notify.error("Tarefa alterada por outra pessoa", {
          description: "Recarregue os dados antes de salvar novamente.",
        });
      } else {
        notify.error("Não foi possível salvar", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    }
  }

  async function remover() {
    if (!tarefa) return;
    const ok = await notify.confirmAsync(`Excluir a tarefa "${tarefa.titulo}"?`, {
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await excluir.mutateAsync(tarefa.id);
      notify.success("Tarefa excluída");
      onFechar();
    } catch (e) {
      notify.error("Não foi possível excluir", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function tentarFechar(aberto: boolean) {
    if (aberto) return;
    if (sujo) {
      const ok = await notify.confirmAsync("Descartar as alterações não salvas?", {
        confirmLabel: "Descartar",
        cancelLabel: "Continuar editando",
      });
      if (!ok) return;
    }
    onFechar();
  }

  const desabilitado = !podeEditar;

  return (
    <Sheet open={Boolean(tarefa)} onOpenChange={(o) => void tentarFechar(o)}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 px-5 py-4 text-left">
          <SheetTitle className="pr-6 leading-snug">{tarefa?.titulo ?? "Tarefa"}</SheetTitle>
          <SheetDescription>
            {tarefa
              ? `Criada em ${formatarData(tarefa.created_at)}`
              : "Detalhes da tarefa"}
            {desabilitado && " · somente leitura"}
          </SheetDescription>
        </SheetHeader>

        {draft && tarefa && (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {externo && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  Esta tarefa foi alterada por outra pessoa.
                  <Button type="button" variant="link" className="h-auto p-0 pl-1" onClick={recarregar}>
                    Descartar minhas alterações e recarregar
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="t-titulo">Título</Label>
              <Input
                id="t-titulo"
                value={draft.titulo}
                maxLength={300}
                disabled={desabilitado}
                onChange={(e) => set("titulo", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select
                  value={draft.etapa_id}
                  onValueChange={(v) => set("etapa_id", v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {etapasVisiveis.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                        {e.arquivada ? " (arquivada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select
                  value={draft.situacao}
                  onValueChange={(v) => set("situacao", v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITUACOES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-modalidade">Modalidade</Label>
                <Input
                  id="t-modalidade"
                  list="t-modalidades"
                  value={draft.modalidade}
                  maxLength={80}
                  disabled={desabilitado}
                  onChange={(e) => set("modalidade", e.target.value)}
                />
                <datalist id="t-modalidades">
                  {modalidades.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-tipo">Tipo</Label>
                <Input
                  id="t-tipo"
                  list="t-tipos"
                  value={draft.tipo}
                  maxLength={80}
                  disabled={desabilitado}
                  onChange={(e) => set("tipo", e.target.value)}
                />
                <datalist id="t-tipos">
                  {tipos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Responsável</Label>
                <Select
                  value={draft.responsavel_id ?? "__nenhum__"}
                  onValueChange={(v) => set("responsavel_id", v === "__nenhum__" ? null : v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Sem responsável</SelectItem>
                    {equipe.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                        {m.cargo ? ` — ${m.cargo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Secretarias</Label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.todas_secretarias}
                    disabled={desabilitado}
                    onCheckedChange={(v) => set("todas_secretarias", v)}
                  />
                  Todas as secretarias
                </label>
              </div>
              {!draft.todas_secretarias && (
                <SecretariasMultiSelect
                  options={secretarias}
                  value={draft.secretaria_ids}
                  onChange={(v) => set("secretaria_ids", v)}
                  disabled={desabilitado}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Processo importado</Label>
              <ProcessoPicker
                value={draft.processo_id}
                onChange={(v) => set("processo_id", v)}
                disabled={desabilitado}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-link">Link (M2A)</Label>
              <Input
                id="t-link"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={draft.link_url}
                maxLength={2000}
                disabled={desabilitado}
                onChange={(e) => set("link_url", e.target.value)}
              />
            </div>

            {camposDaEtapa.length > 0 && (
              <fieldset className="space-y-3 rounded-lg border border-border/60 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campos da etapa
                </legend>
                {camposDaEtapa.map((c) => (
                  <CampoInput
                    key={c.id}
                    campo={c}
                    valor={draft.campos[c.id] ?? ""}
                    onChange={(v) => setCampo(c.id, v)}
                    disabled={desabilitado}
                  />
                ))}
              </fieldset>
            )}

            {camposOutras.length > 0 && (
              <details className="rounded-lg border border-border/60 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Campos de outras etapas
                </summary>
                <div className="mt-3 space-y-3">
                  {camposOutras.map((c) => (
                    <CampoInput
                      key={c.id}
                      campo={c}
                      etapaNome={etapas.find((e) => e.id === c.etapa_id)?.nome}
                      valor={draft.campos[c.id] ?? ""}
                      onChange={(v) => setCampo(c.id, v)}
                      disabled={desabilitado}
                    />
                  ))}
                </div>
              </details>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="t-obs">Observações</Label>
              <Textarea
                id="t-obs"
                rows={5}
                maxLength={10000}
                value={draft.observacao}
                disabled={desabilitado}
                onChange={(e) => set("observacao", e.target.value)}
              />
            </div>

            <AnexosSection tarefaId={tarefa.id} podeEditar={podeEditar} />
            <HistoricoSection tarefaId={tarefa.id} etapas={etapas} equipe={equipe} />
          </div>
        )}

        {podeEditar && tarefa && (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => void remover()}
              disabled={excluir.isPending}
            >
              <Trash2 className="size-4" /> Excluir
            </Button>
            <div className="flex items-center gap-2">
              {sujo && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}
              <Button type="button" onClick={() => void salvar()} disabled={!sujo || atualizar.isPending}>
                {atualizar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CampoInput({
  campo,
  etapaNome,
  valor,
  onChange,
  disabled,
}: {
  campo: Campo;
  etapaNome?: string;
  valor: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const id = `campo-${campo.id}`;
  const rotulo = etapaNome ? `${campo.nome} (${etapaNome})` : campo.nome;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {campo.tipo === "lista" ? (
        <Select
          value={valor || "__vazio__"}
          onValueChange={(v) => onChange(v === "__vazio__" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__vazio__">—</SelectItem>
            {campo.opcoes.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
            {valor && !campo.opcoes.includes(valor) && (
              <SelectItem value={valor}>{valor}</SelectItem>
            )}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={
            campo.tipo === "data"
              ? "date"
              : campo.tipo === "numero"
                ? "number"
                : campo.tipo === "link"
                  ? "url"
                  : "text"
          }
          step={campo.tipo === "numero" ? "any" : undefined}
          placeholder={campo.tipo === "link" ? "https://…" : undefined}
          maxLength={1000}
          value={valor}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function AnexosSection({ tarefaId, podeEditar }: { tarefaId: string; podeEditar: boolean }) {
  const { data: anexos = [], isLoading } = useAnexos(tarefaId);
  const enviar = useEnviarAnexo(tarefaId);
  const remover = useRemoverAnexo(tarefaId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function aoEscolher(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        await enviar.mutateAsync(file);
        notify.success(`"${file.name}" anexado`);
      } catch (e) {
        notify.error(`Falha ao anexar "${file.name}"`, {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Anexos</Label>
        {podeEditar && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void aoEscolher(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enviar.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {enviar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Anexar
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Até {MAX_ANEXO_BYTES / 1024 / 1024} MB por arquivo.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : anexos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={a.original_name}>
                {a.original_name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatarTamanho(a.size_bytes)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Baixar ${a.original_name}`}
                onClick={() =>
                  void abrirAnexo(a).catch((e: unknown) =>
                    notify.error("Não foi possível abrir o arquivo", {
                      description: e instanceof Error ? e.message : undefined,
                    }),
                  )
                }
              >
                <Download className="size-3.5" />
              </Button>
              {podeEditar && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remover ${a.original_name}`}
                  disabled={remover.isPending}
                  onClick={async () => {
                    const ok = await notify.confirmAsync(`Remover "${a.original_name}"?`, {
                      confirmLabel: "Remover",
                    });
                    if (!ok) return;
                    try {
                      await remover.mutateAsync(a);
                    } catch (e) {
                      notify.error("Não foi possível remover", {
                        description: e instanceof Error ? e.message : undefined,
                      });
                    }
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function descreverEvento(
  ev: EventoRow,
  etapas: Etapa[],
  equipe: MembroEquipe[],
): string {
  const d = (ev.detalhes ?? {}) as Record<string, unknown>;
  const etapa = (id: unknown) =>
    etapas.find((e) => e.id === id)?.nome ?? "etapa removida";
  const pessoa = (id: unknown) =>
    id ? (equipe.find((m) => m.id === id)?.nome ?? "alguém") : "ninguém";
  switch (ev.tipo) {
    case "criada":
      return `Tarefa criada em ${etapa(d.etapa_id)}`;
    case "movida":
      return `Movida de ${etapa(d.de)} para ${etapa(d.para)}`;
    case "situacao": {
      const rot = (v: unknown) => SITUACOES.find((s) => s.value === v)?.label ?? String(v);
      return `Situação: ${rot(d.de)} → ${rot(d.para)}`;
    }
    case "responsavel":
      return `Responsável: ${pessoa(d.de)} → ${pessoa(d.para)}`;
    case "excluida":
      return "Tarefa excluída";
    case "restaurada":
      return "Tarefa restaurada";
    default:
      return ev.tipo;
  }
}

function HistoricoSection({
  tarefaId,
  etapas,
  equipe,
}: {
  tarefaId: string;
  etapas: Etapa[];
  equipe: MembroEquipe[];
}) {
  const { data: eventos = [] } = useEventos(tarefaId);
  if (eventos.length === 0) return null;
  return (
    <details className="rounded-lg border border-border/60 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Histórico ({eventos.length})
      </summary>
      <ul className="mt-2 space-y-1.5 text-xs">
        {eventos.map((ev) => (
          <li key={ev.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">
              {new Date(ev.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
            <span>
              {descreverEvento(ev, etapas, equipe)}
              {ev.user_id && (
                <span className="text-muted-foreground">
                  {" "}
                  — {equipe.find((m) => m.id === ev.user_id)?.nome ?? "usuário"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
