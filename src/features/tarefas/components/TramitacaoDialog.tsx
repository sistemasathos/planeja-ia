import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RegraTramitacao } from "../lib";
import {
  TkButton,
  TkField,
  TkPanelHeader,
  tkDialog,
  tkDialogDescription,
  tkDialogTitle,
  tkInput,
} from "./ui";

export type ConfirmacaoTramitacao = {
  numero: string;
  data: string;
  horario: string;
  importar: boolean;
};

type Props = {
  aberto: boolean;
  regra: RegraTramitacao | null;
  etapaNome: string;
  numero: string;
  data: string;
  horario: string;
  confirmando?: boolean;
  onCancelar: () => void;
  onConfirmar: (valor: ConfirmacaoTramitacao) => void;
};

const TEXTO: Record<RegraTramitacao, { titulo: string; descricao: string }> = {
  pesquisa: {
    titulo: "Avanço para a etapa: Pesquisa",
    descricao: "Informe o número e a data inicial da pesquisa. A demanda segue para cotação.",
  },
  etp: {
    titulo: "Avanço para a etapa: ETP",
    descricao: "Informe o número e a data do Estudo Técnico Preliminar.",
  },
  publicacao: {
    titulo: "Avanço para a etapa: Publicação",
    descricao: "Número, data e horário do certame são opcionais enquanto ainda não existirem.",
  },
  julgamento: {
    titulo: "Avanço para a etapa: Julgamento",
    descricao: "O julgamento passa a ter fases próprias: propostas, habilitação, recurso e convocação.",
  },
  contratacao: {
    titulo: "Avanço para a etapa: Contratação",
    descricao: "A demanda pode receber os contratos do processo. Os documentos anteriores permanecem.",
  },
};

export function TramitacaoDialog({
  aberto,
  regra,
  etapaNome,
  numero,
  data,
  horario,
  confirmando,
  onCancelar,
  onConfirmar,
}: Props) {
  const [form, setForm] = useState({ numero: "", data: "", horario: "" });

  useEffect(() => {
    if (!aberto) return;
    setForm({ numero, data: data.slice(0, 10), horario: horario.slice(0, 5) });
  }, [aberto, numero, data, horario]);

  if (!regra) return null;
  const texto = TEXTO[regra];
  const pedeCampos = regra === "pesquisa" || regra === "etp" || regra === "publicacao";
  const obrigatorio = regra === "pesquisa" || regra === "etp";
  const bloqueado = obrigatorio && (!form.numero.trim() || !form.data);

  function confirmar(importar: boolean) {
    if (bloqueado || confirmando) return;
    onConfirmar({ ...form, importar });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !confirmando && onCancelar()}>
      <DialogContent hideClose className={cn(tkDialog, "sm:max-w-md")}>
        <TkPanelHeader
          onClose={onCancelar}
          title={<DialogTitle className={tkDialogTitle}>{texto.titulo}</DialogTitle>}
          description={
            <DialogDescription className={tkDialogDescription}>
              {texto.descricao} Destino: {etapaNome}.
            </DialogDescription>
          }
        />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar(false);
          }}
        >
          {pedeCampos && (
            <>
              <TkField
                label={regra === "publicacao" ? "Número do certame" : "Número"}
                htmlFor="tram-numero"
                hint={obrigatorio ? "Obrigatório para concluir o avanço." : "Opcional."}
              >
                <input
                  id="tram-numero"
                  value={form.numero}
                  maxLength={80}
                  disabled={confirmando}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  className={tkInput}
                />
              </TkField>
              <TkField label="Data" htmlFor="tram-data" hint={obrigatorio ? "Obrigatória." : "Opcional."}>
                <input
                  id="tram-data"
                  type="date"
                  value={form.data}
                  disabled={confirmando}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className={cn(tkInput, "[color-scheme:light] dark:[color-scheme:dark]")}
                />
              </TkField>
              {regra === "publicacao" && (
                <TkField label="Horário" htmlFor="tram-hora" hint="Opcional.">
                  <input
                    id="tram-hora"
                    type="time"
                    value={form.horario}
                    disabled={confirmando}
                    onChange={(e) => setForm({ ...form, horario: e.target.value })}
                    className={cn(tkInput, "[color-scheme:light] dark:[color-scheme:dark]")}
                  />
                </TkField>
              )}
            </>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <TkButton variant="secondary" onClick={onCancelar} disabled={confirmando}>
              Cancelar
            </TkButton>
            {regra === "contratacao" && (
              <TkButton variant="secondary" disabled={confirmando} onClick={() => confirmar(true)}>
                Avançar e importar
              </TkButton>
            )}
            <TkButton type="submit" variant="primary" disabled={bloqueado || confirmando}>
              Confirmar avanço
            </TkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
