-- Chef2Box - Suivi nutritionnel - Schéma V1
-- A exécuter dans le SQL Editor de votre projet Supabase.
-- Utilise "if not exists" partout : si vous branchez ce projet sur le Supabase
-- déjà utilisé par le questionnaire / l'outil cuisine, les tables clients/plats
-- existantes ne seront pas écrasées. Adaptez les noms de colonnes si elles
-- diffèrent déjà chez vous.

-- ============ CLIENTS ============
-- Un client = une ligne, liée à un utilisateur Supabase Auth (vrai login,
-- plus d'accès par lien+id).
create table if not exists public.clients (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  telephone text,
  palier text check (palier in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6')),
  objectif_calories int not null default 2000,
  objectif_proteines int not null default 150,
  objectif_glucides int not null default 200,
  objectif_lipides int not null default 65,
  est_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ PLATS (menu Chef2Box) ============
-- Macros exactes pré-enregistrées par Swann, une fois pour toutes.
-- qr_code = identifiant unique scanné sur l'étiquette du plat.
create table if not exists public.plats (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  qr_code text unique not null,
  calories int not null,
  proteines numeric not null,
  glucides numeric not null,
  lipides numeric not null,
  photo_url text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ COMMANDES ============
-- La commande connue d'un client pour un jour/repas donné (déjeuner/dîner).
-- C'est elle qui permet à l'admin de pré-remplir la "box du jour" sans
-- ressaisir les macros à la main.
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  plat_id uuid references public.plats (id),
  date_livraison date not null,
  repas_type text not null check (repas_type in ('dejeuner', 'diner')),
  statut text not null default 'confirmee' check (statut in ('confirmee', 'annulee', 'livree')),
  created_at timestamptz not null default now(),
  unique (client_id, date_livraison, repas_type)
);

-- ============ REPAS_JOURNAL ============
-- Chaque repas réellement ajouté par (ou pour) un client, quel que soit le mode :
-- scan Chef2Box, code-barres commerce, ou saisie manuelle.
create table if not exists public.repas_journal (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date date not null default current_date,
  repas_type text not null check (repas_type in ('petit_dejeuner', 'dejeuner', 'diner', 'collation')),
  source text not null check (source in ('chef2box', 'code_barres', 'manuel')),
  nom text not null,
  quantite numeric not null default 1,
  calories int not null,
  proteines numeric not null,
  glucides numeric not null,
  lipides numeric not null,
  photo_url text,
  plat_id uuid references public.plats (id),
  commande_id uuid references public.commandes (id),
  cree_par text not null default 'client' check (cree_par in ('client', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists repas_journal_client_date_idx on public.repas_journal (client_id, date);

-- ============ MESSAGES ============
-- Messagerie directe client <-> Swann (admin).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  expediteur text not null check (expediteur in ('client', 'admin')),
  contenu text not null,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_client_idx on public.messages (client_id, created_at);

-- ============ FACTURES ============
-- Hors scope V1 (paiement/commande en ligne repoussés en V2), table posée
-- pour ne pas re-designer le modèle de données plus tard.
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  periode_debut date not null,
  periode_fin date not null,
  montant numeric not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'payee', 'annulee')),
  created_at timestamptz not null default now()
);

-- ============ STORAGE ============
-- Bucket pour les photos de repas (public en lecture pour affichage simple,
-- écriture restreinte par policy ci-dessous).
insert into storage.buckets (id, name, public)
values ('repas-photos', 'repas-photos', true)
on conflict (id) do nothing;

-- ============ ROW LEVEL SECURITY ============
alter table public.clients enable row level security;
alter table public.plats enable row level security;
alter table public.commandes enable row level security;
alter table public.repas_journal enable row level security;
alter table public.messages enable row level security;
alter table public.factures enable row level security;

-- Un client ne voit/modifie que sa propre ligne ; un admin voit tout.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select est_admin from public.clients where id = auth.uid()), false);
$$;

drop policy if exists "clients_self_or_admin_select" on public.clients;
create policy "clients_self_or_admin_select" on public.clients
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "clients_self_update" on public.clients;
create policy "clients_self_update" on public.clients
  for update using (auth.uid() = id or public.is_admin());

drop policy if exists "plats_read_all" on public.plats;
create policy "plats_read_all" on public.plats
  for select using (true);

drop policy if exists "plats_admin_write" on public.plats;
create policy "plats_admin_write" on public.plats
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "commandes_self_or_admin" on public.commandes;
create policy "commandes_self_or_admin" on public.commandes
  for select using (auth.uid() = client_id or public.is_admin());

drop policy if exists "commandes_admin_write" on public.commandes;
create policy "commandes_admin_write" on public.commandes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "repas_self_or_admin_select" on public.repas_journal;
create policy "repas_self_or_admin_select" on public.repas_journal
  for select using (auth.uid() = client_id or public.is_admin());

drop policy if exists "repas_self_or_admin_write" on public.repas_journal;
create policy "repas_self_or_admin_write" on public.repas_journal
  for all using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

drop policy if exists "messages_self_or_admin" on public.messages;
create policy "messages_self_or_admin" on public.messages
  for all using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

drop policy if exists "factures_self_or_admin" on public.factures;
create policy "factures_self_or_admin" on public.factures
  for select using (auth.uid() = client_id or public.is_admin());

-- ============ REALTIME ============
-- Nécessaire pour que la messagerie se mette à jour en direct sans recharger.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
