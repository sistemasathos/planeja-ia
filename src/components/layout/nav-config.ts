import {
  LayoutDashboard,
  Building2,
  FileText,
  FileSignature,
  ScrollText,
  Users,
  UserCheck,
  HandCoins,
  ClipboardList,
  Home,
  KanbanSquare,
  Briefcase,
  UserCircle,
  Settings,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  /** Rotas extras que mantêm este item ativo (ex.: páginas de importação). */
  activeFor?: string[];
};

export type NavGroup = {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export const APP_NAV: NavEntry[] = [
  {
    label: "Início",
    icon: Home,
    items: [
      { to: "/dashboard", label: "Painel geral", icon: LayoutDashboard },
      { to: "/tarefas", label: "Acompanhamento", icon: KanbanSquare },
    ],
  },
  {
    label: "Operação",
    icon: Briefcase,
    items: [
      {
        to: "/processos",
        label: "Processos",
        icon: FileText,
        activeFor: ["/irp"],
      },
      {
        to: "/contratos",
        label: "Contratos",
        icon: FileSignature,
        activeFor: ["/importar-contratos"],
      },
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
    icon: Settings,
    items: [
      { to: "/perfil", label: "Meu perfil", icon: UserCircle },
      { to: "/configuracoes", label: "Configurações", icon: Settings },
      { to: "/logs", label: "Auditoria", icon: ScrollText, adminOnly: true },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const paths = [item.to, ...(item.activeFor ?? [])];
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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
