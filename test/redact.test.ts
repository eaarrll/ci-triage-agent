import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { redactSecrets, withRedaction } from "../src/redact.js";
import type { ChangedFile, JobHistoryEntry, JobInfo, RepoRef, RunInfo, TriageBackend } from "../src/types.js";

// Fixture credentials are assembled at runtime so this file never contains a complete
// credential literal: secret scanners (GitHub push protection included) stay quiet, and the
// "Fake" filler makes every value obviously bogus while keeping it format-valid.
const join = (...parts: string[]): string => parts.join("");
const filler = (length: number, alphabet = "Fake0"): string =>
  alphabet.repeat(Math.ceil(length / alphabet.length)).slice(0, length);
const base64 = (text: string): string => Buffer.from(text).toString("base64");

const FAKE = {
  githubClassic: join("gh", "p_", filler(36)),
  githubServer: join("gh", "s_", filler(40)),
  githubFineGrained: join("github", "_pat_", "11FAKE0000", "_", filler(59)),
  anthropic: join("sk-", "ant-", "api03-", filler(93, "Fake0-_"), "AA"),
  openaiLegacy: join("sk-", filler(48)),
  openaiProject: join("sk-", "proj-", filler(100, "Fake0_x-")),
  google: join("AI", "za", filler(35)),
  awsKeyId: join("AK", "IA", "FAKE0000EXAMPLE0"),
  awsSessionKeyId: join("AS", "IA", "FAKE0000EXAMPLE1"),
  awsSecret: filler(40, "FakeSecret0/+"),
  azureAccountKey: join(filler(86, "FakeKey0+/"), "=="),
  sasSignature: join(filler(32, "FakeSig0"), "%2B", "%3D"),
  azureClientSecret: join("Fak", "8", "Q~", filler(34, "Fake0~._-")),
  slackBot: join("xo", "xb-", "000000000000-000000000000-", filler(24)),
  slackWebhookPath: join("T00000000/B00000000/", filler(24)),
  stripe: join("sk", "_live_", filler(24)),
  npm: join("np", "m_", filler(36)),
  jwt: join(
    "eyJ",
    "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    ".",
    "eyJ",
    "zdWIiOiJmYWtlLWNpIn0",
    ".",
    filler(43, "FakeSig0_-"),
  ),
  opaque: filler(32, "Fake0Opaque9"),
  basic: base64("ci-bot:Fake-Passw0rd"),
  dockerAuth: base64("example-bot:Fake0Registry0Token"),
  kubeKeyData: base64("FAKE CLIENT KEY DATA ".repeat(6)),
  kubeCertData: base64("FAKE CLIENT CERT DATA ".repeat(6)),
} as const;

const TS = "2026-11-24T10:15:30.1234567Z";
const marker = (kind: string): string => `[REDACTED:${kind}]`;
const markerCount = (text: string): number => text.match(/\[REDACTED:[a-z_]+\]/g)?.length ?? 0;

describe("redactSecrets: one realistic example per kind", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "GitHub classic PAT",
      input: `export GH_TOKEN=${FAKE.githubClassic}`,
      expected: `export GH_TOKEN=${marker("github_token")}`,
    },
    {
      name: "GitHub installation token inside a clone URL",
      input: `git clone https://x-access-token:${FAKE.githubServer}@github.com/example-org/app.git`,
      expected: `git clone https://x-access-token:${marker("github_token")}@github.com/example-org/app.git`,
    },
    {
      name: "GitHub fine-grained PAT",
      input: `Using credentials ${FAKE.githubFineGrained} for example-org`,
      expected: `Using credentials ${marker("github_token")} for example-org`,
    },
    {
      name: "Anthropic key (not double-counted as OpenAI or generic)",
      input: `ANTHROPIC_API_KEY=${FAKE.anthropic}`,
      expected: `ANTHROPIC_API_KEY=${marker("anthropic_key")}`,
    },
    {
      name: "OpenAI legacy key",
      input: `openai.AuthenticationError: Incorrect API key provided: ${FAKE.openaiLegacy}.`,
      expected: `openai.AuthenticationError: Incorrect API key provided: ${marker("openai_key")}.`,
    },
    {
      name: "OpenAI project key",
      input: `OPENAI_API_KEY="${FAKE.openaiProject}"`,
      expected: `OPENAI_API_KEY="${marker("openai_key")}"`,
    },
    {
      name: "Google API key",
      input: `GET https://maps.example.com/api/geocode?key=${FAKE.google} 403`,
      expected: `GET https://maps.example.com/api/geocode?key=${marker("google_api_key")} 403`,
    },
    {
      name: "AWS access key id",
      input: `aws_access_key_id = ${FAKE.awsKeyId}`,
      expected: `aws_access_key_id = ${marker("aws_access_key_id")}`,
    },
    {
      name: "AWS temporary access key id",
      input: `Assumed role, AccessKeyId ${FAKE.awsSessionKeyId} expires in 3600s`,
      expected: `Assumed role, AccessKeyId ${marker("aws_access_key_id")} expires in 3600s`,
    },
    {
      name: "AWS secret key in a credentials file",
      input: `aws_secret_access_key = ${FAKE.awsSecret}`,
      expected: `aws_secret_access_key = ${marker("aws_secret")}`,
    },
    {
      name: "AWS secret key as an env var",
      input: `AWS_SECRET_ACCESS_KEY: ${FAKE.awsSecret}`,
      expected: `AWS_SECRET_ACCESS_KEY: ${marker("aws_secret")}`,
    },
    {
      name: "AWS secret key in STS JSON",
      input: `"SecretAccessKey": "${FAKE.awsSecret}",`,
      expected: `"SecretAccessKey": "${marker("aws_secret")}",`,
    },
    {
      name: "Azure storage connection string",
      input: `DefaultEndpointsProtocol=https;AccountName=acmestorage;AccountKey=${FAKE.azureAccountKey};EndpointSuffix=core.windows.net`,
      expected: `DefaultEndpointsProtocol=https;AccountName=acmestorage;AccountKey=${marker("azure_key")};EndpointSuffix=core.windows.net`,
    },
    {
      name: "Azure Service Bus connection string",
      input: `Endpoint=sb://acme.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=${FAKE.azureAccountKey}`,
      expected: `Endpoint=sb://acme.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=${marker("azure_key")}`,
    },
    {
      name: "Azure SAS URL",
      input: `Uploading to https://acmestorage.blob.core.windows.net/artifacts/build.zip?sv=2022-11-02&ss=b&sp=rw&se=2030-01-01T00:00:00Z&spr=https&sig=${FAKE.sasSignature}`,
      expected: `Uploading to https://acmestorage.blob.core.windows.net/artifacts/build.zip?sv=2022-11-02&ss=b&sp=rw&se=2030-01-01T00:00:00Z&spr=https&sig=${marker("azure_sas")}`,
    },
    {
      name: "Azure SharedAccessSignature token",
      input: `SharedAccessSignature sr=acme.servicebus.windows.net&sig=${FAKE.sasSignature}&se=1900000000&skn=send`,
      expected: `SharedAccessSignature sr=acme.servicebus.windows.net&sig=${marker("azure_sas")}&se=1900000000&skn=send`,
    },
    {
      name: "Azure client secret by format (az ad sp output)",
      input: `  "password": "${FAKE.azureClientSecret}",`,
      expected: `  "password": "${marker("azure_client_secret")}",`,
    },
    {
      name: "AZURE_CLIENT_SECRET assignment",
      input: `AZURE_CLIENT_SECRET=Fake-Client-Secret-0123`,
      expected: `AZURE_CLIENT_SECRET=${marker("client_secret")}`,
    },
    {
      name: "client_secret in OAuth JSON",
      input: `{"client_id": "ci-app", "client_secret": "Fake0Client0Secret"}`,
      expected: `{"client_id": "ci-app", "client_secret": "${marker("client_secret")}"}`,
    },
    {
      name: "JWT",
      input: `id_token: ${FAKE.jwt}`,
      expected: `id_token: ${marker("jwt")}`,
    },
    {
      name: "Slack bot token",
      input: `SLACK_BOT_TOKEN=${FAKE.slackBot}`,
      expected: `SLACK_BOT_TOKEN=${marker("slack_token")}`,
    },
    {
      name: "Slack webhook URL",
      input: `curl -X POST https://hooks.slack.com/services/${FAKE.slackWebhookPath} -d @payload.json`,
      expected: `curl -X POST https://hooks.slack.com/services/${marker("slack_webhook")} -d @payload.json`,
    },
    {
      name: "Stripe live key",
      input: `STRIPE_SECRET_KEY=${FAKE.stripe}`,
      expected: `STRIPE_SECRET_KEY=${marker("stripe_key")}`,
    },
    {
      name: "npm token in .npmrc",
      input: `//registry.npmjs.org/:_authToken=${FAKE.npm}`,
      expected: `//registry.npmjs.org/:_authToken=${marker("npm_token")}`,
    },
    {
      name: "Authorization: Bearer header",
      input: `curl -sSf -H "Authorization: Bearer ${FAKE.opaque}" https://api.example.com/v1/builds`,
      expected: `curl -sSf -H "Authorization: Bearer ${marker("authorization")}" https://api.example.com/v1/builds`,
    },
    {
      name: "Authorization: Basic header",
      input: `> Authorization: Basic ${FAKE.basic}`,
      expected: `> Authorization: Basic ${marker("authorization")}`,
    },
    {
      name: "Proxy-Authorization header with a short padded credential",
      input: `Proxy-Authorization: Basic ${base64("u:Fake0pass")}`,
      expected: `Proxy-Authorization: Basic ${marker("authorization")}`,
    },
    {
      name: "Bearer token outside a header",
      input: `DEBUG http: sending request with Bearer ${FAKE.opaque}`,
      expected: `DEBUG http: sending request with Bearer ${marker("bearer_token")}`,
    },
    {
      name: "password in a database URL",
      input: `DATABASE_URL=postgres://ci_user:Fake-Passw0rd@db.example.internal:5432/app`,
      expected: `DATABASE_URL=postgres://ci_user:${marker("url_password")}@db.example.internal:5432/app`,
    },
    {
      name: "password in a URL with an empty user",
      input: `Connecting to redis://:pass@cache.example.internal:6379/0`,
      expected: `Connecting to redis://:${marker("url_password")}@cache.example.internal:6379/0`,
    },
    {
      name: "URL password containing a raw @ (nothing after the first @ leaks)",
      input: `DATABASE_URL=postgres://admin:Fake@Passw0rd@db.example.internal:5432/app`,
      expected: `DATABASE_URL=postgres://admin:${marker("url_password")}@db.example.internal:5432/app`,
    },
    {
      name: "URL password after an e-mail user name",
      input: `git clone https://ci@example.com:Fake-Passw0rd@git.example.com/acme/app.git`,
      expected: `git clone https://ci@example.com:${marker("url_password")}@git.example.com/acme/app.git`,
    },
    {
      name: "URL password inside a JSON string followed by an e-mail",
      input: `{"url":"redis://ci:Fake0Pass@cache:6379","owner":"ci@example.com"}`,
      expected: `{"url":"redis://ci:${marker("url_password")}@cache:6379","owner":"ci@example.com"}`,
    },
    {
      name: "GitHub token used as the URL user name (one marker, not split at its colon)",
      input: `git clone https://${FAKE.githubClassic}@github.com/example-org/app.git`,
      expected: `git clone https://${marker("github_token")}@github.com/example-org/app.git`,
    },
    {
      name: "Docker config auth",
      input: `{"auths":{"ghcr.io":{"auth":"${FAKE.dockerAuth}"}}}`,
      expected: `{"auths":{"ghcr.io":{"auth":"${marker("docker_auth")}"}}}`,
    },
    {
      name: "Docker config auth, JSON-escaped",
      input: `DOCKER_CONFIG_JSON="{\\"auths\\":{\\"ghcr.io\\":{\\"auth\\":\\"${FAKE.dockerAuth}\\"}}}"`,
      expected: `DOCKER_CONFIG_JSON="{\\"auths\\":{\\"ghcr.io\\":{\\"auth\\":\\"${marker("docker_auth")}\\"}}}"`,
    },
    {
      name: "kubeconfig client-key-data",
      input: `    client-key-data: ${FAKE.kubeKeyData}`,
      expected: `    client-key-data: ${marker("kubeconfig")}`,
    },
    {
      name: "kubeconfig client-certificate-data",
      input: `    client-certificate-data: ${FAKE.kubeCertData}`,
      expected: `    client-certificate-data: ${marker("kubeconfig")}`,
    },
    {
      name: "kubeconfig client-key-data in JSON (kubectl config view --raw -o json)",
      input: `      "client-key-data": "${FAKE.kubeKeyData}",`,
      expected: `      "client-key-data": "${marker("kubeconfig")}",`,
    },
    {
      name: "kubeconfig token",
      input: `    token: fake01.0123456789fakefake`,
      expected: `    token: ${marker("token")}`,
    },
    {
      name: "generic password env var",
      input: `DB_PASSWORD=Fake-Passw0rd-123`,
      expected: `DB_PASSWORD=${marker("password")}`,
    },
    {
      name: "generic quoted api key with spaces around the separator",
      input: `"api_key" : "Fake0Fake0Fake0"`,
      expected: `"api_key" : "${marker("api_key")}"`,
    },
    {
      name: "generic single-quoted secret key",
      input: `SECRET_KEY = 'django-insecure-fake0!x9'`,
      expected: `SECRET_KEY = '${marker("secret_key")}'`,
    },
    {
      name: "generic CLI flag",
      input: `helm upgrade app ./chart --set db.password=Fake0Passw0rd!`,
      expected: `helm upgrade app ./chart --set db.password=${marker("password")}`,
    },
    {
      name: "generic token in a query string",
      input: `GET /api/download?access_token=Fake0Fake0Fake0Fake0&format=zip 401`,
      expected: `GET /api/download?access_token=${marker("token")}&format=zip 401`,
    },
    {
      name: "generic Go short assignment",
      input: `pwd := "Fake0Passw0rd"`,
      expected: `pwd := "${marker("password")}"`,
    },
    {
      name: "generic password in JSON-escaped quotes (secret manager SecretString)",
      input: String.raw`    "SecretString": "{\"username\":\"ci\",\"password\":\"Fake0Passw0rd!\"}",`,
      expected: String.raw`    "SecretString": "{\"username\":\"ci\",\"password\":\"${marker("password")}\"}",`,
    },
    {
      name: "base64-encoded secret with no digits (kubectl get secret -o yaml)",
      input: `  password: aHVudGVy`,
      expected: `  password: ${marker("password")}`,
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactSecrets(input)).toEqual({ text: expected, count: 1 });
    expect(redactSecrets(expected)).toEqual({ text: expected, count: 0 });
  });
});

describe("redactSecrets: private keys", () => {
  const body = [
    join("MIIEowIBAAKCAQEA", filler(48, "FAKEfake0+/")),
    filler(64, "FAKEkey0+/"),
    join(filler(40, "fakeKEY1"), "=="),
  ];

  it.each([
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "OPENSSH PRIVATE KEY",
    "ENCRYPTED PRIVATE KEY",
    "PRIVATE KEY",
  ])("redacts a timestamped multi-line %s block and keeps the line structure", (label) => {
    const log = [
      `${TS} Writing deploy key`,
      `${TS} -----BEGIN ${label}-----`,
      ...body.map((line) => `${TS} ${line}`),
      `${TS} -----END ${label}-----`,
      `${TS} Key written to ~/.ssh/id_deploy`,
    ].join("\n");

    const result = redactSecrets(log);

    expect(result.count).toBe(1);
    const lines = result.text.split("\n");
    expect(lines).toHaveLength(log.split("\n").length);
    expect(lines[1]).toBe(`${TS} ${marker("private_key")}`);
    expect(lines.slice(2, 6).every((line) => line === `${TS} `)).toBe(true);
    expect(lines.at(-1)).toBe(`${TS} Key written to ~/.ssh/id_deploy`);
    for (const line of body) expect(result.text).not.toContain(line);
  });

  it("redacts the JSON-escaped single-line form in a GCP service-account key", () => {
    const pem = join("-----BEGIN PRIVATE KEY-----\\n", body.join("\\n"), "\\n-----END PRIVATE KEY-----\\n");
    const json = `{"type": "service_account", "project_id": "acme-ci", "private_key": "${pem}", "client_email": "ci@acme-ci.iam.gserviceaccount.com"}`;

    expect(redactSecrets(json)).toEqual({
      text: `{"type": "service_account", "project_id": "acme-ci", "private_key": "${marker("private_key")}\\n", "client_email": "ci@acme-ci.iam.gserviceaccount.com"}`,
      count: 1,
    });
  });

  it("redacts an unterminated block (truncated log) up to the first non-base64 line", () => {
    const log = [`-----BEGIN OPENSSH PRIVATE KEY-----`, ...body, `Error: Load key: invalid format`].join(
      "\n",
    );

    expect(redactSecrets(log)).toEqual({
      text: `${marker("private_key")}\n\n\n\nError: Load key: invalid format`,
      count: 1,
    });
  });

  it("redacts two blocks separately", () => {
    const block = (label: string) =>
      [`-----BEGIN ${label}-----`, ...body, `-----END ${label}-----`].join("\n");
    const result = redactSecrets(`${block("RSA PRIVATE KEY")}\nbetween\n${block("EC PRIVATE KEY")}`);

    expect(result.count).toBe(2);
    expect(result.text).toContain("\nbetween\n");
  });

  it("leaves public certificates alone", () => {
    const cert = ["-----BEGIN CERTIFICATE-----", ...body, "-----END CERTIFICATE-----"].join("\n");
    expect(redactSecrets(cert)).toEqual({ text: cert, count: 0 });
  });
});

describe("redactSecrets: no false positives", () => {
  const untouched = [
    // GitHub's own masks
    "password: ***",
    "  token: ***",
    "AWS_SECRET_ACCESS_KEY: ***",
    "Authorization: Bearer ***",
    "git remote add origin https://user:***@github.com/example-org/app.git",
    "http.https://github.com/.extraheader AUTHORIZATION: basic ***",
    // references and templates
    "token: ${{ secrets.GITHUB_TOKEN }}",
    'password: "${{ secrets.DB_PASSWORD }}"',
    "password=$DB_PASSWORD",
    "NPM_TOKEN=${NPM_TOKEN}",
    "client_secret = var.client_secret",
    "  value = data.azurerm_key_vault_secret.sp.value",
    "apiKey: process.env.ANTHROPIC_API_KEY,",
    "const token = core.getInput('github-token');",
    'password = os.environ["DB_PASSWORD"]',
    "token: accessToken,",
    "password: {{ .Values.db.password }}",
    "Authorization: `Bearer ${token}`",
    "set PASSWORD=%DB_PASSWORD%",
    "url = https://user:${GIT_PASSWORD}@git.example.com/repo.git",
    // placeholders and empty values
    "api_key: <your-api-key>",
    "password: <placeholder>",
    "password=",
    'password: ""',
    "token: ''",
    "password: xxxxxxxxxx",
    "NODE_AUTH_TOKEN: XXXXX-XXXXX-XXXXX-XXXXX",
    "  + password = (sensitive value)",
    "  ~ client_secret = (sensitive value)",
    "  + token = (known after apply)",
    // booleans, short words, enums
    "secret: true",
    "token: false",
    "password: null",
    "token: abc123",
    "password: hunter2",
    "id-token: write",
    "  contents: read",
    "TOKEN_PERMISSIONS: read",
    "secret-scanning: enabled",
    "secret: enabled",
    "token: readwrite",
    "Using token from env",
    "Error: token: invalid signature",
    "password: Required",
    // numbers, paths, URLs, comparisons
    "PWD=/home/runner/work/acme-app/acme-app",
    "OLDPWD=",
    "token: 1234567890",
    "password_min_length: 12",
    "token_url: https://login.example.com/oauth2/token",
    "if token == expected_token_value_123:",
    "TestTokenRefresh::test_expired_token",
    "max_tokens: 4096",
    "Bearer authentication-required-for-this-endpoint",
    "Starting service at postgres://localhost:5432/app",
    // URLs with an "@" but no password
    "Cloning https://ci@git.example.com:8443/acme/app.git",
    "npm http fetch GET 404 https://registry.npmjs.org/@acme/utils@1.2.3",
    "Listening on http://0.0.0.0:3000 (pid 42), contact ci@example.com",
    '{"homepage":"https://acme.example.com","bugs":"triage:ci@example.com"}',
    // JSON-escaped placeholders
    String.raw`{\"token\":\"***\",\"password\":\"\",\"secret\":\"enabled\",\"api_key\":\"${"$"}{API_KEY}\"}`,
  ];

  it.each(untouched)("leaves %j unchanged", (line) => {
    expect(redactSecrets(line)).toEqual({ text: line, count: 0 });
  });

  it("leaves ordinary CI output from common tools unchanged", () => {
    const log = String.raw`
2026-11-24T10:15:30.0000000Z ##[group]GITHUB_TOKEN Permissions
2026-11-24T10:15:30.0000000Z Contents: read
2026-11-24T10:15:30.0000000Z Metadata: read
2026-11-24T10:15:30.0000000Z PullRequests: write
2026-11-24T10:15:30.0000000Z ##[endgroup]
2026-11-24T10:15:30.0000000Z Secret source: Actions
2026-11-24T10:15:31.0000000Z ##[group]Run actions/checkout@v4
2026-11-24T10:15:31.0000000Z with:
2026-11-24T10:15:31.0000000Z   repository: example-org/acme-app
2026-11-24T10:15:31.0000000Z   token: ***
2026-11-24T10:15:31.0000000Z   ssh-strict: true
2026-11-24T10:15:31.0000000Z   persist-credentials: true
2026-11-24T10:15:31.0000000Z ##[endgroup]
2026-11-24T10:15:32.0000000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --depth=1 origin +4f1c2a9e:refs/remotes/pull/42/merge
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory.
npm error code E401
npm error 401 Unauthorized - GET https://registry.npmjs.org/@acme%2futils - authentication token not provided
npm error A complete log of this run can be found in: /home/runner/.npm/_logs/2026-11-24T10_15_40_000Z-debug-0.log
added 1287 packages, and audited 1288 packages in 21s
> acme-app@1.4.0 test
> vitest run --reporter=dot
 FAIL  src/auth/token.test.ts > refreshToken > rotates the secret when expired
AssertionError: expected 'expired' to be 'valid'
tests/test_auth.py::test_password_hashing PASSED                         [ 12%]
tests/test_auth.py::TestToken::test_refresh_token_rotation FAILED        [ 25%]
E       KeyError: 'token'
E       assert response.status_code == 200
FAILED tests/test_auth.py::TestToken::test_refresh_token_rotation - KeyError: 'token'
==================== 1 failed, 41 passed in 3.21s ====================
Terraform will perform the following actions:
  # azurerm_key_vault_secret.db_password will be created
  + resource "azurerm_key_vault_secret" "db_password" {
      + id           = (known after apply)
      + name         = "db-password"
      + value        = (sensitive value)
      + key_vault_id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-acme/providers/Microsoft.KeyVault/vaults/kv-acme"
    }
Error: Error acquiring the state lock
  Lock Info:
    ID:        6f1e2c1a-0000-4000-8000-000000000000
    Path:      acme-tfstate/env/prod.tfstate
secret/db-credentials configured
serviceaccount/deployer unchanged
Error from server (Forbidden): secrets is forbidden: User "system:serviceaccount:ci:deployer" cannot list resource "secrets" in API group "" in the namespace "prod"
Error from server (NotFound): secrets "db-password" not found
Name:         db-credentials
Type:         Opaque
password:     16 bytes
token:        1024 bytes
WARNING! Your password will be stored unencrypted in /home/runner/.docker/config.json.
Login Succeeded
#5 [auth] library/node:pull token for registry-1.docker.io
Run echo "token=$TOKEN" >> "$GITHUB_OUTPUT"
##[error]Input required and not supplied: github-token
##[error]Process completed with exit code 1.
`;
    expect(redactSecrets(log)).toEqual({ text: log, count: 0 });
  });
});

describe("redactSecrets: counting and idempotence", () => {
  const mixed = [
    `${TS} export GH_TOKEN=${FAKE.githubClassic} AWS_ACCESS_KEY_ID=${FAKE.awsKeyId} SLACK=${FAKE.slackBot}`,
    `${TS} curl -H "Authorization: Bearer ${FAKE.jwt}" https://ci:Fake-Passw0rd@api.example.com`,
    `${TS} DB_PASSWORD=Fake-Passw0rd-123 api_key: "Fake0Fake0Fake0" token: ***`,
    `${TS} -----BEGIN EC PRIVATE KEY-----`,
    `${TS} ${filler(64, "FAKEkey0+/")}`,
    `${TS} -----END EC PRIVATE KEY-----`,
  ].join("\n");

  it("counts every secret once, including several on one line", () => {
    const result = redactSecrets(mixed);

    expect(result.count).toBe(8);
    expect(markerCount(result.text)).toBe(8);
    expect(result.text.split("\n")[0]).toBe(
      `${TS} export GH_TOKEN=${marker("github_token")} AWS_ACCESS_KEY_ID=${marker("aws_access_key_id")} SLACK=${marker("slack_token")}`,
    );
    expect(result.text).toContain("token: ***");
  });

  it("is idempotent", () => {
    const once = redactSecrets(mixed);
    const twice = redactSecrets(once.text);

    expect(twice).toEqual({ text: once.text, count: 0 });
  });

  it("is pure: same input, same output, regex state not shared between calls", () => {
    const first = redactSecrets(mixed);
    redactSecrets(`noise ${FAKE.npm}`);
    expect(redactSecrets(mixed)).toEqual(first);
  });

  it("returns empty input unchanged", () => {
    expect(redactSecrets("")).toEqual({ text: "", count: 0 });
  });

  it("keeps a token used as the URL user whole and redacts the password after it", () => {
    const input = `https://${FAKE.githubClassic}:x-oauth-basic@github.com/example-org/app.git`;

    expect(redactSecrets(input)).toEqual({
      text: `https://${marker("github_token")}:${marker("url_password")}@github.com/example-org/app.git`,
      count: 2,
    });
  });

  it("stays idempotent, and count matches the markers added, on random mixes of secrets and context", () => {
    // Fragments chosen so that later rules (URL, header, generic) see the markers that earlier
    // rules leave behind: that is where a rule could split a marker or count a secret twice.
    const fragments = [
      ...[FAKE.githubClassic, FAKE.jwt, FAKE.awsKeyId, FAKE.slackBot, FAKE.npm, FAKE.anthropic],
      ...[FAKE.azureClientSecret, FAKE.awsSecret, FAKE.opaque, "Fake0Passw0rd", marker("token"), "***"],
      ...["https://", "postgres://", "ci", ":", "@", "/", "?", "&", "=", ": ", " ", "\n", '"', "'", '\\"'],
      ...["password", "token", "api_key", "Authorization: Bearer ", "Bearer ", "sig=", "AccountKey="],
      ...["aws_secret_access_key=", "client-key-data: ", '"auth": "', "-----BEGIN PRIVATE KEY-----"],
      ...[filler(64, "FAKEkey0+/"), "-----END PRIVATE KEY-----", "${{ secrets.X }}", `${TS} `],
    ];
    let state = 0x5eed;
    // mulberry32: a tiny seeded PRNG, so a failure always reproduces.
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < 5000; i++) {
      let input = "";
      for (let parts = 2 + Math.floor(random() * 10); parts > 0; parts--) {
        input += fragments[Math.floor(random() * fragments.length)];
      }
      const once = redactSecrets(input);

      expect(redactSecrets(once.text), JSON.stringify(input)).toEqual({ text: once.text, count: 0 });
      expect(markerCount(once.text) - markerCount(input), JSON.stringify(input)).toBe(once.count);
    }
  });
});

describe("redactSecrets: performance", () => {
  const LOG_LINES = [
    "##[group]Run npm ci",
    "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
    "added 1287 packages, and audited 1288 packages in 21s",
    "tests/test_orders.py::test_apply_discount[case-17] PASSED                [ 42%]",
    '  + resource "azurerm_storage_account" "artifacts" {',
    "      + primary_access_key = (sensitive value)",
    "deployment.apps/acme-api configured",
    "[command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --depth=1 origin",
    "  token: ***",
    "error TS2322: Type 'string' is not assignable to type 'number'. src/pricing/discount.ts(41,7)",
    "Step 7/12 : RUN npm run build && npm prune --omit=dev",
    ` ---> ${filler(64, "a1b2c3d4e5f6")}`,
  ];

  it("redacts a ~5 MB log in well under 2 s", () => {
    const lines: string[] = [];
    let size = 0;
    let planted = 0;
    for (let i = 0; size < 5 * 1024 * 1024; i++) {
      const line =
        i % 2000 === 0
          ? `${TS} export GH_TOKEN=${FAKE.githubClassic} DB_PASSWORD=Fake-Passw0rd-${i}`
          : `${TS} ${LOG_LINES[i % LOG_LINES.length]}`;
      if (i % 2000 === 0) planted += 2;
      lines.push(line);
      size += line.length + 1;
    }
    const log = lines.join("\n");

    const started = performance.now();
    const result = redactSecrets(log);
    const elapsed = performance.now() - started;

    expect(result.count).toBe(planted);
    expect(elapsed).toBeLessThan(2000);
  });

  it("stays linear on adversarial input (no catastrophic backtracking)", () => {
    const size = 1024 * 1024;
    const repeat = (unit: string) => unit.repeat(Math.ceil(size / unit.length));
    const inputs = [
      repeat("a"),
      repeat("Fake0+/"), // one huge base64-looking token
      repeat("eyJ"),
      repeat("eyJa.eyJb."),
      repeat("-----BEGIN PRIVATE KEY-----\n"),
      repeat("-----BEGIN RSA PRIVATE KEY-----"),
      repeat("https://a:"),
      repeat("a://"),
      repeat("password="),
      repeat("password: "),
      repeat('token="'),
      repeat("Authorization: Bearer "),
      repeat("sig="),
      repeat("ghp_"),
      repeat("sk-"),
      repeat("AKIA"),
      repeat("xoxb-"),
      repeat("Fak8Q~"),
      repeat(`${TS} `),
      repeat("a://u:@"),
      repeat("a://[REDACTED:x]:"),
      repeat(`a://u:${"p".repeat(255)}`),
      repeat(String.raw`\"password\":\"`),
      repeat(String.raw`client-key-data\":\"`),
    ];

    for (const input of inputs) {
      const started = performance.now();
      redactSecrets(input);
      const elapsed = performance.now() - started;
      expect(elapsed, `input starting ${JSON.stringify(input.slice(0, 24))}`).toBeLessThan(1000);
    }
  });
});

describe("withRedaction", () => {
  const repo: RepoRef = { owner: "example-org", repo: "acme-app" };
  const run: RunInfo = {
    id: 1001,
    attempt: 1,
    workflowId: 7,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "pull_request",
    headBranch: "feature/rotate-keys",
    headSha: "4f1c2a9e0000000000000000000000000000beef",
    headRepoFullName: "example-org/acme-app",
    isFork: false,
    defaultBranch: "main",
    conclusion: "failure",
    htmlUrl: "https://github.com/example-org/acme-app/actions/runs/1001",
    displayTitle: `Rotate ${FAKE.githubClassic} in deploy config`,
    pullRequestNumbers: [42],
    createdAt: "2026-11-24T10:15:00Z",
  };
  const jobs: JobInfo[] = [
    {
      id: 5001,
      name: "test",
      status: "completed",
      conclusion: "failure",
      startedAt: null,
      completedAt: null,
      runnerLabels: ["ubuntu-latest"],
      htmlUrl: null,
      steps: [],
    },
  ];
  const secretPath = `fixtures/${FAKE.githubClassic}.json`;
  const files: ChangedFile[] = [
    {
      path: secretPath,
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: `@@ -1 +1 @@\n-DB_PASSWORD=Old-Fake-Passw0rd\n+DB_PASSWORD=New-Fake-Passw0rd`,
      previousPath: null,
    },
    { path: "assets/logo.png", status: "added", additions: 0, deletions: 0, patch: null, previousPath: null },
  ];
  const history: JobHistoryEntry[] = [];
  const directory = ["src/", `${FAKE.npm}.txt`];

  class StubBackend implements TriageBackend {
    readonly repo = repo;
    getRun = async () => run;
    listJobs = async () => jobs;
    getJobLog = async (jobId: number) => `${TS} job ${jobId} token=${FAKE.opaque}`;
    readFile = async (path: string) => (path === "missing" ? null : `NPM_TOKEN=${FAKE.npm}\n`);
    listDirectory = async () => directory;
    getChangedFiles = async () => files;
    getJobHistory = async () => history;
  }

  it("redacts logs, file contents, patches and the run title", async () => {
    const backend = withRedaction(new StubBackend());

    expect(await backend.getJobLog(5001)).toBe(`${TS} job 5001 token=${marker("token")}`);
    expect(await backend.readFile(".npmrc", "main")).toBe(`NPM_TOKEN=${marker("npm_token")}\n`);
    expect((await backend.getRun()).displayTitle).toBe(`Rotate ${marker("github_token")} in deploy config`);

    const [changed, binary] = await backend.getChangedFiles();
    expect(changed?.patch).toBe(
      `@@ -1 +1 @@\n-DB_PASSWORD=${marker("password")}\n+DB_PASSWORD=${marker("password")}`,
    );
    expect(changed?.path).toBe(secretPath);
    expect(binary).toEqual(files[1]);
  });

  it("passes everything else through unchanged", async () => {
    const backend = withRedaction(new StubBackend());

    expect(backend.repo).toBe(repo);
    expect(await backend.listJobs()).toBe(jobs);
    expect(await backend.listDirectory("", "main")).toBe(directory);
    expect(await backend.getJobHistory("test", 10)).toBe(history);
    expect(await backend.readFile("missing", "main")).toBeNull();

    const { displayTitle, ...rest } = await backend.getRun();
    const { displayTitle: _original, ...originalRest } = run;
    expect(displayTitle).not.toBe(run.displayTitle);
    expect(rest).toEqual(originalRest);
    expect(backend.redactionCount).toBe(1);
  });

  it("keeps a null run title null", async () => {
    const inner = new StubBackend();
    inner.getRun = async () => ({ ...run, displayTitle: null });

    expect((await withRedaction(inner).getRun()).displayTitle).toBeNull();
  });

  it("does not mutate what the inner backend returned", async () => {
    await withRedaction(new StubBackend()).getChangedFiles();
    expect(files[0]?.patch).toContain("Old-Fake-Passw0rd");
  });

  it("accumulates redactionCount across calls", async () => {
    const backend = withRedaction(new StubBackend());
    expect(backend.redactionCount).toBe(0);

    await backend.getJobLog(1);
    await backend.getJobLog(2);
    await backend.readFile(".npmrc", "main");
    await backend.getChangedFiles();
    await backend.getRun();
    await backend.listJobs();

    expect(backend.redactionCount).toBe(6);
  });

  it("calls the inner backend's methods on the backend itself, so prototype methods keep `this`", async () => {
    class PrototypeBackend implements TriageBackend {
      readonly repo = repo;
      readonly #log = `${TS} DB_PASSWORD=Fake-Passw0rd-123`;
      readonly #jobs = jobs;
      async getRun(): Promise<RunInfo> {
        return run;
      }
      async listJobs(): Promise<JobInfo[]> {
        return this.#jobs;
      }
      async getJobLog(): Promise<string> {
        return this.#log;
      }
      async readFile(): Promise<string | null> {
        return this.#log;
      }
      async listDirectory(): Promise<string[] | null> {
        return directory;
      }
      async getChangedFiles(): Promise<ChangedFile[]> {
        return files;
      }
      async getJobHistory(): Promise<JobHistoryEntry[]> {
        return history;
      }
    }
    const backend = withRedaction(new PrototypeBackend());

    expect(await backend.getJobLog(1)).toBe(`${TS} DB_PASSWORD=${marker("password")}`);
    expect(await backend.readFile("ci.env", "main")).toBe(`${TS} DB_PASSWORD=${marker("password")}`);
    expect(await backend.listJobs()).toBe(jobs);
  });

  it("propagates errors from the inner backend unchanged", async () => {
    const failure = new Error("GET /actions/jobs/5001/logs: 410 Gone");
    const inner = new StubBackend();
    inner.getJobLog = async () => {
      throw failure;
    };
    inner.listJobs = async () => {
      throw failure;
    };
    const backend = withRedaction(inner);

    await expect(backend.getJobLog(5001)).rejects.toBe(failure);
    await expect(backend.listJobs()).rejects.toBe(failure);
    expect(backend.redactionCount).toBe(0);
  });
});

describe("withRedaction + ANSI", () => {
  it("redacts a token that colour codes split apart in the raw log", async () => {
    const token = ["ghp", "_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"].join("");
    const raw = `2026-11-20T09:14:03.1234567Z export GH_TOKEN=${token.slice(0, 10)}\u001b[0m${token.slice(10)}\n`;
    const backend = withRedaction({
      repo: { owner: "example-org", repo: "demo" },
      getRun: async () => {
        throw new Error("unused");
      },
      listJobs: async () => [],
      getJobLog: async () => raw,
      readFile: async () => null,
      listDirectory: async () => null,
      getChangedFiles: async () => [],
      getJobHistory: async () => [],
    });
    const log = await backend.getJobLog(1);
    expect(log).not.toContain(token);
    expect(log).toContain("[REDACTED:");
    expect(backend.redactionCount).toBeGreaterThan(0);
  });
});
