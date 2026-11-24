export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function seatLabel(rowLabel: string, number: number) {
  return `${rowLabel}${number}`;
}
