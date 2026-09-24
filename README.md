# Chef2Box — Suivi nutritionnel (V1)

Web app de suivi macro pour les clients Chef2Box : dashboard calories/macros,
3 modes d'ajout de repas (scan étiquette Chef2Box, scan code-barres commerce,
saisie manuelle), photo par repas, historique, messagerie avec Swann, et
côté admin la possibilité de pré-remplir la box du jour de chaque client à
partir de sa commande connue.

Hors scope V1 : paiement, facturation automatique, commande en ligne.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage, Realtime)
- Open Food Facts (API publique, gratuite, sans clé) pour les codes-barres commerce
- `html5-qrcode` pour la lecture caméra (QR Chef2Box + codes-barres)

## Mise en route

### 1. Installer les dépendances

```bash
npm install
```

### 2. Brancher un projet Supabase

Vous pouvez réutiliser le projet Supabase déjà connecté aux outils
`chef2box-questionnaire` / `chef2box-cuisine`, ou en créer un nouveau dédié à
cette app.

1. Dans le **SQL Editor** de votre projet Supabase, exécutez tout le
   contenu de [`supabase/schema.sql`](./supabase/schema.sql). Le script est
   idempotent (`if not exists` partout) : si les tables `clients` / `plats`
   existent déjà avec d'autres colonnes, adaptez le script avant de l'exécuter.
2. Copiez `.env.example` vers `.env.local` et renseignez :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API dans le dashboard Supabase)

### 3. Créer les comptes

Il n'y a pas d'auto-inscription (accès réservé aux clients Chef2Box) :

1. Dans **Authentication → Users** du dashboard Supabase, créez un utilisateur
   par client (email + mot de passe, ou lien d'invitation).
2. Pour chaque utilisateur créé, ajoutez la ligne correspondante dans la
   table `clients` (même `id` que l'utilisateur Auth) avec ses objectifs
   caloriques/macros et son palier.
3. Pour **votre** compte admin (Swann), mettez `est_admin = true` sur votre
   ligne `clients`.

### 4. Lancer en local

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## Déploiement

Le projet est un Next.js standard : déployable sur Netlify (comme les autres
outils Chef2Box) ou Vercel. Pensez à renseigner les mêmes variables
d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
dans les paramètres du site de déploiement.

## Structure

```
src/
  app/
    login/          Connexion (Supabase Auth)
    dashboard/       Dashboard client (anneau calories, box du jour, journal)
    history/         Historique des repas par jour
    messages/         Messagerie client <-> admin
    admin/           Assignation de la box du jour par client (Swann)
  components/         CalorieRing, MacroBar, AddMealModal (3 modes), Scanner...
  lib/
    supabase/         Clients Supabase (browser/server)
    openfoodfacts.ts  Recherche produit par code-barres
    aliments-populaires.ts  Base d'aliments courants pour la saisie manuelle
supabase/
  schema.sql          Tables, RLS, bucket photos, realtime
```

## Notes pour la V2 (hors scope V1)

Les tables `commandes` et `factures` posent déjà la base pour la commande en
ligne et la facturation automatique, sans rien casser côté V1.
