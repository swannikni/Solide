-- Chef2Box Appli - Suivi nutritionnel - Schéma V1
-- A exécuter dans le SQL Editor du projet Supabase Chef2Box (le même que le
-- questionnaire et l'outil cuisine).
-- Tout ce qui appartient à l'appli est préfixé "application_" (tables,
-- fonction, bucket photos) : rien ne touche aux tables existantes des autres
-- outils. Le script peut être relancé sans risque.

-- ============ CLIENTS ============
-- Un client = une ligne, liée à un utilisateur Supabase Auth (vrai login).
create table if not exists public.application_clients (
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
create table if not exists public.application_plats (
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
-- La commande connue d'un client pour un jour/repas donné. C'est elle qui
-- permet à l'admin de pré-remplir la "box du jour".
create table if not exists public.application_commandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  plat_id uuid references public.application_plats (id),
  date_livraison date not null,
  repas_type text not null check (repas_type in ('dejeuner', 'diner')),
  statut text not null default 'confirmee' check (statut in ('confirmee', 'annulee', 'livree')),
  created_at timestamptz not null default now(),
  unique (client_id, date_livraison, repas_type)
);

-- ============ REPAS_JOURNAL ============
-- Chaque repas ajouté par (ou pour) un client : scan Chef2Box, code-barres
-- commerce, ou saisie manuelle.
create table if not exists public.application_repas_journal (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
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
  plat_id uuid references public.application_plats (id),
  commande_id uuid references public.application_commandes (id) on delete set null,
  cree_par text not null default 'client' check (cree_par in ('client', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists application_repas_journal_client_date_idx
  on public.application_repas_journal (client_id, date);

-- ============ MESSAGES ============
create table if not exists public.application_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  expediteur text not null check (expediteur in ('client', 'admin')),
  contenu text not null,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists application_messages_client_idx
  on public.application_messages (client_id, created_at);

-- ============ FACTURES ============
-- Hors scope V1, table posée pour la V2.
create table if not exists public.application_factures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  periode_debut date not null,
  periode_fin date not null,
  montant numeric not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'payee', 'annulee')),
  created_at timestamptz not null default now()
);

-- ============ ROW LEVEL SECURITY ============
alter table public.application_clients enable row level security;
alter table public.application_plats enable row level security;
alter table public.application_commandes enable row level security;
alter table public.application_repas_journal enable row level security;
alter table public.application_messages enable row level security;
alter table public.application_factures enable row level security;

create or replace function public.application_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select est_admin from public.application_clients where id = auth.uid()),
    false
  );
$$;

drop policy if exists "clients_self_or_admin_select" on public.application_clients;
create policy "clients_self_or_admin_select" on public.application_clients
  for select using (auth.uid() = id or public.application_is_admin());

-- Seul l'admin modifie les fiches clients (objectifs, palier, est_admin) :
-- un client ne doit pas pouvoir se passer admin lui-même.
drop policy if exists "clients_admin_write" on public.application_clients;
create policy "clients_admin_write" on public.application_clients
  for all using (public.application_is_admin()) with check (public.application_is_admin());

drop policy if exists "plats_read_all" on public.application_plats;
create policy "plats_read_all" on public.application_plats
  for select using (auth.role() = 'authenticated');

drop policy if exists "plats_admin_write" on public.application_plats;
create policy "plats_admin_write" on public.application_plats
  for all using (public.application_is_admin()) with check (public.application_is_admin());

drop policy if exists "commandes_self_or_admin" on public.application_commandes;
create policy "commandes_self_or_admin" on public.application_commandes
  for select using (auth.uid() = client_id or public.application_is_admin());

drop policy if exists "commandes_admin_write" on public.application_commandes;
create policy "commandes_admin_write" on public.application_commandes
  for all using (public.application_is_admin()) with check (public.application_is_admin());

drop policy if exists "repas_self_or_admin" on public.application_repas_journal;
create policy "repas_self_or_admin" on public.application_repas_journal
  for all using (auth.uid() = client_id or public.application_is_admin())
  with check (auth.uid() = client_id or public.application_is_admin());

-- Un client ne peut envoyer qu'en son nom ("client"), jamais se faire passer
-- pour Swann.
drop policy if exists "messages_select" on public.application_messages;
create policy "messages_select" on public.application_messages
  for select using (auth.uid() = client_id or public.application_is_admin());

drop policy if exists "messages_insert" on public.application_messages;
create policy "messages_insert" on public.application_messages
  for insert with check (
    (auth.uid() = client_id and expediteur = 'client')
    or (public.application_is_admin() and expediteur = 'admin')
  );

drop policy if exists "factures_self_or_admin" on public.application_factures;
create policy "factures_self_or_admin" on public.application_factures
  for select using (auth.uid() = client_id or public.application_is_admin());

-- ============ ALIMENTS (table CIQUAL / ANSES) ============
-- Base d'aliments génériques pour la saisie manuelle, macros pour 100 g.
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.application_aliments (
  id bigint generated always as identity primary key,
  code_ciqual text unique,
  nom text not null,
  groupe text,
  calories numeric not null,
  proteines numeric not null,
  glucides numeric not null,
  lipides numeric not null,
  -- nom sans accents ni majuscules, rempli à l'import (unaccent n'est pas
  -- utilisable dans une colonne générée)
  nom_normalise text not null
);

create index if not exists application_aliments_nom_trgm_idx
  on public.application_aliments using gin (nom_normalise extensions.gin_trgm_ops);

alter table public.application_aliments enable row level security;

drop policy if exists "aliments_read_authenticated" on public.application_aliments;
create policy "aliments_read_authenticated" on public.application_aliments
  for select to authenticated using (true);

drop policy if exists "aliments_admin_write" on public.application_aliments;
create policy "aliments_admin_write" on public.application_aliments
  for all using (public.application_is_admin()) with check (public.application_is_admin());

-- Recherche tolérante : sans accents, pluriels/féminins, synonymes du quotidien,
-- pourcentages exacts ("5%" ne trouve pas "15%"), un mot manquant toléré.
create or replace function public.application_rechercher_aliments(q text, limite int default 30)
returns setof public.application_aliments
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  qn text := ' ' || regexp_replace(lower(extensions.unaccent(coalesce(q, ''))), '[^a-z0-9% ]', ' ', 'g') || ' ';
  syn record;
  mot text;
  racines text[] := '{}';
  pourcents text[] := '{}';
  n int;
begin
  -- Termes du quotidien -> vocabulaire de la table CIQUAL.
  for syn in
    select * from (values
      (' blancs de poulet ', ' poulet filet '),
      (' blanc de poulet ', ' poulet filet '),
      (' blanc poulet ', ' poulet filet '),
      (' filet de poulet ', ' poulet filet '),
      (' escalope de poulet ', ' poulet filet '),
      (' blanc de dinde ', ' dinde filet '),
      (' escalope de dinde ', ' dinde filet '),
      (' viande hachee ', ' boeuf hache '),
      (' viande hache ', ' boeuf hache '),
      (' pdt ', ' pomme de terre ')
    ) as v(de, vers)
  loop
    qn := replace(qn, syn.de, syn.vers);
  end loop;
  qn := regexp_replace(qn, '([0-9]+) +%', '\1%', 'g');

  foreach mot in array regexp_split_to_array(trim(qn), '\s+') loop
    if mot = '' or mot = any (array['de','du','des','d','la','le','les','l','a','au','aux','et','en','un','une','avec']) then
      continue;
    end if;
    if mot ~ '^[0-9]+%$' then
      pourcents := pourcents || mot;
      continue;
    end if;
    -- Pluriel puis féminin : "hachees" -> "hache", "cuite" -> "cuit".
    if length(mot) > 3 and right(mot, 1) in ('s', 'x') then mot := left(mot, -1); end if;
    if length(mot) > 3 and right(mot, 1) = 'e' then mot := left(mot, -1); end if;
    racines := racines || mot;
  end loop;

  n := cardinality(racines);
  if n = 0 and cardinality(pourcents) = 0 then
    return;
  end if;

  return query
  select a.*
  from public.application_aliments a
  cross join lateral (
    select count(*) filter (
      where a.nom_normalise like '%' || r || '%'
         or (r = 'cuit' and a.nom_normalise ~ '(cuit|roti|poele|saute|grille|bouilli|vapeur|four)')
    ) as nb
    from unnest(racines) r
  ) m
  where (n = 0 or m.nb >= greatest(1, n - 1))
    and not exists (
      select 1 from unnest(pourcents) p
      where a.nom_normalise !~ ('(^|[^0-9])' || replace(p, '%', '') || ' ?%')
    )
  order by
    m.nb desc,
    (n > 0 and a.nom_normalise like racines[1] || '%') desc,
    extensions.similarity(a.nom_normalise, trim(qn)) desc,
    length(a.nom)
  limit least(greatest(limite, 1), 100);
end;
$$;

revoke execute on function public.application_rechercher_aliments(text, int) from public, anon;
grant execute on function public.application_rechercher_aliments(text, int) to authenticated;

-- ============ ASSISTANT IA ============
-- Historique du chat avec l'assistant (sert aussi au quota quotidien).
create table if not exists public.application_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  contenu text not null check (char_length(contenu) <= 20000),
  created_at timestamptz not null default now()
);

create index if not exists application_assistant_messages_client_idx
  on public.application_assistant_messages (client_id, created_at);

alter table public.application_assistant_messages enable row level security;

drop policy if exists "assistant_self_or_admin_select" on public.application_assistant_messages;
create policy "assistant_self_or_admin_select" on public.application_assistant_messages
  for select using (auth.uid() = client_id or public.application_is_admin());

-- Écrit par la route serveur sous la session du client lui-même.
drop policy if exists "assistant_self_insert" on public.application_assistant_messages;
create policy "assistant_self_insert" on public.application_assistant_messages
  for insert with check (auth.uid() = client_id);

drop policy if exists "assistant_self_delete" on public.application_assistant_messages;
create policy "assistant_self_delete" on public.application_assistant_messages
  for delete using (auth.uid() = client_id);

-- ============ STORAGE (photos de repas) ============
insert into storage.buckets (id, name, public)
values ('application-repas-photos', 'application-repas-photos', true)
on conflict (id) do nothing;

-- Chaque client dépose ses photos dans son propre dossier (<son id>/...).
drop policy if exists "application_photos_insert" on storage.objects;
create policy "application_photos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'application-repas-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.application_is_admin()
    )
  );

-- ============ REALTIME ============
-- Pour que la messagerie se mette à jour en direct.
do $$
begin
  alter publication supabase_realtime add table public.application_messages;
exception
  when duplicate_object then null;
end $$;
