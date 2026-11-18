import { useEffect, useState } from "react";
import { Archive, ArrowLeft, ListChecks, Pencil, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useArquivarCampo, useSalvarCampo } from "../hooks";
import { CAMPO_TIPOS, type Campo, type CampoTipo, type Etapa } from "../lib";
import {
  TkBadge,
  TkButton,
  TkField,
  TkIconButton,
  TkPanelHeader,
  tkDialog,
  tkDialogDescription,
  tkDialogTitle,
  tkInput,
  tkMenu,
  tkMenuItem,
  tkSelect,
  tkTextarea,
  useConfirmDialog,
} from "./ui";

type Props = {
  etapa: Etapa | null;
  campos: Campo[];
  onFechar: () => void;
};

type Rascunho = {
  id?: string;
  nome: string;
  tipo: CampoTipo;
  opcoesTexto: string;
  usa_como_fase: boolean;
  identificador: boolean;
  sigla: string;
  obrigatorio: boolean;
};

const NOVO: Rascunho = {
  nome: "",
  tipo: "texto",
  opcoesTexto: "",
  usa_como_fase: false,
  identificador: false,
  sigla: "",
  obrigatorio: false,
};

function parseOpcoes(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const linha of texto.split("\n")) {
    const v = linha.trim().slice(0, 80);
    if (v && !vistos.has(v.toLowerCase())) {
      vistos.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, 50);
}

export function CamposDialog({ etapa, campos, onFechar }: Props) {
  const salvar = useSalvarCampo();
  const arquivar = useArquivarCampo();
  const { confirm, dialog } = useConfirmDialog();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  useEffect(() => {
    setRascunho(null);
  }, [etapa?.id]);

  const doEtapa = etapa ? campos.filter((c) => c.etapa_id === etapa.id && !c.arquivado) : [];

  async function confirmar() {
    if (!etapa || !rascunho) return;
    const nome = rascunho.nome.trim();
    if (!nome) return;
    const opcoes = parseOpcoes(rascunho.opcoesTexto);
    if (rascunho.tipo === "lista" && opcoes.length === 0) {
      notify.error("Informe ao menos uma opção para a lista");
      return;
    }
    try {
      await salvar.mutateAsync({
        id: rascunho.id,
        etapa_id: etapa.id,
        nome,
        tipo: rascunho.tipo,
        opcoes,
        usa_como_fase: rascunho.usa_como_fase,
        identificador: rascunho.identificador,
        sigla: rascunho.sigla,
        obrigatorio: rascunho.obrigatorio,
        posicao: doEtapa.length,
      });
      setRascunho(null);
    } catch (e) {
      notify.error("Não foi possível salvar o campo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function remover(c: Campo) {
    const ok = await confirm({
      title: "Arquivar campo?",
      description: `O campo "${c.nome}" deixa de aparecer no formulário. Os valores já preenchidos são mantidos.`,
      confirmLabel: "Arquivar campo",
    });
    if (!ok) return;
    try {
      await arquivar.mutateAsync({ id: c.id, arquivado: true });
    } catch (e) {
      notify.error("Não foi possível arquivar o campo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <Dialog open={Boolean(etapa)} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent hideClose className={cn(tkDialog, "max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg")}>
        <TkPanelHeader
          onClose={onFechar}
          title={
            <DialogTitle className={tkDialogTitle}>
              {rascunho ? (rascunho.id ? "Editar campo" : "Novo campo") : `Campos da etapa ${etapa?.nome ?? ""}`}
            </DialogTitle>
          }
          description={
            <DialogDescription className={tkDialogDescription}>
              Informações próprias desta etapa, como número da cotação, data do certame ou fase do julgamento.
            </DialogDescription>
          }
        />

        {rascunho ? (
          <form
            className="tk-scroll -mx-1 min-h-0 space-y-5 overflow-y-auto px-1"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            <TkField label="Nome do campo" htmlFor="campo-nome">
              <input
                id="campo-nome"
                autoFocus
                maxLength={60}
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                className={tkInput}
              />
            </TkField>
            <TkField label="Tipo de informação" htmlFor="campo-tipo">
              <Select
                value={rascunho.tipo}
                onValueChange={(v) => {
                  const tipo = v as CampoTipo;
                  const identificavel = tipo === "texto" || tipo === "numero";
                  setRascunho({
                    ...rascunho,
                    tipo,
                    identificador: identificavel ? rascunho.identificador : false,
                    obrigatorio: identificavel ? rascunho.obrigatorio : false,
                  });
                }}
              >
                <SelectTrigger id="campo-tipo" className={tkSelect}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={tkMenu}>
                  {CAMPO_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className={tkMenuItem}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TkField>
            {rascunho.tipo === "lista" && (
              <>
                <TkField label="Opções" htmlFor="campo-opcoes" hint="Uma opção por linha (até 50).">
                  <textarea
                    id="campo-opcoes"
                    rows={5}
                    value={rascunho.opcoesTexto}
                    onChange={(e) => setRascunho({ ...rascunho, opcoesTexto: e.target.value })}
                    className={tkTextarea}
                  />
                </TkField>
                <label className="flex cursor-pointer items-start gap-3 rounded-(--tk-radius-control) border border-(--tk-border) bg-(--tk-panel-muted) p-3.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={rascunho.usa_como_fase}
                    onCheckedChange={(v) => setRascunho({ ...rascunho, usa_como_fase: v === true })}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-[14px] font-medium text-(--tk-text)">Usar como fase</span>
                    <span className="block text-[12.5px] text-(--tk-text-2)">
                      O valor aparece em destaque no card e no relatório.
                    </span>
                  </span>
                </label>
              </>
            )}
            {(rascunho.tipo === "texto" || rascunho.tipo === "numero") && (
              <div className="space-y-4 rounded-(--tk-radius-control) border border-(--tk-border) bg-(--tk-panel-muted) p-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={rascunho.identificador}
                    onCheckedChange={(v) =>
                      setRascunho({
                        ...rascunho,
                        identificador: v === true,
                        obrigatorio: v === true ? rascunho.obrigatorio : false,
                      })
                    }
                  />
                  <span className="space-y-0.5">
                    <span className="block text-[14px] font-medium text-(--tk-text)">
                      Identificador documental
                    </span>
                    <span className="block text-[12.5px] font-normal text-(--tk-text-2)">
                      Número pedido ao mover a tarefa para esta etapa e exibido no card. O valor
                      permanece quando a tarefa avança.
                    </span>
                  </span>
                </label>
                {rascunho.identificador && (
                  <>
                    <TkField
                      label="Sigla da etiqueta"
                      htmlFor="campo-sigla"
                      hint="Texto curto da etiqueta, como DFD ou ETP. Até 16 caracteres."
                    >
                      <input
                        id="campo-sigla"
                        maxLength={16}
                        value={rascunho.sigla}
                        onChange={(e) => setRascunho({ ...rascunho, sigla: e.target.value })}
                        className={tkInput}
                      />
                    </TkField>
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={rascunho.obrigatorio}
                        onCheckedChange={(v) =>
                          setRascunho({ ...rascunho, obrigatorio: v === true })
                        }
                      />
                      <span className="space-y-0.5">
                        <span className="block text-[14px] font-medium text-(--tk-text)">
                          Obrigatório para avançar
                        </span>
                        <span className="block text-[12.5px] font-normal text-(--tk-text-2)">
                          Sem este número, a tarefa permanece na etapa anterior.
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <TkButton variant="secondary" onClick={() => setRascunho(null)}>
                <ArrowLeft /> Voltar
              </TkButton>
              <TkButton
                type="submit"
                variant="primary"
                disabled={!rascunho.nome.trim() || salvar.isPending}
              >
                Salvar campo
              </TkButton>
            </div>
          </form>
        ) : (
          <div className="flex min-h-0 flex-col gap-4">
            {doEtapa.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-(--tk-radius-control) border border-dashed border-(--tk-border-strong) px-4 py-8 text-center">
                <ListChecks className="size-5 text-(--tk-text-3)" aria-hidden />
                <p className="text-[13px] text-(--tk-text-2)">Esta etapa ainda não tem campos próprios.</p>
              </div>
            ) : (
              <ul className="tk-scroll min-h-0 divide-y divide-(--tk-border) overflow-y-auto rounded-(--tk-radius-control) border border-(--tk-border)">
                {doEtapa.map((c) => (
                  <li key={c.id} className="flex min-w-0 items-center gap-2 py-2 pl-3.5 pr-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium" title={c.nome}>
                      {c.nome}
                    </span>
                    <TkBadge>{CAMPO_TIPOS.find((t) => t.value === c.tipo)?.label ?? c.tipo}</TkBadge>
                    {c.usa_como_fase && <TkBadge tom="info">Fase</TkBadge>}
                    {c.identificador && (
                      <TkBadge tom="accent">{c.obrigatorio ? "Obrigatório" : "Identificador"}</TkBadge>
                    )}
                    <TkIconButton
                      label={`Editar campo ${c.nome}`}
                      size="iconSm"
                      onClick={() =>
                        setRascunho({
                          id: c.id,
                          nome: c.nome,
                          tipo: c.tipo,
                          opcoesTexto: c.opcoes.join("\n"),
                          usa_como_fase: c.usa_como_fase,
                          identificador: c.identificador,
                          sigla: c.sigla ?? "",
                          obrigatorio: c.obrigatorio,
                        })
                      }
                    >
                      <Pencil />
                    </TkIconButton>
                    <TkIconButton
                      label={`Arquivar campo ${c.nome}`}
                      size="iconSm"
                      onClick={() => void remover(c)}
                    >
                      <Archive />
                    </TkIconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <TkButton variant="primary" onClick={() => setRascunho(NOVO)}>
                <Plus /> Novo campo
              </TkButton>
            </div>
          </div>
        )}
        {dialog}
      </DialogContent>
    </Dialog>
  );
}
