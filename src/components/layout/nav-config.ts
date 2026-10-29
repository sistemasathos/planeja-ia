import {
  LayoutDashboard,
  Building2,
  FileText,
  FileSignature,
  FileSpreadsheet,
  History,
  ScrollText,
  Hash,
  FileUp,
  Users,
  UserCheck,
  HandCoins,
  ClipboardList,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

export type NavGroup = {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export const APP_NAV: NavEntry[] = [
  {
    label: "Operação",
    icon: LayoutDashboard,
    items: [
      { to: "/dashboard", label: "Painel geral", icon: LayoutDashboard },
      { to: "/processos", label: "Processos", icon: FileText },
      { to: "/contratos", label: "Contratos", icon: FileSignature },
    ],
  },
  {
    label: "Importação",
    icon: FileUp,
    items: [
      { to: "/irp", label: "Importação de Processos", icon: FileSpreadsheet },
      {
        to: "/importar-contratos",
        label: "Importação de Contratos",
        icon: FileUp,
      },
      { to: "/historico", label: "Jobs IRP", icon: History },
    ],
  },
  {
    label: "Cadastros",
    icon: ClipboardList,
    items: [
      { to: "/secretarias", label: "Secretarias", icon: Building2 },
      { to: "/fornecedores", label: "Fornecedores", icon: HandCoins },
      { to: "/fiscais", label: "Fiscais", icon: UserCheck },
      { to: "/gestores", label: "Gestores", icon: Users },
    ],
  },
  {
    label: "Sistema",
    icon: ScrollText,
    items: [
      { to: "/numeracao", label: "Numeração", icon: Hash },
      { to: "/logs", label: "Auditoria", icon: ScrollText, adminOnly: true },
    ],
  },
];

export function flattenNavPages(isGestor: boolean): NavItem[] {
  const pages: NavItem[] = [];
  for (const entry of APP_NAV) {
    if ("items" in entry) {
      for (const item of entry.items) {
        if (!item.adminOnly || isGestor) pages.push(item);
      }
    } else if (!entry.adminOnly || isGestor) {
      pages.push(entry);
    }
  }
  return pages;
}
