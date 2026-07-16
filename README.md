# EventGalo

Monorepo pnpm/turbo pour la billetterie EventGalo.

## Structure

- `apps/api` — API [Hono](https://hono.dev/) sur Cloudflare Workers (D1, KV, R2, Durable Objects)
- `apps/web` — App [Next.js 15](https://nextjs.org/) déployée sur Cloudflare via [OpenNext](https://opennext.js.org/cloudflare)
- `packages/shared` — Types et utilitaires partagés

## Prérequis

- Node.js
- pnpm (`packageManager` défini dans `package.json`)
- Un compte Cloudflare avec Wrangler authentifié (`wrangler login`)

## Installation

```bash
pnpm install
```

## Développement

```bash
pnpm dev
```

## Déploiement

```bash
pnpm deploy
```

Déploie `apps/api` et `apps/web` via Turbo. Chaque app peut aussi être déployée individuellement :

```bash
pnpm --filter @eventgalo/api deploy
pnpm --filter @eventgalo/web deploy
```

### Secrets

Configurer via `wrangler secret put <NOM>` dans le répertoire de l'app concernée :

- `apps/api` : `TICKET_SIGNING_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Sans `RESEND_API_KEY`/`EMAIL_FROM`, les emails ne sont pas envoyés (liens magiques exposés via `debug_url`)
- Sans les clés Stripe, les paiements sont désactivés (billets gratuits uniquement)

## Migrations base de données

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
```
