import { useEffect, useState } from "react";
import { fetchShippingQuote } from "../api/shipping";

export type ShippingQuote =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; amount: number; carrier: string }
  | { status: "error"; message: string };

export function useShippingQuote(postalCode: string | null, subtotal: number): ShippingQuote {
  const [quote, setQuote] = useState<ShippingQuote>({ status: "idle" });

  const fetchQuote = async (signal: AbortSignal) => {
    if (!postalCode) {
      setQuote({ status: "idle" });
      return;
    }
    setQuote({ status: "loading" });
    try {
      const result = await fetchShippingQuote({ postalCode, subtotal }, signal);
      setQuote({ status: "ready", amount: result.amount, carrier: result.carrier });
    } catch (error) {
      if (signal.aborted) return;
      setQuote({
        status: "error",
        message: error instanceof Error ? error.message : "Shipping quote failed",
      });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchQuote(controller.signal);
    return () => controller.abort();
  }, [postalCode, subtotal]);

  return quote;
}
