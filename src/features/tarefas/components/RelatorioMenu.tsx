import { useState } from "react";
import {
  ChevronDown,
  ClipboardCopy,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  imprimirRelatorio,
  montarRelatorio,
  relatorioTexto,
  relatorioVazio,
  type ContextoRelatorio,
} from "../relatorio";
import { TkButton, tkMenu, tkMenuItem, tkMenuLabel, tkMenuSeparator } from "./ui";

type Formato = "imprimir" | "pdf" | "xlsx" | "texto";

type Props = {
  contexto: ContextoRelatorio;
  desabilitado?: boolean;
};

export function RelatorioMenu({ contexto, desabilitado }: Props) {
  const [gerando, setGerando] = useState<Formato | null>(null);

  async function executar(tipo: Formato) {
    const relatorio = montarRelatorio(contexto);
    if (relatorioVazio(relatorio)) {
      notify.info("Nenhuma tarefa para o relatório com os filtros atuais");
      return;
    }
    try {
      if (tipo === "texto") {
        await navigator.clipboard.writeText(relatorioTexto(relatorio));
        notify.success("Resumo copiado", { description: "Cole no WhatsApp ou e-mail." });
        return;
      }
      setGerando(tipo);
      if (tipo === "imprimir") await imprimirRelatorio(relatorio);
      else if (tipo === "pdf") await exportarRelatorioPdf(relatorio);
      else await exportarRelatorioExcel(relatorio);
    } catch (e) {
      notify.error("Não foi possível gerar o relatório", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGerando(null);
    }
  }

  const filtrado = contexto.criterios.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TkButton variant="secondary" disabled={desabilitado || gerando !== null}>
          {gerando ? <Loader2 className="animate-spin" /> : <FileBarChart />}
          {gerando ? "Gerando..." : "Relatório"}
          <ChevronDown className="text-(--tk-text-3)" />
        </TkButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(tkMenu, "w-80")}>
        <DropdownMenuLabel className={tkMenuLabel}>
          {filtrado ? "Considera os filtros aplicados no quadro" : "Considera todas as tarefas do quadro"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className={tkMenuSeparator} />
        <DropdownMenuItem className={tkMenuItem} onSelect={() => void executar("imprimir")}>
          <Printer /> Imprimir (A4)
        </DropdownMenuItem>
        <DropdownMenuItem className={tkMenuItem} onSelect={() => void executar("pdf")}>
          <FileText /> Baixar PDF por etapa
        </DropdownMenuItem>
        <DropdownMenuItem className={tkMenuItem} onSelect={() => void executar("xlsx")}>
          <FileSpreadsheet /> Baixar planilha Excel por etapa
        </DropdownMenuItem>
        <DropdownMenuSeparator className={tkMenuSeparator} />
        <DropdownMenuItem className={tkMenuItem} onSelect={() => void executar("texto")}>
          <ClipboardCopy /> Copiar resumo em texto (WhatsApp)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
