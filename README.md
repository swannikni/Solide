# Chef2Box Appli — Suivi nutritionnel (V1)

Nom du projet (npm / Netlify) : `chef2box-appli`, pour le distinguer des
autres projets Chef2Box (`chef2box`, `chef2box-cuisine`,
`chef2box-questionnaire`, `chef2box-client`).

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

L'appli utilise le **même projet Supabase** que `chef2box-questionnaire` et
`chef2box-cuisine`. Tout ce qui lui appartient est préfixé `application_`
(tables `application_clients`, `application_plats`, `application_commandes`,
`application_repas_journal`, `application_messages`, `application_factures`,
bucket photos `application-repas-photos`) : les tables des autres outils ne
sont jamais touchées.

1. Dans le **SQL Editor** du projet Supabase, exécutez tout le contenu de
   [`supabase/schema.sql`](./supabase/schema.sql). Le script peut être relancé
   sans risque.
2. Copiez `.env.example` vers `.env.local` et renseignez :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API dans le dashboard Supabase)

### 2 bis. Importer la base d'aliments (CIQUAL)

La table `application_aliments` est remplie avec la table Ciqual 2020 de
l'ANSES (3 178 aliments, macros pour 100 g), convertie dans
[`supabase/data/aliments_ciqual_2020.json`](./supabase/data/aliments_ciqual_2020.json).
Pour la réimporter, dans le SQL Editor :

```sql
create extension if not exists http with schema extensions;

insert into public.application_aliments (code_ciqual, nom, groupe, calories, proteines, glucides, lipides, nom_normalise)
select code, nom, groupe, calories, proteines, glucides, lipides, lower(extensions.unaccent(nom))
from extensions.http_get('https://raw.githubusercontent.com/swannikni/Solide/8aa59b0e60768e09e1f8c774341e46ae461df063/supabase/data/aliments_ciqual_2020.json') r,
     jsonb_to_recordset(r.content::jsonb) as x(code text, nom text, groupe text, calories numeric, proteines numeric, glucides numeric, lipides numeric)
on conflict (code_ciqual) do nothing;

drop extension http;
```

### 2 ter. Activer l'assistant IA

L'onglet « Assistant » utilise Claude Haiku 4.5 (Anthropic) via la route
serveur `/api/assistant` (30 questions par client et par jour). Il lui faut
une clé API Anthropic (console.anthropic.com → API Keys), à déclarer
uniquement côté serveur dans les variables d'environnement Netlify :
`ANTHROPIC_API_KEY` (jamais préfixée `NEXT_PUBLIC_`). Sans clé, l'onglet
affiche « L'assistant n'est pas encore activé ».

### 3. Créer les comptes

Il n'y a pas d'auto-inscription (accès réservé aux clients Chef2Box) :

1. Dans **Authentication → Users** du dashboard Supabase, créez un utilisateur
   par client (email + mot de passe, ou lien d'invitation).
2. Pour chaque utilisateur créé, ajoutez la ligne correspondante dans la
   table `application_clients` (même `id` que l'utilisateur Auth) avec ses
   objectifs caloriques/macros et son palier.
3. Pour **votre** compte admin (Swann), mettez `est_admin = true` sur votre
   ligne `application_clients`.

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
