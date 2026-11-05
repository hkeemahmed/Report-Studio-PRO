import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes,
  type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";
const variants: Record<Variant, string> = {
  primary: "bg-primary-600 hover:bg-primary-700 text-white shadow-sm",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-navy-700 dark:hover:bg-slate-600 dark:text-slate-100",
  ghost: "hover:bg-slate-100 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200",
  danger: "bg-danger hover:bg-red-700 text-white",
  ai: "bg-ai-600 hover:bg-ai-700 text-white shadow-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }>(
  ({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...p }, ref) => (
    <button ref={ref} disabled={disabled || loading} {...p}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm", variants[variant], className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{children}
    </button>
  ));

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }>(
  ({ active, label, className, children, ...p }, ref) => (
    <button ref={ref} type="button" title={label} aria-label={label} aria-pressed={active} {...p}
      className={cx("inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-navy-700",
        active && "bg-primary-100 text-primary-700 dark:bg-primary-600/30 dark:text-primary-100", className)}>{children}</button>
  ));

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-100";
/** Width/height defaults apply only when the caller doesn't set them (avoids conflicting Tailwind classes). */
const dims = (className = "", h = true) => cx(!/(^|\s)w-/.test(className) && "w-full", h && !/(^|\s)h-/.test(className) && "h-10");
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) =>
  <input ref={ref} {...p} className={cx(field, dims(className), className)} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) =>
  <textarea ref={ref} {...p} className={cx(field, dims(className, false), className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) =>
  <select ref={ref} {...p} className={cx(field, dims(className), className)} />);

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-navy-700 dark:bg-navy-850", className)}>{children}</div>;
}

export function Badge({ color = "slate", children }: { color?: "slate" | "blue" | "green" | "amber" | "red" | "violet"; children: ReactNode }) {
  const c = { slate: "bg-slate-100 text-slate-700 dark:bg-navy-700 dark:text-slate-200", blue: "bg-primary-100 text-primary-700 dark:bg-primary-600/20 dark:text-primary-100",
    green: "bg-green-100 text-green-700 dark:bg-green-600/20 dark:text-green-300", amber: "bg-amber-100 text-amber-700 dark:bg-amber-600/20 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-300", violet: "bg-ai-100 text-ai-700 dark:bg-ai-600/20 dark:text-ai-100" }[color];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c)}>{children}</span>;
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx("h-5 w-5 animate-spin text-primary-500", className)} />;

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-slate-500">{icon}<p>{title}</p>{action}</div>;
}

export function Dialog({ open, onClose, title, children, footer, wide, className }: { open: boolean; onClose: () => void; title: ReactNode;
  children: ReactNode; footer?: ReactNode; wide?: boolean | "xl"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus(), 30);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-[fadeIn_.15s]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        className={cx("flex max-h-[90vh] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-navy-700 dark:bg-navy-850",
          wide === "xl" ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-lg", className)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-navy-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="flex-1 overflow-auto p-5 text-slate-800 dark:text-slate-200">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-navy-700">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx("flex gap-1 border-b border-slate-200 dark:border-navy-700", className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.id ? "border-primary-500 text-primary-600 dark:text-primary-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200")}>{t.label}</button>
      ))}
    </div>
  );
}

type Toast = { id: number; kind: "success" | "error" | "info" | "warning"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  const icon = { success: <CheckCircle2 className="h-5 w-5 text-success" />, error: <XCircle className="h-5 w-5 text-danger" />,
    info: <Info className="h-5 w-5 text-info" />, warning: <AlertTriangle className="h-5 w-5 text-warning" /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-navy-700 dark:bg-navy-800 dark:text-slate-100">
            {icon[t.kind]}<span className="flex-1">{t.text}</span>
          </div>))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Confirm({ open, text, onConfirm, onClose, confirmLabel = "OK", cancelLabel = "Cancel" }: { open: boolean; text: string;
  onConfirm: () => void; onClose: () => void; confirmLabel?: string; cancelLabel?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={confirmLabel}
      footer={<><Button variant="secondary" onClick={onClose}>{cancelLabel}</Button><Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
      <p>{text}</p>
    </Dialog>
  );
}

export function Dropdown({ trigger, children, align = "start" }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger(() => setOpen((o) => !o))}
      {open && <div className={cx("absolute top-full z-40 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-navy-700 dark:bg-navy-800", align === "end" ? "end-0" : "start-0")}>
        {children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({ onClick, children, icon, danger, disabled }: { onClick: () => void; children: ReactNode; icon?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={cx("flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-start text-sm hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-navy-700",
        danger ? "text-danger" : "text-slate-700 dark:text-slate-200")}>{icon}{children}</button>
  );
}
