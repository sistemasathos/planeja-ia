import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileCheck, FileText, Gavel, Plus, Search, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  useContratosTarefa,
  useDocumentos,
  useExcluirDocumento,
  useSalvarDocumento,
} from "../hooks";
import {
  DOCUMENTOS_FIXOS,
  formatarDia,
  regraTramitacao,
  type DocumentoChave,
} from "../lib";
import { TkButton, TkField, TkSection, tkButton, tkInput, tkTextarea } from "./ui";

type Props = {
  tarefaId: string;
  podeEditar: boolean;
  etapaNome: string;
  corEtapa?: string;
  onImportarContratos: () => void;
  vinculos?: ReactNode;
};

const DOC_ICONE: Record<DocumentoChave, { Icone: typeof FileText; classe: string }> = {
  dfd: { Icone: FileText, classe: "text-(--tk-info)" },
  pesquisa: { Icone: Search, classe: "text-(--tk-accent)" },
  etp: { Icone: FileCheck, classe: "text-violet-500" },
  certame: { Icone: Gavel, classe: "text-(--tk-warn)" },
};

export function FichaTramitacao({
  tarefaId,
  podeEditar,
  etapaNome,
  corEtapa,
  onImportarContratos,
  vinculos,
}: Props) {
  const { data: documentos = [] } = useDocumentos();
  const docs = documentos.filter((d) => d.tarefa_id === tarefaId);
  const contratos = useContratosTarefa(tarefaId);
  const salvar = useSalvarDocumento();
  const excluir = useExcluirDocumento();
  const [extra, setExtra] = useState(false);
  const [novo, setNovo] = useState({ titulo: "", numero: "", data: "", observacao: "", link_url: "" });

  const regra = regraTramitacao(etapaNome);
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

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <TkSection caixa faixa={corEtapa}>
        <ul className="space-y-2">
          {DOCUMENTOS_FIXOS.map((def) => {
            const doc = porChave.get(def.chave);
            const visual = DOC_ICONE[def.chave];
            const Icone = visual.Icone;
            return (
              <li key={def.chave} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <span className="flex w-32 shrink-0 items-center gap-2 text-[14px] font-medium text-(--tk-text)">
                  <Icone className={cn("size-4 shrink-0", visual.classe)} aria-hidden />
                  {def.titulo}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input
                    id={`doc-${def.chave}-n`}
                    aria-label={`Número do ${def.titulo}`}
                    placeholder="Número"
                    defaultValue={doc?.numero ?? ""}
                    maxLength={80}
                    disabled={!podeEditar}
                    key={`${doc?.id ?? def.chave}-${doc?.numero ?? ""}`}
                    onBlur={(e) => {
                      if ((doc?.numero ?? "") === e.target.value.trim()) return;
                      void gravarFixo(def.chave, def.titulo, { numero: e.target.value });
                    }}
                    className={cn(tkInput, "h-10 min-w-0 flex-1 basis-40")}
                  />
                  <input
                    id={`doc-${def.chave}-d`}
                    type="date"
                    aria-label={`Data do ${def.titulo}`}
                    defaultValue={doc?.data?.slice(0, 10) ?? ""}
                    disabled={!podeEditar}
                    key={`${doc?.id ?? def.chave}-d-${doc?.data ?? ""}`}
                    onBlur={(e) => {
                      if ((doc?.data ?? "") === e.target.value) return;
                      void gravarFixo(def.chave, def.titulo, { data: e.target.value });
                    }}
                    className={cn(tkInput, "h-10 w-full [color-scheme:light] sm:w-[9.5rem] dark:[color-scheme:dark]")}
                  />
                  {def.horario && (
                    <input
                      id={`doc-${def.chave}-h`}
                      type="time"
                      aria-label="Horário do certame"
                      defaultValue={doc?.horario?.slice(0, 5) ?? ""}
                      disabled={!podeEditar}
                      key={`${doc?.id ?? def.chave}-h-${doc?.horario ?? ""}`}
                      onBlur={(e) => {
                        const atual = doc?.horario?.slice(0, 5) ?? "";
                        if (atual === e.target.value) return;
                        void gravarFixo(def.chave, def.titulo, { horario: e.target.value });
                      }}
                      className={cn(tkInput, "h-10 w-full [color-scheme:light] sm:w-[6.5rem] dark:[color-scheme:dark]")}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </TkSection>

      {vinculos}

      {(extras.length > 0 || podeEditar) && (
      <TkSection caixa faixa={corEtapa}>
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
      )}

      {regra === "contratacao" && (
        <div className="shrink-0">
          {contratos.data && contratos.data.length > 0 ? (
            <Link to="/contratos" className={tkButton({ variant: "secondary" })}>
              Acessar contratos
            </Link>
          ) : (
            podeEditar && (
              <TkButton variant="secondary" onClick={onImportarContratos}>
                <Plus /> Adicionar contratos
              </TkButton>
            )
          )}
        </div>
      )}
    </div>
  );
}
