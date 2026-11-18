import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
  CircleCheck,
  OctagonAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SITUACOES, type Situacao } from "../lib";

/* --------------------------------- Botões ---------------------------------- */

export const tkButton = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-(--tk-radius-control) font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/45 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-(--tk-accent) text-(--tk-accent-fg) hover:bg-(--tk-accent-hover)",
        secondary:
          "border border-(--tk-border-strong) bg-(--tk-card) text-(--tk-text) hover:bg-(--tk-card-hover)",
        tertiary:
          "text-(--tk-text-2) hover:bg-(--tk-neutral-bg) hover:text-(--tk-text)",
        danger: "text-(--tk-danger) hover:bg-(--tk-danger-bg)",
        dangerSolid: "bg-(--tk-danger) text-(--tk-panel) hover:opacity-90",
      },
      size: {
        md: "h-10 px-4 text-[14px]",
        sm: "h-9 px-3 text-[13px]",
        icon: "size-9 rounded-lg",
        iconSm: "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type TkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof tkButton> & { asChild?: boolean };

export const TkButton = React.forwardRef<HTMLButtonElement, TkButtonProps>(
  ({ className, variant, size, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(tkButton({ variant, size }), className)}
        {...props}
      />
    );
  },
);
TkButton.displayName = "TkButton";

export function TkTooltip({
  label,
  side,
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-xs rounded-md bg-(--tk-text) px-2 py-1 text-[12px] font-medium text-(--tk-canvas)"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

type TkIconButtonProps = Omit<TkButtonProps, "size"> & {
  /** Texto do tooltip e do aria-label. */
  label: string;
  size?: "icon" | "iconSm";
  tooltipSide?: "top" | "right" | "bottom" | "left";
};

/** Botão só com ícone: sempre com tooltip e aria-label. */
export const TkIconButton = React.forwardRef<HTMLButtonElement, TkIconButtonProps>(
  ({ label, size = "icon", variant = "tertiary", tooltipSide, ...props }, ref) => (
    <TkTooltip label={label} side={tooltipSide}>
      <TkButton ref={ref} aria-label={label} variant={variant} size={size} {...props} />
    </TkTooltip>
  ),
);
TkIconButton.displayName = "TkIconButton";

/* ------------------------------ Campos de formulário ------------------------ */

const CONTROLE_BASE =
  "w-full min-w-0 rounded-(--tk-radius-control) border border-(--tk-border-strong) bg-(--tk-input) text-[14px] text-(--tk-text) shadow-none transition-colors placeholder:text-(--tk-text-3) hover:border-(--tk-text-3)/60 focus-visible:border-(--tk-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tk-accent)/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-(--tk-border-strong) dark:bg-(--tk-input) md:text-[14px]";

/** Input de texto (altura 44px). */
export const tkInput = cn(CONTROLE_BASE, "h-11 px-3");
/** Textarea com altura mínima. */
export const tkTextarea = cn(CONTROLE_BASE, "min-h-[112px] px-3 py-2.5 leading-relaxed");
/** SelectTrigger e gatilhos de Popover no padrão dos inputs. */
export const tkSelect = cn(
  CONTROLE_BASE,
  "h-11 gap-2 px-3 font-normal focus:border-(--tk-accent) focus:ring-2 focus:ring-(--tk-accent)/25 data-[placeholder]:text-(--tk-text-3) dark:data-[placeholder]:text-(--tk-text-3) [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left",
);

/** Conteúdo de menus, selects e popovers. */
export const tkMenu =
  "rounded-(--tk-radius-control) border border-(--tk-border-strong) bg-(--tk-panel) p-1.5 text-(--tk-text) shadow-(--tk-shadow-panel) dark:border-(--tk-border-strong) dark:bg-(--tk-panel)";
export const tkMenuItem =
  "min-h-9 cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-(--tk-text) focus:bg-(--tk-neutral-bg) focus:text-(--tk-text) data-[selected=true]:bg-(--tk-neutral-bg) data-[selected=true]:text-(--tk-text) dark:focus:bg-(--tk-neutral-bg) dark:focus:text-(--tk-text) [&>svg]:size-4 [&>svg]:text-(--tk-text-2)";
export const tkMenuItemDanger =
  "text-(--tk-danger) focus:bg-(--tk-danger-bg) focus:text-(--tk-danger) dark:focus:bg-(--tk-danger-bg) dark:focus:text-(--tk-danger) [&>svg]:text-(--tk-danger)";
export const tkMenuLabel =
  "px-2.5 pb-1 pt-1.5 text-[12px] font-semibold normal-case tracking-normal text-(--tk-text-3)";
export const tkMenuSeparator = "-mx-1.5 my-1.5 bg-(--tk-border)";

export function TkField({
  label,
  htmlFor,
  hint,
  action,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  /** Controle auxiliar alinhado à direita do rótulo (ex.: switch). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-h-6 min-w-0 items-center justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="truncate text-[13px] font-semibold text-(--tk-text-2)"
        >
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[12px] leading-snug text-(--tk-text-3)">{hint}</p>}
    </div>
  );
}

/* ------------------------------- Indicadores -------------------------------- */

export type TkTom = "neutral" | "info" | "ok" | "warn" | "danger" | "accent";

const TONS: Record<TkTom, string> = {
  neutral: "bg-(--tk-neutral-bg) text-(--tk-neutral)",
  info: "bg-(--tk-info-bg) text-(--tk-info)",
  ok: "bg-(--tk-ok-bg) text-(--tk-ok)",
  warn: "bg-(--tk-warn-bg) text-(--tk-warn)",
  danger: "bg-(--tk-danger-bg) text-(--tk-danger)",
  accent: "bg-(--tk-accent-soft) text-(--tk-accent)",
};

export function TkBadge({
  tom = "neutral",
  icon: Icon,
  title,
  className,
  children,
}: {
  tom?: TkTom;
  icon?: LucideIcon;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md px-2 text-[12px] font-medium",
        TONS[tom],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export const SITUACAO_VISUAL: Record<
  Situacao,
  { tom: TkTom; icon: LucideIcon; texto: string }
> = {
  ok: { tom: "ok", icon: CircleCheck, texto: "text-(--tk-ok)" },
  atencao: { tom: "warn", icon: TriangleAlert, texto: "text-(--tk-warn)" },
  travada: { tom: "danger", icon: OctagonAlert, texto: "text-(--tk-danger)" },
};

export function situacaoLabel(s: Situacao): string {
  return SITUACOES.find((x) => x.value === s)?.label ?? s;
}

/** Situação sempre com ícone + texto (não depende só da cor). */
export function SituacaoBadge({ situacao, className }: { situacao: Situacao; className?: string }) {
  const v = SITUACAO_VISUAL[situacao];
  return (
    <TkBadge tom={v.tom} icon={v.icon} className={className}>
      {situacaoLabel(situacao)}
    </TkBadge>
  );
}

/** Ícone + texto para usar dentro de SelectItem/menus. */
export function SituacaoOpcao({ situacao }: { situacao: Situacao }) {
  const v = SITUACAO_VISUAL[situacao];
  const Icon = v.icon;
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className={cn("size-4 shrink-0", v.texto)} aria-hidden />
      {situacaoLabel(situacao)}
    </span>
  );
}

export function TkCount({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <span
      aria-label={label}
      className="inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-full bg-(--tk-neutral-bg) px-2 text-[12px] font-semibold tabular-nums text-(--tk-text-2)"
    >
      {children}
    </span>
  );
}

/* ---------------------------- Estados e seções ------------------------------ */

export function TkEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-3 rounded-(--tk-radius-column) border border-dashed border-(--tk-border-strong) px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-(--tk-neutral-bg) text-(--tk-text-2)">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-(--tk-text)">{title}</p>
        {description && (
          <p className="text-[13px] leading-relaxed text-(--tk-text-2)">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function TkSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-(--tk-text)">{title}</h3>
          {description && <p className="text-[12.5px] text-(--tk-text-3)">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Cabeçalho compacto para Dialog/Sheet com botão de fechar próprio. */
export function TkPanelHeader({
  title,
  description,
  onClose,
  closeLabel = "Fechar",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title}
        {description}
      </div>
      <TkIconButton label={closeLabel} onClick={onClose} className="-mr-1.5 -mt-1">
        <X />
      </TkIconButton>
    </div>
  );
}

/** Classes de Dialog no padrão do módulo (usar com `hideClose`). */
export const tkDialog =
  "gap-5 rounded-(--tk-radius-column) border-(--tk-border-strong) bg-(--tk-panel) p-6 text-(--tk-text) shadow-(--tk-shadow-panel)";
export const tkDialogTitle = "text-[18px] font-semibold leading-snug text-(--tk-text)";
export const tkDialogDescription = "text-[13px] leading-relaxed text-(--tk-text-2)";

/* -------------------------------- Confirmação -------------------------------- */

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Confirmação modal padronizada. Retorna `confirm()` (Promise<boolean>) e o
 * elemento `dialog`, que precisa ser renderizado pelo componente.
 */
export function useConfirmDialog() {
  const [estado, setEstado] = React.useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setEstado({ ...opts, resolve })),
    [],
  );

  const responder = (v: boolean) => {
    estado?.resolve(v);
    setEstado(null);
  };

  const dialog = (
    <AlertDialog open={estado !== null} onOpenChange={(o) => !o && responder(false)}>
      <AlertDialogContent className={cn(tkDialog, "max-w-md")}>
        <AlertDialogHeader className="gap-1.5">
          <AlertDialogTitle className={tkDialogTitle}>{estado?.title}</AlertDialogTitle>
          {estado?.description && (
            <AlertDialogDescription className={tkDialogDescription}>
              {estado.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className={cn(tkButton({ variant: "secondary" }), "mt-0")}>
            {estado?.cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={tkButton({ variant: estado?.destructive ? "dangerSolid" : "primary" })}
            onClick={() => responder(true)}
          >
            {estado?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
