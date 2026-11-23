# notify-service

Fans inbound webhook events out to email and Slack.

```bash
npm ci
npm run dev        # http://localhost:8080
npm test
```

`POST /v1/webhooks/notify` accepts `{ event, template, recipient: { email? , slackChannel? }, data? }`
and returns `202 { id }`.
