import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { COR_PADRAO, CORES_SUGERIDAS, corTextoSobre, corValida, type Etapa } from "../lib";
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
  etapa: Etapa | null;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (v: { id?: string; nome: string; cor: string; finaliza: boolean }) => void;
};

export function EtapaDialog({ aberto, etapa, salvando, onFechar, onSalvar }: Props) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(COR_PADRAO);
  const [finaliza, setFinaliza] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(etapa?.nome ?? "");
    setCor(corValida(etapa?.cor ?? COR_PADRAO));
    setFinaliza(etapa?.finaliza ?? false);
  }, [aberto, etapa]);

  const nomeValido = nome.trim().length >= 1 && nome.trim().length <= 60;
  const personalizada = !CORES_SUGERIDAS.includes(cor.toLowerCase());

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent hideClose className={cn(tkDialog, "sm:max-w-lg")}>
        <TkPanelHeader
          onClose={onFechar}
          title={
            <DialogTitle className={tkDialogTitle}>{etapa ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          }
          description={
            <DialogDescription className={tkDialogDescription}>
              O nome e a cor identificam a etapa no quadro e no relatório.
            </DialogDescription>
          }
        />
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nomeValido) return;
            onSalvar({ id: etapa?.id, nome: nome.trim(), cor, finaliza });
          }}
        >
          <TkField label="Nome da etapa" htmlFor="etapa-nome">
            <input
              id="etapa-nome"
              value={nome}
              maxLength={60}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              className={tkInput}
            />
          </TkField>
          <TkField
            label="Cor de identificação"
            hint="Verde, âmbar e vermelho ficam reservados à situação das demandas."
          >
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cor de identificação">
              {CORES_SUGERIDAS.map((c) => {
                const ativa = cor.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    aria-label={`Cor ${c}`}
                    aria-pressed={ativa}
                    className={cn(
                      "grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-(--tk-panel) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)",
                      ativa && "ring-2 ring-(--tk-text-2)",
                    )}
                    style={{ background: c }}
                  >
                    {ativa && <Check className="size-4" style={{ color: corTextoSobre(c) }} aria-hidden />}
                  </button>
                );
              })}
              <label
                className={cn(
                  "relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-(--tk-border-strong) ring-offset-2 ring-offset-(--tk-panel) focus-within:ring-2 focus-within:ring-(--tk-accent)",
                  personalizada && "ring-2 ring-(--tk-text-2)",
                )}
                style={personalizada ? { background: cor } : undefined}
              >
                <span className="sr-only">Cor personalizada</span>
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                {!personalizada && <span className="text-[13px] font-medium text-(--tk-text-3)" aria-hidden>+</span>}
              </label>
            </div>
          </TkField>
          <label
            htmlFor="etapa-finaliza"
            className="flex cursor-pointer items-center justify-between gap-4 rounded-(--tk-radius-control) border border-(--tk-border) bg-(--tk-panel-muted) p-3.5"
          >
            <span className="min-w-0 space-y-0.5">
              <span className="block text-[14px] font-medium text-(--tk-text)">Etapa de conclusão</span>
              <span className="block text-[12.5px] text-(--tk-text-2)">
                Demandas nesta etapa contam como concluídas no relatório.
              </span>
            </span>
            <Switch id="etapa-finaliza" checked={finaliza} onCheckedChange={setFinaliza} />
          </label>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <TkButton variant="secondary" onClick={onFechar}>
              Cancelar
            </TkButton>
            <TkButton type="submit" variant="primary" disabled={!nomeValido || salvando}>
              {etapa ? "Salvar alterações" : "Criar etapa"}
            </TkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
