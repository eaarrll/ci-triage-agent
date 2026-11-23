using Payments.Api.Data;
using Payments.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PaymentsDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Payments")));
builder.Services.AddHealthChecks().AddDbContextCheck<PaymentsDbContext>();
builder.Services.AddHeaderPropagation(options => options.Headers.Add("X-Correlation-Id"));

var app = builder.Build();

app.UseHeaderPropagation();
app.MapHealthChecks("/healthz");
app.MapPaymentIntentEndpoints();
app.MapRefundEndpoints();

app.Run();

public partial class Program;
