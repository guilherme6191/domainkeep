# Local development

How to run the project on your machine, including the one-time Clerk and Supabase setup. If someone has already given you a filled-in `.env.local`, the first section is all you need.

## Run it

Requires **Node 20+** and **pnpm**.

```bash
pnpm install
cp .env.example .env.local   # 1. fill in your credentials (see below)
pnpm db:migrate              # 2. create the schema
pnpm dev                     # 3. http://localhost:3000
```

Then sign up, add a domain you control, publish the TXT record it shows you, and click **Verify domain**. The check is a real public DNS lookup, so it has to be a domain whose zone you can edit.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm db:migrate` | Apply `supabase/migrations` over `DIRECT_URL` |
| `pnpm build` | Production build |
| `pnpm test` | Vitest suite |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

## Set up Clerk

Clerk handles sign-up and sign-in. A free application is enough.

1. In the [Clerk dashboard](https://dashboard.clerk.com), create an application. Email is enough for sign-in; add whatever else you like.
2. Open **API Keys** and copy both values into `.env.local`:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
   CLERK_SECRET_KEY=sk_test_…
   ```

3. Open **Integrations → Supabase**, choose the defaults, and select **Activate Supabase integration**. Copy the **Clerk domain** it shows; the Supabase steps below need it.

The app serves `/sign-in` and `/sign-up` itself, and the two redirect variables in `.env.example` already point at them.

## Set up Supabase

Supabase provides the Postgres database. A free project is enough.

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project. It asks for a database password — save it, it is not shown again.
2. Open **Authentication → Sign In / Providers**, select **Add provider**, choose **Clerk**, and paste the Clerk domain from above. This is what lets Supabase verify Clerk session tokens.
3. Copy three values into `.env.local`: the project URL from **Project Settings → Data API**, and the publishable and secret keys from **Project Settings → API Keys**. The secret key is server-only; it never gets a `NEXT_PUBLIC_` prefix.

   ```
   SUPABASE_URL=https://….supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   SUPABASE_SECRET_KEY=sb_secret_…
   ```

4. Click **Connect** at the top of the page, then the **ORMs** tab, then **Prisma**. Copy the `DIRECT_URL` it prints into `.env.local` and replace `[YOUR-PASSWORD]` with the password from step 1. Only migrations use it.

   ```
   DIRECT_URL=…pooler.supabase.com:5432/postgres
   ```

5. Run `pnpm db:migrate`.

## Environment reference

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Already set in `.env.example`; the app serves both pages. |
| `SUPABASE_URL` | Supabase → Project Settings → Data API |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys. Server only. |
| `DIRECT_URL` | Supabase → Connect → ORMs → Prisma, session pooler (5432). Migrations only. |
| `RESEND_API_KEY` | Resend dashboard → API Keys. Optional: without it the takeover email is skipped. Server only. |
| `RESEND_FROM` | An address on a domain verified in your Resend account. `onboarding@resend.dev` works but only delivers to your own address. |
| `NEXT_PUBLIC_APP_URL` | Base for the link in the takeover email. Defaults to the request origin locally. |

`.env.local` is git-ignored. Never commit the filled-in file.

## Notes

- `pnpm db:migrate` runs `supabase/migrations` in name order over `DIRECT_URL` and is safe to re-run.
- If the database password contains `@`, `:`, `/`, `?`, or `#`, percent-encode it in `DIRECT_URL` (`@` becomes `%40`).
- At runtime the app never opens a database connection. Reads go through Supabase's Data API with the signed-in user's Clerk token, so row-level security decides what each request sees; writes use the secret key. The [technical specification](docs/domain-verification-technical-spec.md#authorization) explains why.
