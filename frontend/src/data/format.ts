// 1234 -> "1.2K", 3400000 -> "3.4M".
export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
