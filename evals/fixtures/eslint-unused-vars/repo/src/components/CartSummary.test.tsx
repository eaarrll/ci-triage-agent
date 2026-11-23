import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CartLine } from "../state/cart-context";
import { CartProvider } from "../state/CartProvider";
import { CartSummary } from "./CartSummary";

const tee: CartLine = {
  sku: "TEE-BLK-M",
  title: "Black tee (M)",
  quantity: 2,
  unitPrice: 24,
  compareAtPrice: 30,
};
const mug: CartLine = { sku: "MUG-12OZ", title: "Mug", quantity: 1, unitPrice: 14.25, compareAtPrice: null };

function renderSummary(lines: CartLine[], onCheckout = vi.fn()) {
  render(
    <CartProvider initialLines={lines}>
      <CartSummary postalCode={null} onCheckout={onCheckout} />
    </CartProvider>,
  );
  return { onCheckout };
}

describe("CartSummary", () => {
  it("shows the subtotal and item count", () => {
    renderSummary([tee, mug]);
    expect(screen.getByText("Subtotal (2 items)")).toBeInTheDocument();
    expect(screen.getAllByText("$62.25")).toHaveLength(2);
  });

  it("shows savings against compare-at prices", () => {
    renderSummary([tee]);
    expect(screen.getByText("You save")).toBeInTheDocument();
    expect(screen.getByText("-$12.00")).toBeInTheDocument();
  });

  it("hides the savings row when nothing is discounted", () => {
    renderSummary([mug]);
    expect(screen.queryByText("You save")).not.toBeInTheDocument();
  });

  it("asks for a postal code before quoting shipping", () => {
    renderSummary([mug]);
    expect(screen.getByText("Enter a postal code")).toBeInTheDocument();
  });

  it("disables checkout for an empty cart", () => {
    renderSummary([]);
    expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();
  });

  it("calls onCheckout", async () => {
    const { onCheckout } = renderSummary([mug]);
    await userEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(onCheckout).toHaveBeenCalledOnce();
  });
});
