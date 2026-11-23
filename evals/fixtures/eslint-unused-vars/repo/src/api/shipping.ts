export interface ShippingQuoteResponse {
  amount: number;
  carrier: string;
  estimatedDays: number;
}

export async function fetchShippingQuote(
  input: { postalCode: string; subtotal: number },
  signal: AbortSignal,
): Promise<ShippingQuoteResponse> {
  const params = new URLSearchParams({ postal_code: input.postalCode, subtotal: input.subtotal.toFixed(2) });
  const response = await fetch(`/api/shipping/quote?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Shipping quote failed with ${response.status}`);
  }
  return (await response.json()) as ShippingQuoteResponse;
}
