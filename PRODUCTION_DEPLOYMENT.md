# MyToolbox production deployment

## 1. Database
Use managed PostgreSQL. Set `DATABASE_URL` in the backend environment.
Run:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Do **not** run `prisma db push --accept-data-loss` in production.

## 2. Backend environment
Copy `backend/.env.example` into the hosting provider's environment settings and replace every placeholder.

Required in production:
- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET` (32+ random characters)
- `FRONTEND_URLS`
- `BACKEND_URL`
- `DEEPSEEK_API_KEY`
- `LIPILA_API_KEY`
- `ADMIN_EMAILS`
- `ALLOW_MOCK_MODE=false`
- `RESEND_API_KEY` and `RESEND_FROM` for password-reset emails

## 3. Frontend
Set `NEXT_PUBLIC_API_URL` to the public backend URL in Vercel Production environment variables.

## 4. Admin
Do not use a frontend password. Put the administrator email in `ADMIN_EMAILS`, then sign in normally. The API checks the database role before returning admin data.

## 5. Payments
The mock payment endpoint has been removed. Configure Lipila credentials and verify the webhook contract/secret with the payment provider before accepting live money.

## 6. AI
Mock lesson generation is disabled unless `ALLOW_MOCK_MODE=true`. Keep it false in production. Without a valid DeepSeek key, the API returns a controlled 503 instead of fabricating a lesson.

## 7. Smoke tests
Before launch, verify:
- health endpoint returns database `ok`
- registration and login work
- `/api/auth/me` works with the issued token
- free user can generate up to the configured limit
- AI generation uses the real provider
- lesson and scheme records persist
- exports download successfully
- Lipila payment initiation works in sandbox/live according to provider settings
- webhook changes payment to completed exactly once
- subscription status changes after confirmed payment
- non-admin users receive 403 from admin endpoints

## 8. Deployment artifacts
The repository includes Dockerfiles for both the Next.js frontend and Express/Prisma API, plus a production-oriented `docker-compose.yml`. For Vercel + managed backend, deploy the frontend separately and set `NEXT_PUBLIC_API_URL` to the public API origin.

## 9. Production configuration rules
- Never commit `.env` files or provider secrets.
- Use a managed PostgreSQL database with automated backups.
- Configure the Lipila webhook URL as `https://YOUR_API_HOST/api/payments/webhook`.
- Configure Resend with a verified sending domain before enabling password resets.
- Keep `ALLOW_MOCK_MODE=false`; the application must not fabricate lessons or payments in production.
