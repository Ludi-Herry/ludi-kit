export const tokens = {
  color: {
    bgPage: "var(--color-bg-page)",
    bgSurface: "var(--color-bg-surface)",
    brandPrimary: "var(--color-brand-primary)",
    textPrimary: "var(--color-text-primary)",
    textSecondary: "var(--color-text-secondary)",
    border: "var(--color-border)",
    statusSuccess: "var(--color-status-success)",
    statusWarning: "var(--color-status-warning)",
    statusDanger: "var(--color-status-danger)",
    statusInfo: "var(--color-status-info)"
  },
  spacing: {
    xs: "var(--spacing-xs)",
    sm: "var(--spacing-sm)",
    md: "var(--spacing-md)",
    lg: "var(--spacing-lg)",
    xl: "var(--spacing-xl)"
  },
  radius: {
    control: "var(--radius-control)",
    card: "var(--radius-card)"
  }
} as const;
