// Consistent name display across the whole app: only the first letter of
// each word is uppercase, everything else lowercase — e.g. "JERICK
// SALINAS" or "jerick salinas" both render as "Jerick Salinas". Applied at
// display time (not just on input) so it's consistent regardless of how a
// name was originally typed/stored.
export function toTitleCase(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// Convenience for the common "First Last" (optionally + Middle) display.
export function formatFullName(firstName: string | null | undefined, lastName: string | null | undefined, middleName?: string | null): string {
  return [toTitleCase(firstName), toTitleCase(middleName), toTitleCase(lastName)].filter(Boolean).join(" ");
}
