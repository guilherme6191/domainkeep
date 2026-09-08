# Domain Ownership Verification

DomainKeep is a domain claiming product, built for the [Resend Product Engineer challenge](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153). A user enters a domain they control, publishes one TXT record at that name with the value `resend-verify=<token>` (the UI calls it a code), and asks for a check. The backend performs at most one DNS lookup per request and answers with a specific, actionable result — verified, record not found, value mismatch, or a temporary DNS failure — rather than a generic pass/fail.

A verified claim can be superseded by another account's fresh DNS proof.

**Live app:** [https://domainkeep.vercel.app](https://domainkeep.vercel.app) — sign up with any email, add a domain whose DNS you can edit, and follow the on-screen instructions.

**Demo video:** TBD

## How failure and recovery work

The challenge asks for a workflow a user can understand, watch fail, and fix. Three choices carry that:

- **Each outcome names its fix.** Record not found, value mismatch, and DNS not answering are separate states with separate next steps: check the name, compare the value, or wait and retry. A mismatch shows the expected value beside what DNS actually returned.
- **Retrying keeps the code; replacing it is deliberate.** Check again reuses the token until expiry. A missing record may need time or a configuration correction, not a new code. Generate a new code is a separate action that invalidates the old value.
- **Losing a domain isn't silent.** When another account proves control, the previous holder's claim turns Superseded in their list so they don't lose track of it and they receive an email, sent with Resend, linking to that claim. If they still control the DNS, they generate a new code and verify again to take it back. Copy across the page guides users to resolve ownership issues with the Domain owner as well.

## Tradeoffs and limitations

- **Authentication is required, through Clerk.** Although optional for the challenge, durable accounts and user objects are what a domain/user association hangs on: they make competing claims meaningful and give the previous holder somewhere to receive feedback. Clerk keeps that overhead out of the exercise. The cost is a sign-up step before anything else; open email sign-up keeps it from becoming a barrier for reviewers.
- **One TXT record, at the exact name claimed.** Exact-name verification supports delegated subdomains and keeps the proof unambiguous. The cost is that verifying a parent does not cover its children, and users need enough DNS knowledge to place the record correctly; the record card shows both the provider-style name and the full hostname to close that gap.
- **A newer proof takes the domain over, and neither side learns who.** Fresh DNS proof supports ownership changes, team migrations, and agency handoffs without support tickets. The cost is that people sharing DNS access can transfer a domain back and forth. Both sides are told: the winner sees a takeover note, the previous holder sees a superseded claim and gets an email through Resend. Neither learns the other's identity: the product resolves control, not intent. Transfer cooldowns and dispute handling are deferred. If there is an accidental takeover, it's easy to recuperate, especially without server side polling that, with DNS propagation slowness, could happen at unpredicted times (more details below).
- **Verification is point in time.** A check records control at that moment, and the TXT record is not required afterwards, so users can clean up their zone. The cost is that a claim stays verified after DNS control is lost until someone deletes it or proves control anew. Automatic rechecks and revocation rules are deferred.
- **No polling server-side.** Users check when they are ready, and a check records control at that moment. Server-side polling would be a good next step for setup UX, but it would also let takeovers land unattended — a propagation delay resolving at 3am transfers a domain with nobody watching. Even with the email notice, that hurts the disclosure and easy-recovery premise the takeover model was created on. The cost is that slow DNS propagation can hurt the UX, but that's minimized with a simple TXT check that's usually fast, and retries are cheap.
- **Correction is narrow, deletion is final.** A domain can be edited only while it has never verified, which covers the typo case; after that, the user deletes it and adds the corrected one. Deletion is immediate and permanent, so a verified domain is free again at once. The cost is that no history survives.
- **No rate limiting or attempt history.** Checks are unbounded and only the latest result is kept. Both are deferred: they would add complexity without much value for this exercise.

## Claim states

The claim view has seven states, derived from durable fields in the order shown: the first row whose condition holds wins, so the stored facts remain the source of truth.

| State | Derived when | Meaning and next action |
| --- | --- | --- |
| `superseded` | `supersededAt` is set and `tokenExpiresAt <= supersededAt` | Another account proved control and invalidated this challenge. Generate a new code to try again. |
| `verified` | `verifiedAt` is set and `supersededAt` is null | This account currently holds the association. Nothing else is required. |
| `expired` | `tokenExpiresAt <= now` | The pending challenge is no longer valid. Generate a new code. |
| `setup_required` | `lastCheck` is null | Not checked yet, never *failed*. Adding a domain runs no lookup. |
| `record_not_found` | `lastCheck.result` is `record_not_found` | No `resend-verify=` value answered at the name. Check the name and the prefix, wait, and retry. |
| `value_mismatch` | `lastCheck.result` is `value_mismatch` | A `resend-verify=` value exists but none matches. Compare, correct, and retry. |
| `temporary_dns_error` | `lastCheck.result` is `temporary_dns_error` | DNS did not respond reliably. Retry without changing the record. |

`superseded` comes first because it can coexist with a historical `verifiedAt`; once the owner generates a new code, the claim is an ordinary pending one again.

The domains list collapses these into four badges by next action: Verified, Unchecked, Needs attention (the three diagnostic states and expired, never called "failed" because the cause might be propagation - the goal at the list is to know which ones need attention for further action and it's based on progressive disclosure, and to make it scannable easily), and Superseded, which stays separate as the previous holder's in-app takeover signal. The detail page names the exact state.

## Architecture

Next.js App Router · TypeScript · TanStack Query · Clerk · Supabase Postgres · Resend · Tailwind + shadcn/ui · Vercel. One deployment holds both halves. The frontend uses TanStack Query against `/api/claims` and renders server-derived claim state; it never decides that a domain is verified.

```text
src/lib/domain.ts        # normalization, one implementation shared by browser and server
src/lib/claim-state.ts   # the derived state ladder and the definition of "currently verified"
src/lib/dns/             # resolver adapter (the seam tests replace) and the pure classifier
src/lib/db/claims.ts     # every query
src/lib/mail/            # the Resend mailer and the takeover-notice composition
src/app/api/claims/      # the HTTP boundary
supabase/migrations/     # table, constraints, row-level security, the reassignment function, and the takeover-notice marker
```

The exclusivity rule lives in Postgres, not in application code: a partial unique index on `normalized_domain` where the claim is currently verified, and a `verify_domain_claim` function that supersedes the previous holder and expires its token in the same transaction, after the backend has verified the DNS proof.

### Routes

| Route | What it's for |
| --- | --- |
| `GET /api/claims?page=N&pageSize=M` | One page of your domains, newest first, with the true total. |
| `POST /api/claims` | Add a domain and issue its TXT challenge. Never checks DNS. Idempotent per account and domain. |
| `DELETE /api/claims` | Remove the selected claims in one owner-filtered statement. |
| `GET /api/claims/:id` | One claim, with its derived state. |
| `PATCH /api/claims/:id` | Fix a typo in the domain. Refused once the claim has ever verified. |
| `POST /api/claims/:id/verify` | At most one DNS lookup. Transfers any existing association on valid proof. |
| `POST /api/claims/:id/replace-token` | Generate a new code, on purpose or after expiry. |
| `DELETE /api/claims/:id` | Remove the claim. A verified domain becomes free again. |

The list is paged from the URL (40 rows by default, 80 or 120 on request), so a page is a shareable address and a reload lands where you were. Rows can be selected per page and deleted together; the confirmation says how many of them are verified, because those release their domains.

## Running locally

```bash
pnpm install
cp .env.example .env.local   # 1. fill in your credentials
pnpm db:migrate              # 2. create the schema
pnpm dev                     # 3. http://localhost:3000
```

Then sign up, add a domain you control, publish the TXT record it shows you, and click **Verify domain**. The check is a real public DNS lookup, so it has to be a domain whose zone you can edit.

No credentials yet? The [local development guide](LOCAL-DEVELOPMENT.md) walks through creating the free Clerk application and Supabase project the app needs, and lists every variable in `.env.local`.

## Testing

```bash
pnpm test        # vitest
pnpm typecheck
pnpm lint
```

- **Pure functions, tested directly.** Domain normalization, DNS classification, the state ladder, pagination, and the takeover notice.
- **Routes, tested at the HTTP boundary.** Session, repository, DNS resolver, and mailer are stubbed; there is no test database. Highlights: every classified outcome, the 404-never-403 rule, a takeover that must succeed even when the email fails, and the races between editing, verifying, and deleting.
- **Components, rendered to static markup.** The claim detail and its recovery paths: not-found versus retryable errors, copy failure, failed deletion, and a verified claim that never shows a record or a struck-through value.

## Further reading

| Document | What it covers |
| --- | --- |
| [Challenge description](https://resend.notion.site/Product-engineer-36dc40d6c4ef80d5a962f37bbd39c153) | The original Resend prompt. |
| [Local development](LOCAL-DEVELOPMENT.md) | Running the app locally, with the Clerk and Supabase setup and the environment reference. |
| [docs/](docs/) | Product brief and technical specification: principles, scope, API contracts, state modeling, persistence, and security. |
