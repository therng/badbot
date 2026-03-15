export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const UNKNOWN_TEXT = new Set(["unknown", "n/a", "na", "--"]);

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  return UNKNOWN_TEXT.has(normalized.toLowerCase()) ? null : normalized;
}

export function getFirstName(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  const [firstName] = normalized.split(" ");
  return firstName || null;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
