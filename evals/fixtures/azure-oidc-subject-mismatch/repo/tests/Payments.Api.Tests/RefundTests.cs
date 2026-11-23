using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Payments.Api.Tests;

public class RefundTests(PaymentsApiFactory factory) : IClassFixture<PaymentsApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Refund_larger_than_capture_is_rejected()
    {
        var intent = await factory.SeedCapturedIntentAsync(amountMinor: 5_000);

        var response = await _client.PostAsJsonAsync($"/payment-intents/{intent}/refunds", new { amountMinor = 5_001 });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Partial_refunds_accumulate()
    {
        var intent = await factory.SeedCapturedIntentAsync(amountMinor: 5_000);

        await _client.PostAsJsonAsync($"/payment-intents/{intent}/refunds", new { amountMinor = 2_000 });
        var second = await _client.PostAsJsonAsync($"/payment-intents/{intent}/refunds", new { amountMinor = 3_000 });
        var third = await _client.PostAsJsonAsync($"/payment-intents/{intent}/refunds", new { amountMinor = 1 });

        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, third.StatusCode);
    }
}
