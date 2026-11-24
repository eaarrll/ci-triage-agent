import pino from "pino";
import { handleOrderCreated } from "../../src/handlers/order-created";
import { upsertOrder } from "../../src/store/orders";
import { publishAnalytics } from "../../src/analytics";

jest.mock("../../src/store/orders");
jest.mock("../../src/analytics");

const log = pino({ level: "silent" });

describe("handleOrderCreated", () => {
  it("stores the order", async () => {
    await handleOrderCreated({ type: "order.created", orderId: "o1", customerId: "c1", totalCents: 1299, currency: "EUR" }, log);
    expect(upsertOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "o1", status: "created" }));
  });

  it("publishes an analytics event", async () => {
    await handleOrderCreated({ type: "order.created", orderId: "o2", customerId: "c1", totalCents: 500, currency: "USD" }, log);
    expect(publishAnalytics).toHaveBeenCalledWith("order_created", { orderId: "o2", value: 5, currency: "USD" });
  });

  it("rejects malformed events", async () => {
    await expect(handleOrderCreated({ type: "order.created", orderId: "o3" }, log)).rejects.toThrow();
  });
});
