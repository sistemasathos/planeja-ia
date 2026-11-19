import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Campo } from "../lib";
import {
  TkButton,
  TkField,
  TkPanelHeader,
  tkDialog,
  tkDialogDescription,
  tkDialogTitle,
  tkInput,
} from "./ui";

type Props = {
  aberto: boolean;
  etapaNome: string;
  campos: Campo[];
  valores: Record<string, string>;
  confirmando?: boolean;
  onCancelar: () => void;
  onConfirmar: (valores: Record<string, string>) => void;
};

export function AvancoEtapaDialog({
  aberto,
  etapaNome,
  campos,
  valores,
  confirmando,
  onCancelar,
  onConfirmar,
}: Props) {
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    const inicial: Record<string, string> = {};
    for (const c of campos) inicial[c.id] = valores[c.id] ?? "";
    setForm(inicial);
  }, [aberto, campos, valores]);

  const bloqueado = campos.some((c) => c.obrigatorio && !(form[c.id] ?? "").trim());

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !confirmando && onCancelar()}>
      <DialogContent hideClose className={cn(tkDialog, "sm:max-w-md")}>
        <TkPanelHeader
          onClose={onCancelar}
          title={
            <DialogTitle className={tkDialogTitle}>Avanço para a etapa: {etapaNome}</DialogTitle>
          }
          description={
            <DialogDescription className={tkDialogDescription}>
              Informe os identificadores documentais desta etapa. Os números das etapas anteriores
              permanecem na demanda.
            </DialogDescription>
          }
        />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (bloqueado || confirmando) return;
            onConfirmar(form);
          }}
        >
          {campos.map((c) => (
            <TkField
              key={c.id}
              label={c.nome}
              htmlFor={`avanco-${c.id}`}
              hint={c.obrigatorio ? "Obrigatório para concluir o avanço." : "Opcional."}
            >
              <input
                id={`avanco-${c.id}`}
                value={form[c.id] ?? ""}
                maxLength={80}
                autoComplete="off"
                disabled={confirmando}
                onChange={(e) => setForm((atual) => ({ ...atual, [c.id]: e.target.value }))}
                className={tkInput}
              />
            </TkField>
          ))}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <TkButton variant="secondary" onClick={onCancelar} disabled={confirmando}>
              Cancelar
            </TkButton>
            <TkButton type="submit" variant="primary" disabled={bloqueado || confirmando}>
              Confirmar avanço
            </TkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
