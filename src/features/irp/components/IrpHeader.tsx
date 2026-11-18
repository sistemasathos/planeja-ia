import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export interface IrpHeaderProps {
  children: ReactNode;
}

/**
 * Casca padronizada da rota IRP. Mantém o mesmo título/subtítulo do
 * layout original e apenas encapsula o AppShell — nenhum estado próprio.
 * A página é aberta pelo botão "Novo processo" de /processos.
 */
export function IrpHeader({ children }: IrpHeaderProps) {
  const navigate = useNavigate();
  return (
    <AppShell
      title="Novo processo - importação IRP"
      subtitle="Carregue a planilha consolidada e gere os arquivos por secretaria"
      onBack={() => navigate({ to: "/processos" })}
    >
      {children}
    </AppShell>
  );
}
