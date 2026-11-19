import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  useContratosTarefa,
  useDocumentos,
  useEventos,
  useExcluirDocumento,
  useFases,
  useSalvarDocumento,
  useSalvarFase,
} from "../hooks";
import {
  DOCUMENTOS_FIXOS,
  FASES_JULGAMENTO,
  FASE_SITUACOES,
  formatarDia,
  regraTramitacao,
  type DocumentoChave,
  type Etapa,
  type FaseSituacao,
} from "../lib";
import { TkButton, TkField, TkSection, tkInput, tkSelect, tkTextarea } from "./ui";

type Props = {
  tarefaId: string;
  podeEditar: boolean;
  etapaNome: string;
  etapas: Etapa[];
  etapaAtualId: string;
  inclusaoEm?: string | null;
  onImportarContratos: () => void;
  vinculos?: ReactNode;
};

export function FichaTramitacao({
  tarefaId,
  podeEditar,
  etapaNome,
  etapas,
  etapaAtualId,
  inclusaoEm,
  onImportarContratos,
  vinculos,
}: Props) {
  const { data: documentos = [] } = useDocumentos();
  const docs = documentos.filter((d) => d.tarefa_id === tarefaId);
  const fases = useFases(tarefaId);
  const contratos = useContratosTarefa(tarefaId);
  const eventos = useEventos(tarefaId);
  const salvar = useSalvarDocumento();
  const excluir = useExcluirDocumento();
  const salvarFase = useSalvarFase(tarefaId);
  const [extra, setExtra] = useState(false);
  const [novo, setNovo] = useState({ titulo: "", numero: "", data: "", observacao: "", link_url: "" });

  const regra = regraTramitacao(etapaNome);
  const mostraFases = regra === "julgamento" || regra === "contratacao";
  const porChave = new Map(docs.filter((d) => d.chave).map((d) => [d.chave, d]));
  const extras = docs.filter((d) => !d.chave);

  async function gravarFixo(
    chave: DocumentoChave,
    titulo: string,
    patch: { numero?: string; data?: string; horario?: string },
  ) {
    const atual = porChave.get(chave);
    try {
      await salvar.mutateAsync({
        id: atual?.id,
        tarefaId,
        chave,
        titulo,
        numero: patch.numero ?? atual?.numero,
        data: patch.data ?? atual?.data,
        horario: patch.horario ?? atual?.horario,
        posicao: DOCUMENTOS_FIXOS.findIndex((d) => d.chave === chave),
      });
    } catch (e) {
      notify.error("Não foi possível salvar o documento", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function gravarExtra() {
    if (!novo.titulo.trim()) return;
    try {
      await salvar.mutateAsync({
        tarefaId,
        titulo: novo.titulo,
        numero: novo.numero,
        data: novo.data,
        observacao: novo.observacao,
        link_url: novo.link_url,
        posicao: 10 + extras.length,
      });
      setNovo({ titulo: "", numero: "", data: "", observacao: "", link_url: "" });
      setExtra(false);
    } catch (e) {
      notify.error("Não foi possível adicionar o dado", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  const marcos = linhaDoTempo(etapas, eventos.data ?? [], etapaAtualId, inclusaoEm ?? "");

  return (
    <div className="flex flex-col gap-3">
      <TkSection caixa title="Dados da contratação" description="Números e datas gerados ao longo da tramitação.">
        <div className="grid gap-2 sm:grid-cols-2">
          {DOCUMENTOS_FIXOS.map((def) => {
            const doc = porChave.get(def.chave);
            return (
              <div
                key={def.chave}
                className="space-y-2 rounded-(--tk-radius-control) border border-(--tk-border) bg-(--tk-panel) p-2.5"
              >
                <p className="text-[14px] font-medium text-(--tk-text)">{def.titulo}</p>
                <TkField label="Número" htmlFor={`doc-${def.chave}-n`}>
                  <input
                    id={`doc-${def.chave}-n`}
                    defaultValue={doc?.numero ?? ""}
                    maxLength={80}
                    disabled={!podeEditar}
                    key={`${doc?.id ?? def.chave}-${doc?.numero ?? ""}`}
                    onBlur={(e) => {
                      if ((doc?.numero ?? "") === e.target.value.trim()) return;
                      void gravarFixo(def.chave, def.titulo, { numero: e.target.value });
                    }}
                    className={cn(tkInput, "h-10")}
                  />
                </TkField>
                <TkField label="Data" htmlFor={`doc-${def.chave}-d`}>
                  <input
                    id={`doc-${def.chave}-d`}
                    type="date"
                    defaultValue={doc?.data?.slice(0, 10) ?? ""}
                    disabled={!podeEditar}
                    key={`${doc?.id ?? def.chave}-d-${doc?.data ?? ""}`}
                    onBlur={(e) => {
                      if ((doc?.data ?? "") === e.target.value) return;
                      void gravarFixo(def.chave, def.titulo, { data: e.target.value });
                    }}
                    className={cn(tkInput, "h-10 [color-scheme:light] dark:[color-scheme:dark]")}
                  />
                </TkField>
                {def.horario && (
                  <TkField label="Horário" htmlFor={`doc-${def.chave}-h`}>
                    <input
                      id={`doc-${def.chave}-h`}
                      type="time"
                      defaultValue={doc?.horario?.slice(0, 5) ?? ""}
                      disabled={!podeEditar}
                      key={`${doc?.id ?? def.chave}-h-${doc?.horario ?? ""}`}
                      onBlur={(e) => {
                        const atual = doc?.horario?.slice(0, 5) ?? "";
                        if (atual === e.target.value) return;
                        void gravarFixo(def.chave, def.titulo, { horario: e.target.value });
                      }}
                      className={cn(tkInput, "h-10 [color-scheme:light] dark:[color-scheme:dark]")}
                    />
                  </TkField>
                )}
              </div>
            );
          })}
        </div>
        {extras.length > 0 && (
          <ul className="mt-4 space-y-2">
            {extras.map((d) => (
              <li
                key={d.id}
                className="flex min-w-0 items-start justify-between gap-3 rounded-(--tk-radius-control) border border-(--tk-border) px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-(--tk-text)">{d.titulo}</p>
                  <p className="text-[13px] text-(--tk-text-2)">
                    {[d.numero, formatarDia(d.data), d.observacao].filter(Boolean).join(" · ") || "Sem número"}
                  </p>
                  {d.link_url && (
                    <a href={d.link_url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-(--tk-accent)">
                      Abrir link
                    </a>
                  )}
                </div>
                {podeEditar && (
                  <TkButton
                    variant="danger"
                    size="sm"
                    onClick={() => void excluir.mutateAsync(d.id).catch(() => notify.error("Não foi possível remover"))}
                  >
                    <Trash2 /> Remover
                  </TkButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && !extra && (
          <TkButton variant="tertiary" className="mt-3" onClick={() => setExtra(true)}>
            <Plus /> Adicionar outro dado
          </TkButton>
        )}
        {extra && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TkField label="Identificação" htmlFor="extra-titulo">
              <input id="extra-titulo" value={novo.titulo} maxLength={80} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} className={cn(tkInput, "h-10")} />
            </TkField>
            <TkField label="Número" htmlFor="extra-numero">
              <input id="extra-numero" value={novo.numero} maxLength={80} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} className={cn(tkInput, "h-10")} />
            </TkField>
            <TkField label="Data" htmlFor="extra-data">
              <input id="extra-data" type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} className={cn(tkInput, "h-10 [color-scheme:light] dark:[color-scheme:dark]")} />
            </TkField>
            <TkField label="Link" htmlFor="extra-link">
              <input id="extra-link" type="url" value={novo.link_url} placeholder="https://..." onChange={(e) => setNovo({ ...novo, link_url: e.target.value })} className={cn(tkInput, "h-10")} />
            </TkField>
            <TkField label="Observação" htmlFor="extra-obs" className="sm:col-span-2">
              <textarea id="extra-obs" rows={2} value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} className={tkTextarea} />
            </TkField>
            <div className="flex gap-2 sm:col-span-2">
              <TkButton variant="secondary" onClick={() => setExtra(false)}>Cancelar</TkButton>
              <TkButton variant="primary" disabled={!novo.titulo.trim() || salvar.isPending} onClick={() => void gravarExtra()}>
                Salvar dado
              </TkButton>
            </div>
          </div>
        )}
      </TkSection>

      {vinculos}

      <TkSection caixa title="Contratos" description="Contratos importados e vinculados a esta demanda.">
        {contratos.data?.length ? (
          <ul className="space-y-2">
            {contratos.data.map((c) => (
              <li key={c.id}>
                <Link to="/contratos/$id" params={{ id: c.id }} className="block min-w-0 rounded-(--tk-radius-control) border border-(--tk-border) px-3 py-2 hover:bg-(--tk-card-hover)">
                  <span className="block text-[14px] font-medium text-(--tk-text)">{c.numero_contrato}</span>
                  <span className="block truncate text-[13px] text-(--tk-text-2)">{c.objeto}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-(--tk-text-2)">Nenhum contrato vinculado.</p>
        )}
        {podeEditar && (
          <TkButton variant="secondary" className="mt-3" onClick={onImportarContratos}>
            <Plus /> Adicionar contratos
          </TkButton>
        )}
      </TkSection>

      {mostraFases && (
        <TkSection caixa title="Fases do julgamento" description="Situação de cada fase, sem criar novas colunas no quadro.">
          <ul className="space-y-3">
            {FASES_JULGAMENTO.map((fase, i) => {
              const atual = fases.data?.find((f) => f.chave === fase.chave);
              const situacao = (atual?.situacao ?? "pendente") as FaseSituacao;
              return (
                <li key={fase.chave} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_9rem]">
                  <p className="pb-2 text-[14px] text-(--tk-text)">{fase.nome}</p>
                  <select
                    aria-label={`Situação de ${fase.nome}`}
                    value={situacao}
                    disabled={!podeEditar}
                    onChange={(e) =>
                      void salvarFase.mutateAsync({
                        chave: fase.chave,
                        situacao: e.target.value,
                        data: atual?.data,
                        observacao: atual?.observacao,
                        posicao: i,
                      })
                    }
                    className={cn(tkSelect, "h-10")}
                  >
                    {FASE_SITUACOES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    aria-label={`Data de ${fase.nome}`}
                    defaultValue={atual?.data?.slice(0, 10) ?? ""}
                    key={`${fase.chave}-${atual?.data ?? ""}`}
                    disabled={!podeEditar}
                    onBlur={(e) => {
                      if ((atual?.data ?? "") === e.target.value) return;
                      void salvarFase.mutateAsync({
                        chave: fase.chave,
                        situacao,
                        data: e.target.value,
                        observacao: atual?.observacao,
                        posicao: i,
                      });
                    }}
                    className={cn(tkInput, "h-10 [color-scheme:light] dark:[color-scheme:dark]")}
                  />
                </li>
              );
            })}
          </ul>
        </TkSection>
      )}

      <TkSection caixa title="Linha do tempo" description="Entrada em cada etapa da tramitação.">
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {marcos.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-(--tk-radius-control) border px-3 py-2",
                m.atual ? "border-(--tk-accent) bg-(--tk-accent-soft)" : "border-(--tk-border)",
              )}
            >
              <p className="truncate text-[13px] font-medium text-(--tk-text)">{m.nome}</p>
              <p className="text-[12px] text-(--tk-text-2)">
                {m.entrada ? `Desde ${formatarInstante(m.entrada)}` : "Ainda não alcançada"}
              </p>
              {m.saida && <p className="text-[12px] text-(--tk-text-3)">Até {formatarInstante(m.saida)}</p>}
            </li>
          ))}
        </ol>
      </TkSection>
    </div>
  );
}

function formatarInstante(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatarDia(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatarDia(iso);
  return d.toLocaleDateString("pt-BR");
}

function linhaDoTempo(
  etapas: Etapa[],
  eventos: { tipo: string; created_at: string; detalhes: unknown }[],
  etapaAtualId: string,
  inclusaoEm: string,
) {
  const ordem = [...etapas].filter((e) => !e.arquivada).sort((a, b) => a.posicao - b.posicao);
  const entrada = new Map<string, string>();
  const saida = new Map<string, string>();
  const cron = [...eventos].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const ev of cron) {
    const d = (ev.detalhes ?? {}) as { etapa_id?: string; de?: string; para?: string };
    if (ev.tipo === "criada" && d.etapa_id && inclusaoEm) entrada.set(d.etapa_id, inclusaoEm);
    if (ev.tipo === "movida" && d.para) {
      if (d.de) saida.set(d.de, ev.created_at);
      if (!entrada.has(d.para)) entrada.set(d.para, ev.created_at);
    }
  }
  if (inclusaoEm && ordem[0] && !entrada.has(ordem[0].id)) entrada.set(ordem[0].id, inclusaoEm);
  if (inclusaoEm && !entrada.has(etapaAtualId)) entrada.set(etapaAtualId, inclusaoEm);
  return ordem.map((e) => ({
    id: e.id,
    nome: e.nome,
    entrada: entrada.get(e.id) ?? null,
    saida: e.id === etapaAtualId ? null : (saida.get(e.id) ?? null),
    atual: e.id === etapaAtualId,
  }));
}
