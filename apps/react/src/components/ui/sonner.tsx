import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      richColors
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Esito con colore di significato (token in index.css, contrasto AA nei due temi): riuscito come il badge
          // "Attivo", errore rosso, avviso ambra. Il testo resta sempre il segnale principale
          "--success-bg": "var(--status-active)",
          "--success-text": "var(--status-active-foreground)",
          "--success-border": "var(--status-active-border)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger-soft-foreground)",
          "--error-border": "var(--danger-soft-border)",
          "--warning-bg": "var(--status-invited)",
          "--warning-text": "var(--status-invited-foreground)",
          "--warning-border": "var(--status-invited-border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
