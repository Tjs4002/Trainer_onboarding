# Trainer Onboarding

A standalone Cloudflare Worker that serves a public onboarding form and stores
submissions. Collected per person:

- Region / district
- Full name
- Photo (upload)
- Postal address + pincode
- Live location (browser geolocation, captured at submit)
- Has a laptop (yes / no)
- Social handles (Instagram, Facebook, X) — optional
- Bank details: account number, IFSC, and a passbook page / cancelled cheque (upload)

It is a **separate project** from `maha-olympiad-ops`: its own Worker, D1
database, R2 bucket and deploy. It shares no data with the ops app.

## ⚠️ Data sensitivity — read first

By design (per project decision) this build is:

- **A fully public form.** Anyone with the URL can submit. There is no login,
  invite or phone verification on the submitter.
- **Plaintext bank details.** Account number and IFSC are stored in D1 exactly
  as entered, not encrypted.

The **only** access control on the collected data is:

1. The D1 database and R2 bucket are private to your Cloudflare account.
2. The admin view (`/admin`) and the file-download endpoints require a secret
   `ADMIN_TOKEN`.

So: keep `ADMIN_TOKEN` secret, give it only to staff who need it, and do not
make the R2 bucket public. If you later want encryption at rest or a verified
submitter, that is a code change — ask and it can be added.

## Layout

```
src/index.ts         Worker: /api/submit, /api/admin/*
public/index.html    the form        (+ form.js, styles.css)
public/admin.html    admin table     (+ admin.js)
migrations/0000_init.sql   submissions table
wrangler.jsonc       bindings + vars
```

Static files in `public/` are served directly; the Worker only handles
`/api/*`.

## Endpoints

| Method | Path                               | Auth         | Purpose                         |
| ------ | ---------------------------------- | ------------ | ------------------------------- |
| POST   | `/api/submit`                      | none         | accept one form submission      |
| GET    | `/api/admin/submissions`           | admin token  | list all submissions (JSON)     |
| GET    | `/api/admin/file/:id/:kind`        | admin token  | stream a file (`photo`/`passbook`) |

Admin auth: send `Authorization: Bearer <ADMIN_TOKEN>`, or `?token=<ADMIN_TOKEN>`
for links the browser opens directly (the admin page uses both).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # then set ADMIN_TOKEN
npm run db:apply:local                # create the local D1 table
npm run dev                           # http://localhost:8787
```

The form is at `/`, the admin view at `/admin`.

## First-time Cloudflare setup

Run these once, logged in to the target account (`npx wrangler login`).

1. **Create the D1 database** and paste the printed `database_id` into
   `wrangler.jsonc` (replace `REPLACE_WITH_D1_DATABASE_ID`):

   ```bash
   npx wrangler d1 create trainer-onboarding
   ```

2. **Create the R2 bucket:**

   ```bash
   npx wrangler r2 bucket create trainer-onboarding-uploads
   ```

3. **Apply the migration to the remote database:**

   ```bash
   npm run db:apply:remote
   ```

4. **Set the admin token** (choose a long random string):

   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```

5. **Deploy:**

   ```bash
   npm run deploy
   ```

   Wrangler prints a `*.workers.dev` URL — that is your live form. Share that
   URL with trainers; open `<url>/admin` yourself to review submissions.

## Custom domain (optional)

Uncomment the `routes` block in `wrangler.jsonc`, set your own hostname and its
Cloudflare zone, then `npm run deploy` again. The domain must be on Cloudflare.

## Changing the max upload size

`MAX_UPLOAD_BYTES` in `wrangler.jsonc` (default 5 MB). Cloudflare's own request
body limit on the free plan is 100 MB, so keep it well under that.
