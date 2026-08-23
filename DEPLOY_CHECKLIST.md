# MyToolbox production launch checklist

- [ ] Create managed PostgreSQL database and backup policy.
- [ ] Set all backend environment variables from `backend/.env.example`.
- [ ] Generate a strong 32+ character JWT secret.
- [ ] Configure DeepSeek production API key.
- [ ] Configure Lipila API key and webhook secret.
- [ ] Set `BACKEND_URL` to the public HTTPS API origin.
- [ ] Set `FRONTEND_URLS` to the exact HTTPS frontend origin(s).
- [ ] Configure Resend API key and a verified `RESEND_FROM` address.
- [ ] Set `ADMIN_EMAILS` to the administrator account email(s).
- [ ] Keep `ALLOW_MOCK_MODE=false`.
- [ ] Deploy backend and run `npx prisma migrate deploy`.
- [ ] Confirm `GET /api/health` returns database `ok`.
- [ ] Set frontend `NEXT_PUBLIC_API_URL` to the public backend URL.
- [ ] Deploy frontend.
- [ ] Test registration, login, password reset, lesson generation, scheme generation and exports.
- [ ] Test a Lipila sandbox transaction and webhook idempotency before live payments.
- [ ] Verify non-admin accounts receive HTTP 403 from admin endpoints.
- [ ] Enable monitoring, logs, database backups and uptime alerts.
