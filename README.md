# MyToolbox

AI-powered lesson planning for Zambian teachers.

## Production stack
- Next.js frontend
- Express API
- PostgreSQL + Prisma
- DeepSeek for lesson generation
- Lipila for mobile-money subscriptions
- Resend for password-reset email delivery

## Local development

Frontend:
```bash
npm install
npm run dev
```

Backend:
```bash
cd backend
npm install
npx prisma generate
npm run dev
```

Copy `backend/.env.example` to `backend/.env` and configure the values. Never commit secrets.

## Production deployment
1. Provision PostgreSQL with backups.
2. Configure every variable in `backend/.env.example` in your hosting provider.
3. Run `npx prisma migrate deploy` against the production database.
4. Deploy the API on a Node.js 20+ host and expose `/api/health`.
5. Deploy the Next.js frontend and set `NEXT_PUBLIC_API_URL` to the public API URL.
6. Configure Lipila's webhook to `https://YOUR_API_HOST/api/payments/webhook`.
7. Configure a verified Resend sending domain for password resets.
8. Keep `ALLOW_MOCK_MODE=false` in production.

A Dockerfile is provided for each service and `docker-compose.yml` can be used for container-based deployment.
