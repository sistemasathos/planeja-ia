import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File as FileIcon,
  Loader2,
  Save,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { SecretariasMultiSelect } from "@/components/layout/SecretariasMultiSelect";
import { idsPrincipais } from "@/features/perfil/lib";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  ConflitoTarefaError,
  abrirAnexo,
  useAnexos,
  useAtualizarTarefa,
  useDocumentos,
  useEnviarAnexo,
  useEventos,
  useExcluirTarefa,
  registrarDocumentoTramitacao,
  TAREFAS_KEYS,
  useRemoverAnexo,
} from "../hooks";
import {
  MAX_ANEXO_BYTES,
  SITUACOES,
  formatarDia,
  identificadoresDaEtapa,
  identificadoresPendentes,
  mesclarIdentificadores,
  regraTramitacao,
  tramitacaoPendente,
  urlSegura,
  type Campo,
  type Etapa,
  type EventoRow,
  type MembroEquipe,
  type Situacao,
  type Tarefa,
} from "../lib";
import { AvancoEtapaDialog } from "./AvancoEtapaDialog";
import { FichaTramitacao } from "./FichaTramitacao";
import { TramitacaoDialog, type ConfirmacaoTramitacao } from "./TramitacaoDialog";
import { ProcessoPicker } from "./ProcessoPicker";
import {
  SituacaoOpcao,
  TkButton,
  TkField,
  TkIconButton,
  TkPanelHeader,
  TkSection,
  TkTooltip,
  situacaoLabel,
  tkButton,
  tkInput,
  tkMenu,
  tkMenuItem,
  tkSelect,
  tkTextarea,
  useConfirmDialog,
} from "./ui";

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
  data_inclusao: string;
};

function draftDe(t: Tarefa, opcoes: { id: string; ids?: string[] }[]): Draft {
  return {
    titulo: t.titulo,
    etapa_id: t.etapa_id,
    tipo: t.tipo ?? "",
    modalidade: t.modalidade ?? "",
    todas_secretarias: t.todas_secretarias,
    secretaria_ids: idsPrincipais(t.secretaria_ids, opcoes).sort(),
    processo_id: t.processo_id,
    link_url: t.link_url ?? "",
    responsavel_id: t.responsavel_id,
    situacao: t.situacao,
    observacao: t.observacao ?? "",
    campos: { ...t.campos },
    data_inclusao: t.data_inclusao?.slice(0, 10) ?? "",
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
  secretarias: { id: string; ids?: string[]; label: string }[];
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: documentos = [] } = useDocumentos();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [avancoAberto, setAvancoAberto] = useState(false);
  const [tramAberto, setTramAberto] = useState(false);
  const baseRef = useRef<{ id: string; updatedAt: string } | null>(null);
  const originalRef = useRef<Draft | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
    const novo = draftDe(tarefa, secretarias);
    if (mudouTarefa || (mudouNoServidor && !sujo) || (!sujo && draft && !iguais(draft, novo))) {
      setDraft(novo);
      originalRef.current = novo;
      baseRef.current = { id: tarefa.id, updatedAt: tarefa.updated_at };
      setExterno(false);
    } else if (mudouNoServidor && sujo) {
      setExterno(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa, secretarias]);

  const sujo = useMemo(
    () => (draft && originalRef.current ? !iguais(draft, originalRef.current) : false),
    [draft],
  );

  const etapasVisiveis = useMemo(
    () => etapas.filter((e) => !e.arquivada || e.id === draft?.etapa_id),
    [etapas, draft?.etapa_id],
  );
  const camposAtivos = useMemo(() => campos.filter((c) => !c.arquivado), [campos]);
  const camposDaEtapa = camposAtivos.filter(
    (c) => c.etapa_id === draft?.etapa_id && !c.identificador,
  );
  const camposOutras = camposAtivos.filter(
    (c) => c.etapa_id !== draft?.etapa_id && !c.identificador,
  );
  const etapaAtual = etapas.find((e) => e.id === draft?.etapa_id);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }
  function setCampo(id: string, v: string) {
    setDraft((d) => (d ? { ...d, campos: { ...d.campos, [id]: v } } : d));
  }

  function recarregar() {
    if (!tarefa) return;
    const novo = draftDe(tarefa, secretarias);
    setDraft(novo);
    originalRef.current = novo;
    baseRef.current = { id: tarefa.id, updatedAt: tarefa.updated_at };
    setExterno(false);
  }

  async function salvar(opcoes?: { extras?: Record<string, string>; pularGate?: boolean }) {
    if (!tarefa || !draft || !baseRef.current) return;
    const camposFonte = opcoes?.extras
      ? mesclarIdentificadores(draft.campos, opcoes.extras)
      : draft.campos;
    if (!opcoes?.pularGate && draft.etapa_id !== tarefa.etapa_id) {
      const destino = etapas.find((e) => e.id === draft.etapa_id);
      const regra = destino ? regraTramitacao(destino.nome) : null;
      if (regra && tramitacaoPendente(regra, documentos.filter((d) => d.tarefa_id === tarefa.id))) {
        setTramAberto(true);
        return;
      }
      if (
        !regra &&
        identificadoresPendentes(camposAtivos, draft.etapa_id, camposFonte).length > 0
      ) {
        setAvancoAberto(true);
        return;
      }
    }
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
      const v = (camposFonte[c.id] ?? "").trim();
      if (!v) continue;
      if (c.tipo === "link" && !urlSegura(v)) {
        notify.error(`Link inválido em "${c.nome}"`, {
          description: "Use um endereço começando com http:// ou https://",
        });
        return;
      }
      valores[c.id] = v.slice(0, c.identificador ? 80 : 1000);
    }
    // Preserva valores de campos já arquivados.
    for (const [k, v] of Object.entries(camposFonte)) {
      if (!(k in valores) && !camposAtivos.some((c) => c.id === k) && v.trim()) {
        valores[k] = v;
      }
    }
    try {
      const res = await atualizar.mutateAsync({
        id: tarefa.id,
        baseUpdatedAt: baseRef.current.updatedAt,
        secretariaIds: idsPrincipais(draft.secretaria_ids, secretarias),
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
          ...(draft.data_inclusao ? { data_inclusao: draft.data_inclusao } : {}),
        },
      });
      baseRef.current = { id: tarefa.id, updatedAt: res.updated_at };
      const salvo = { ...draft, titulo, campos: valores };
      setAvancoAberto(false);
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

  async function confirmarTram(valor: ConfirmacaoTramitacao) {
    if (!tarefa || !draft) return;
    const destino = etapas.find((e) => e.id === draft.etapa_id);
    const regra = destino ? regraTramitacao(destino.nome) : null;
    if (!regra) return;
    try {
      await registrarDocumentoTramitacao(tarefa.id, regra, valor, documentos);
      await qc.invalidateQueries({ queryKey: TAREFAS_KEYS.documentos });
    } catch (e) {
      notify.error("Não foi possível registrar o documento", {
        description: e instanceof Error ? e.message : undefined,
      });
      return;
    }
    setTramAberto(false);
    await salvar({ pularGate: true });
    if (valor.importar) {
      void navigate({ to: "/importar-contratos", search: { tarefa: tarefa.id } });
    }
  }

  async function remover() {
    if (!tarefa) return;
    const ok = await confirm({
      title: "Excluir tarefa?",
      description: `"${tarefa.titulo}" deixará de aparecer no quadro e nos relatórios.`,
      confirmLabel: "Excluir tarefa",
      destructive: true,
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

  async function tentarFechar() {
    if (sujo) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "As alterações feitas nesta tarefa ainda não foram salvas.",
        confirmLabel: "Descartar",
        cancelLabel: "Continuar editando",
        destructive: true,
      });
      if (!ok) return;
    }
    onFechar();
  }

  async function copiarLink() {
    const link = urlSegura(draft?.link_url);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      notify.success("Link copiado");
    } catch {
      notify.error("Não foi possível copiar o link");
    }
  }

  const desabilitado = !podeEditar;
  const linkValido = urlSegura(draft?.link_url);

  return (
    <Sheet open={Boolean(tarefa)} onOpenChange={(o) => !o && void tentarFechar()}>
      <SheetContent
        ref={contentRef}
        hideClose
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
        className="flex w-full flex-col gap-0 overflow-hidden border-(--tk-border-strong) bg-(--tk-panel) p-0 text-(--tk-text) shadow-(--tk-shadow-panel) focus:outline-none sm:w-[min(90vw,720px)] sm:max-w-none dark:border-(--tk-border-strong) dark:bg-(--tk-panel)"
      >
        <header className="shrink-0 border-b border-(--tk-border) px-5 py-4 sm:px-6">
          <TkPanelHeader
            onClose={() => void tentarFechar()}
            closeLabel="Fechar painel"
            title={
              <SheetTitle className="line-clamp-2 break-words text-[18px] font-semibold leading-snug text-(--tk-text)">
                {tarefa?.titulo ?? "Tarefa"}
              </SheetTitle>
            }
            description={
              <SheetDescription className="text-[13px] text-(--tk-text-2)">
                {tarefa
                  ? `Criada em ${formatarDia(tarefa.data_inclusao) || formatarDia(tarefa.created_at)}`
                  : "Detalhes da tarefa"}
                {etapaAtual && ` · ${etapaAtual.nome}`}
                {desabilitado && " · Somente leitura"}
              </SheetDescription>
            }
          />
        </header>

        {draft && tarefa && (
          <div className="tk-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5 sm:px-6">
            {externo && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-(--tk-radius-control) border border-(--tk-warn)/40 bg-(--tk-warn-bg) p-3 text-[13px] text-(--tk-text)"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-(--tk-warn)" aria-hidden />
                <div className="min-w-0 flex-1 space-y-2">
                  <p>Esta tarefa foi alterada por outra pessoa enquanto você editava.</p>
                  <TkButton variant="secondary" size="sm" onClick={recarregar}>
                    Descartar minhas alterações e recarregar
                  </TkButton>
                </div>
              </div>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
              <h3 className="text-[13px] font-medium tracking-wide text-(--tk-text-3) sm:col-span-2">
                Identificação
              </h3>
              <TkField label="Título" htmlFor="t-titulo" className="sm:col-span-2">
                <input
                  id="t-titulo"
                  value={draft.titulo}
                  maxLength={300}
                  disabled={desabilitado}
                  onChange={(e) => set("titulo", e.target.value)}
                  className={tkInput}
                />
              </TkField>
              <TkField label="Data de inclusão" htmlFor="t-inclusao">
                <input
                  id="t-inclusao"
                  type="date"
                  value={draft.data_inclusao}
                  disabled={desabilitado}
                  onChange={(e) => set("data_inclusao", e.target.value)}
                  className={cn(tkInput, "[color-scheme:light] dark:[color-scheme:dark]")}
                />
              </TkField>

              <h3 className="pt-2 text-[13px] font-medium tracking-wide text-(--tk-text-3) sm:col-span-2">
                Classificação
              </h3>
              <TkField label="Modalidade" htmlFor="t-modalidade">
                <input
                  id="t-modalidade"
                  list="t-modalidades"
                  value={draft.modalidade}
                  maxLength={80}
                  placeholder="Selecione ou digite"
                  disabled={desabilitado}
                  onChange={(e) => set("modalidade", e.target.value)}
                  className={tkInput}
                />
                <datalist id="t-modalidades">
                  {modalidades.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </TkField>
              <TkField label="Tipo" htmlFor="t-tipo">
                <input
                  id="t-tipo"
                  list="t-tipos"
                  value={draft.tipo}
                  maxLength={80}
                  placeholder="Selecione ou digite"
                  disabled={desabilitado}
                  onChange={(e) => set("tipo", e.target.value)}
                  className={tkInput}
                />
                <datalist id="t-tipos">
                  {tipos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </TkField>
              <TkField
                label="Secretarias"
                htmlFor={draft.todas_secretarias ? undefined : "t-secretarias"}
                className="sm:col-span-2"
                action={
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-(--tk-text-2)">
                    <Switch
                      checked={draft.todas_secretarias}
                      disabled={desabilitado}
                      onCheckedChange={(v) => set("todas_secretarias", v)}
                    />
                    Todas as secretarias
                  </label>
                }
              >
                {draft.todas_secretarias ? (
                  <p className="flex h-11 items-center rounded-(--tk-radius-control) border border-dashed border-(--tk-border-strong) px-3 text-[14px] text-(--tk-text-2)">
                    A tarefa abrange todas as secretarias.
                  </p>
                ) : (
                  <SecretariasMultiSelect
                    id="t-secretarias"
                    options={secretarias}
                    value={draft.secretaria_ids}
                    onChange={(v) => set("secretaria_ids", v)}
                    disabled={desabilitado}
                    placeholder="Selecionar secretarias"
                    triggerClassName={cn(tkSelect, "h-auto min-h-11 py-1.5 hover:bg-(--tk-input) hover:text-(--tk-text)")}
                    contentClassName={cn(tkMenu, "p-0")}
                    itemClassName={tkMenuItem}
                  />
                )}
              </TkField>

              <h3 className="pt-2 text-[13px] font-medium tracking-wide text-(--tk-text-3) sm:col-span-2">
                Acompanhamento
              </h3>
              <TkField label="Etapa" htmlFor="t-etapa">
                <Select
                  value={draft.etapa_id}
                  onValueChange={(v) => set("etapa_id", v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger id="t-etapa" className={tkSelect}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={tkMenu}>
                    {etapasVisiveis.map((e) => (
                      <SelectItem key={e.id} value={e.id} className={tkMenuItem}>
                        {e.nome}
                        {e.arquivada ? " (arquivada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TkField>

              <TkField label="Situação" htmlFor="t-situacao">
                <Select
                  value={draft.situacao}
                  onValueChange={(v) => set("situacao", v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger id="t-situacao" className={tkSelect}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={tkMenu}>
                    {SITUACOES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className={tkMenuItem}>
                        <SituacaoOpcao situacao={s.value} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TkField>

              <TkField label="Responsável" htmlFor="t-responsavel" className="sm:col-span-2">
                <Select
                  value={draft.responsavel_id ?? "__nenhum__"}
                  onValueChange={(v) => set("responsavel_id", v === "__nenhum__" ? null : v)}
                  disabled={desabilitado}
                >
                  <SelectTrigger id="t-responsavel" className={tkSelect}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn(tkMenu, "max-h-80")}>
                    <SelectItem value="__nenhum__" className={tkMenuItem}>
                      Sem responsável
                    </SelectItem>
                    {equipe.map((m) => (
                      <SelectItem key={m.id} value={m.id} className={tkMenuItem}>
                        {m.nome}
                        {m.cargo ? ` — ${m.cargo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TkField>

              <h3 className="pt-2 text-[13px] font-medium tracking-wide text-(--tk-text-3) sm:col-span-2">
                Observações / andamento
              </h3>
              <TkField label="Lembrete do andamento" htmlFor="t-obs" className="sm:col-span-2">
                <textarea
                  id="t-obs"
                  rows={4}
                  maxLength={10000}
                  value={draft.observacao}
                  disabled={desabilitado}
                  placeholder="Ex.: falta um fornecedor responder à pesquisa."
                  onChange={(e) => set("observacao", e.target.value)}
                  className={cn(
                    tkTextarea,
                    "resize-y border-(--tk-warn)/30 bg-(--tk-warn-bg) shadow-none",
                  )}
                />
              </TkField>
            </div>

            <FichaTramitacao
              tarefaId={tarefa.id}
              podeEditar={podeEditar}
              etapaNome={etapaAtual?.nome ?? ""}
              etapas={etapas}
              etapaAtualId={draft.etapa_id}
              criadaEm={tarefa.created_at}
              onImportarContratos={() =>
                void navigate({ to: "/importar-contratos", search: { tarefa: tarefa.id } })
              }
              vinculos={
                <TkSection title="Vínculos" description="Processo administrativo e acesso ao M2A.">
                  <div className="grid gap-4">
                    <TkField label="Processo administrativo" htmlFor="t-processo">
                      <ProcessoPicker
                        id="t-processo"
                        value={draft.processo_id}
                        onChange={(v) => set("processo_id", v)}
                        disabled={desabilitado}
                      />
                    </TkField>
                    <TkField label="Link M2A" htmlFor="t-link">
                      <div className="relative min-w-0">
                        <input
                          id="t-link"
                          type="url"
                          inputMode="url"
                          placeholder="https://..."
                          value={draft.link_url}
                          maxLength={2000}
                          disabled={desabilitado}
                          onChange={(e) => set("link_url", e.target.value)}
                          className={cn(tkInput, "pr-[5.25rem]")}
                        />
                        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
                          {linkValido ? (
                            <TkTooltip label="Abrir link (nova aba)">
                              <a
                                href={linkValido}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Abrir link M2A em nova aba"
                                className={tkButton({ variant: "tertiary", size: "iconSm" })}
                              >
                                <ExternalLink />
                              </a>
                            </TkTooltip>
                          ) : (
                            <TkIconButton label="Abrir link (informe um endereço válido)" size="iconSm" disabled>
                              <ExternalLink />
                            </TkIconButton>
                          )}
                          <TkIconButton
                            label="Copiar link"
                            size="iconSm"
                            disabled={!linkValido}
                            onClick={() => void copiarLink()}
                          >
                            <Copy />
                          </TkIconButton>
                        </div>
                      </div>
                    </TkField>
                  </div>
                </TkSection>
              }
            />

            {camposDaEtapa.length > 0 && (
              <TkSection
                title="Campos da etapa"
                description={etapaAtual ? `Informações específicas de ${etapaAtual.nome}.` : undefined}
                className="mt-8 border-t border-(--tk-border) pt-6"
              >
                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                  {camposDaEtapa.map((c) => (
                    <CampoInput
                      key={c.id}
                      campo={c}
                      valor={draft.campos[c.id] ?? ""}
                      onChange={(v) => setCampo(c.id, v)}
                      disabled={desabilitado}
                    />
                  ))}
                </div>
              </TkSection>
            )}

            {camposOutras.length > 0 && (
              <details className="group mt-6 rounded-(--tk-radius-control) border border-(--tk-border)">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[14px] font-medium text-(--tk-text) [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 text-(--tk-text-3) transition-transform group-open:rotate-90" aria-hidden />
                  Campos de outras etapas
                  <span className="text-[12px] font-normal text-(--tk-text-3)">({camposOutras.length})</span>
                </summary>
                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 border-t border-(--tk-border) p-4 sm:grid-cols-2">
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

            <AnexosSection tarefaId={tarefa.id} podeEditar={podeEditar} />
            <HistoricoSection tarefaId={tarefa.id} etapas={etapas} equipe={equipe} />
          </div>
        )}

        {tarefa && (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-(--tk-border) bg-(--tk-panel) px-5 py-3.5 sm:px-6">
            {podeEditar && (
              <TkButton variant="danger" onClick={() => void remover()} disabled={excluir.isPending}>
                {excluir.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Excluir
              </TkButton>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {sujo && (
                <span className="hidden truncate text-[12.5px] text-(--tk-text-2) sm:inline" aria-live="polite">
                  Alterações não salvas
                </span>
              )}
              <TkButton variant="secondary" onClick={() => void tentarFechar()}>
                {podeEditar ? "Cancelar" : "Fechar"}
              </TkButton>
              {podeEditar && (
                <TkButton
                  variant="primary"
                  onClick={() => void salvar()}
                  disabled={!sujo || atualizar.isPending}
                >
                  {atualizar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvar
                </TkButton>
              )}
            </div>
          </footer>
        )}
        {confirmDialog}
        {draft && (
          <AvancoEtapaDialog
            aberto={avancoAberto}
            etapaNome={etapas.find((e) => e.id === draft.etapa_id)?.nome ?? "etapa"}
            campos={identificadoresDaEtapa(camposAtivos, draft.etapa_id)}
            valores={draft.campos}
            confirmando={atualizar.isPending}
            onCancelar={() => {
              setAvancoAberto(false);
              if (tarefa) set("etapa_id", tarefa.etapa_id);
            }}
            onConfirmar={(valores) => void salvar({ extras: valores, pularGate: true })}
          />
        )}
        {draft && tarefa && (
          <TramitacaoDialog
            aberto={tramAberto}
            regra={regraTramitacao(etapas.find((e) => e.id === draft.etapa_id)?.nome ?? "")}
            etapaNome={etapas.find((e) => e.id === draft.etapa_id)?.nome ?? "etapa"}
            numero={documentoDestino(documentos, tarefa.id, draft.etapa_id, etapas)?.numero ?? ""}
            data={documentoDestino(documentos, tarefa.id, draft.etapa_id, etapas)?.data ?? ""}
            horario={documentoDestino(documentos, tarefa.id, draft.etapa_id, etapas)?.horario ?? ""}
            confirmando={atualizar.isPending}
            onCancelar={() => {
              setTramAberto(false);
              set("etapa_id", tarefa.etapa_id);
            }}
            onConfirmar={(valor) => void confirmarTram(valor)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function documentoDestino(
  docs: { tarefa_id: string; chave: string | null; numero: string | null; data: string | null; horario: string | null }[],
  tarefaId: string,
  etapaId: string,
  etapas: Etapa[],
) {
  const regra = regraTramitacao(etapas.find((e) => e.id === etapaId)?.nome ?? "");
  const chave = regra === "publicacao" ? "certame" : regra === "pesquisa" || regra === "etp" ? regra : null;
  if (!chave) return null;
  return docs.find((d) => d.tarefa_id === tarefaId && d.chave === chave) ?? null;
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
    <TkField
      label={rotulo}
      htmlFor={id}
      hint={
        campo.identificador
          ? campo.obrigatorio
            ? "Obrigatório para avançar a esta etapa."
            : "Opcional."
          : undefined
      }
    >
      {campo.tipo === "lista" ? (
        <Select
          value={valor || "__vazio__"}
          onValueChange={(v) => onChange(v === "__vazio__" ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className={tkSelect}>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent className={cn(tkMenu, "max-h-80")}>
            <SelectItem value="__vazio__" className={tkMenuItem}>
              Não informado
            </SelectItem>
            {campo.opcoes.map((o) => (
              <SelectItem key={o} value={o} className={tkMenuItem}>
                {o}
              </SelectItem>
            ))}
            {valor && !campo.opcoes.includes(valor) && (
              <SelectItem value={valor} className={tkMenuItem}>
                {valor}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      ) : (
        <input
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
          placeholder={campo.tipo === "link" ? "https://..." : undefined}
          maxLength={campo.identificador ? 80 : 1000}
          value={valor}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(tkInput, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      )}
    </TkField>
  );
}

function AnexosSection({ tarefaId, podeEditar }: { tarefaId: string; podeEditar: boolean }) {
  const { data: anexos = [], isLoading } = useAnexos(tarefaId);
  const enviar = useEnviarAnexo(tarefaId);
  const remover = useRemoverAnexo(tarefaId);
  const { confirm, dialog } = useConfirmDialog();
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

  async function removerAnexo(a: (typeof anexos)[number]) {
    const ok = await confirm({
      title: "Remover anexo?",
      description: `O arquivo "${a.original_name}" será removido desta tarefa.`,
      confirmLabel: "Remover anexo",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remover.mutateAsync(a);
    } catch (e) {
      notify.error("Não foi possível remover", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <TkSection
      title="Anexos"
      description={`Até ${MAX_ANEXO_BYTES / 1024 / 1024} MB por arquivo.`}
      className="mt-8 border-t border-(--tk-border) pt-6"
      action={
        podeEditar ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void aoEscolher(e.target.files)}
            />
            <TkButton
              variant="secondary"
              size="sm"
              disabled={enviar.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {enviar.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Anexar arquivo
            </TkButton>
          </>
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="flex items-center gap-2 text-[13px] text-(--tk-text-2)">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando anexos...
        </p>
      ) : anexos.length === 0 ? (
        <p className="rounded-(--tk-radius-control) border border-dashed border-(--tk-border-strong) px-4 py-4 text-center text-[13px] text-(--tk-text-2)">
          Nenhum arquivo anexado.
        </p>
      ) : (
        <ul className="divide-y divide-(--tk-border) overflow-hidden rounded-(--tk-radius-control) border border-(--tk-border)">
          {anexos.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
              <FileIcon className="size-4 shrink-0 text-(--tk-text-3)" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[14px]" title={a.original_name}>
                {a.original_name}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-(--tk-text-3)">
                {formatarTamanho(a.size_bytes)}
              </span>
              <TkIconButton
                label={`Baixar ${a.original_name}`}
                size="iconSm"
                onClick={() =>
                  void abrirAnexo(a).catch((e: unknown) =>
                    notify.error("Não foi possível abrir o arquivo", {
                      description: e instanceof Error ? e.message : undefined,
                    }),
                  )
                }
              >
                <Download />
              </TkIconButton>
              {podeEditar && (
                <TkIconButton
                  label={`Remover ${a.original_name}`}
                  size="iconSm"
                  variant="danger"
                  disabled={remover.isPending}
                  onClick={() => void removerAnexo(a)}
                >
                  <X />
                </TkIconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </TkSection>
  );
}

function textoDocumentos(detalhes: EventoRow["detalhes"]): string {
  if (!detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return "";
  const lista = (detalhes as { documentos?: unknown }).documentos;
  if (!Array.isArray(lista)) return "";
  return lista
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const o = item as { titulo?: unknown; numero?: unknown; data?: unknown };
      const rotulo = String(o.titulo || "").trim();
      const numero = String(o.numero || "").trim();
      const data = formatarDia(typeof o.data === "string" ? o.data : "");
      const texto = [numero, data].filter(Boolean).join(" ");
      return rotulo && texto ? `${rotulo} ${texto}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function textoIdentificadores(detalhes: EventoRow["detalhes"]): string {
  if (!detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return "";
  const lista = (detalhes as { identificadores?: unknown }).identificadores;
  if (!Array.isArray(lista)) return "";
  return lista
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const o = item as { sigla?: unknown; nome?: unknown; valor?: unknown };
      const rotulo = String(o.sigla || o.nome || "").trim();
      const valor = String(o.valor || "").trim();
      return rotulo && valor ? `${rotulo} ${valor}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function descreverEvento(ev: EventoRow, etapas: Etapa[], equipe: MembroEquipe[]): string {
  const d = (ev.detalhes ?? {}) as Record<string, unknown>;
  const etapa = (id: unknown) => etapas.find((e) => e.id === id)?.nome ?? "etapa removida";
  const pessoa = (id: unknown) =>
    id ? (equipe.find((m) => m.id === id)?.nome ?? "alguém") : "ninguém";
  switch (ev.tipo) {
    case "criada":
      return `Tarefa criada em ${etapa(d.etapa_id)}`;
    case "movida":
      return `Movida de ${etapa(d.de)} para ${etapa(d.para)}`;
    case "situacao": {
      const rot = (v: unknown) =>
        SITUACOES.some((s) => s.value === v) ? situacaoLabel(v as Situacao) : String(v);
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
    <details className="group mt-6 rounded-(--tk-radius-control) border border-(--tk-border)">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[14px] font-medium text-(--tk-text) [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-(--tk-text-3) transition-transform group-open:rotate-90" aria-hidden />
        Histórico
        <span className="text-[12px] font-normal text-(--tk-text-3)">({eventos.length})</span>
      </summary>
      <ol className="space-y-2.5 border-t border-(--tk-border) px-4 py-3 text-[13px]">
        {eventos.map((ev) => {
          const numeros = [textoDocumentos(ev.detalhes), textoIdentificadores(ev.detalhes)]
            .filter(Boolean)
            .join(" · ");
          return (
          <li key={ev.id} className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
            <time
              dateTime={ev.created_at}
              className="shrink-0 tabular-nums font-normal text-(--tk-text-3) sm:w-32"
            >
              {new Date(ev.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
            <span className="min-w-0 break-words font-normal text-(--tk-text)">
              {descreverEvento(ev, etapas, equipe)}
              {ev.user_id && (
                <span className="text-(--tk-text-2)">
                  {" "}
                  — {equipe.find((m) => m.id === ev.user_id)?.nome ?? "usuário"}
                </span>
              )}
            </span>
            </div>
            {numeros && (
              <p className="break-words text-[12.5px] font-normal text-(--tk-text-2) sm:pl-36">
                {numeros}
              </p>
            )}
          </li>
          );
        })}
      </ol>
    </details>
  );
}
