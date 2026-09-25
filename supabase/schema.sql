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

-- "g" : quantite = grammes / 100 (valeurs pour 100 g) ; "portion" : nombre de portions.
alter table public.application_repas_journal
  add column if not exists unite text check (unite in ('g', 'portion'));

-- Profil (sexe, âge, taille, poids, objectifs, activité) pour calculer les
-- objectifs comme le questionnaire de chef2box.com.
alter table public.application_clients add column if not exists profil jsonb;

-- ============ FAVORIS ============
create table if not exists public.application_favoris (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  nom text not null,
  calories numeric not null,
  proteines numeric not null,
  glucides numeric not null,
  lipides numeric not null,
  unite text not null default 'portion' check (unite in ('g', 'portion')),
  quantite numeric not null default 1,
  source text not null default 'manuel' check (source in ('chef2box', 'code_barres', 'manuel')),
  plat_id uuid references public.application_plats (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (client_id, nom)
);

-- ============ SUIVI DU POIDS ============
create table if not exists public.application_poids (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  date date not null,
  poids_kg numeric not null check (poids_kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (client_id, date)
);

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
  with check ((auth.uid() = client_id and cree_par = 'client') or public.application_is_admin());

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
      (' pdt ', ' pomme de terre '),
      (' coca cola ', ' cola '),
      (' coca ', ' cola '),
      (' pepsi ', ' cola ')
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
    -- Échantillons de laboratoire (« prélevé à la Martinique »...) et produits
    -- pour bébé en dernier.
    (a.nom_normalise like '%prelev%' or coalesce(a.groupe, '') like '%infantile%') asc,
    (n > 0 and a.nom_normalise like racines[1] || '%') desc,
    -- Fruits : la version crue (celle qu'on mange) d'abord.
    (a.groupe = 'fruits' and a.nom_normalise ~ '(^| )crue?s?( |$)') desc,
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

alter table public.application_favoris enable row level security;
alter table public.application_poids enable row level security;

-- Favori « repas complet » : la liste des aliments (nom, macros, unité, quantité...).
-- Les colonnes calories/proteines/... gardent alors le total, pour l'affichage.
alter table public.application_favoris add column if not exists elements jsonb
  check (elements is null or (jsonb_typeof(elements) = 'array' and jsonb_array_length(elements) between 1 and 30));

drop policy if exists "favoris_self" on public.application_favoris;
create policy "favoris_self" on public.application_favoris
  for all using (auth.uid() = client_id) with check (auth.uid() = client_id);

drop policy if exists "poids_self_or_admin_select" on public.application_poids;
create policy "poids_self_or_admin_select" on public.application_poids
  for select using (auth.uid() = client_id or public.application_is_admin());

drop policy if exists "poids_self_write" on public.application_poids;
create policy "poids_self_write" on public.application_poids
  for all using (auth.uid() = client_id) with check (auth.uid() = client_id);

-- ============ QUESTIONNAIRES REÇUS (chef2box.com) ============
-- Envoyés par le site via la route /api/questionnaire (clé secrète) ; l'admin
-- crée ensuite le compte du client en un clic.
create table if not exists public.application_questionnaires (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'site' check (source in ('site', 'ancien_outil')),
  nom text not null,
  email text,
  telephone text,
  calories int,
  proteines int,
  glucides int,
  lipides int,
  palier text check (palier in ('P1','P2','P3','P4','P5','P6')),
  profil jsonb,
  reponses jsonb not null default '{}'::jsonb,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'compte_cree', 'ignore')),
  client_id uuid references public.application_clients (id) on delete set null
);

create index if not exists application_questionnaires_statut_idx
  on public.application_questionnaires (statut, created_at desc);

alter table public.application_questionnaires enable row level security;

drop policy if exists "questionnaires_admin" on public.application_questionnaires;
create policy "questionnaires_admin" on public.application_questionnaires
  for all to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

-- ============ RESTAURANTS & FAST-FOOD ============
-- Valeurs officielles publiées par les enseignes (par portion). Données
-- dans supabase/data/restaurants.json (McDonald's Suisse, Burger King France).
create table if not exists public.application_restaurants (
  id bigint generated always as identity primary key,
  enseigne text not null,
  nom text not null,
  nom_normalise text not null,
  calories numeric not null,
  proteines numeric not null,
  glucides numeric not null,
  lipides numeric not null,
  portion_g numeric,
  pays text not null,
  source_url text not null,
  maj date not null default current_date,
  unique (enseigne, nom)
);

alter table public.application_restaurants enable row level security;

drop policy if exists "restaurants_read_authenticated" on public.application_restaurants;
create policy "restaurants_read_authenticated" on public.application_restaurants
  for select to authenticated using (true);

drop policy if exists "restaurants_admin_write" on public.application_restaurants;
create policy "restaurants_admin_write" on public.application_restaurants
  for all to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

create index if not exists application_restaurants_nom_trgm
  on public.application_restaurants using gin (nom_normalise extensions.gin_trgm_ops);

create or replace function public.application_rechercher_restaurants(q text, limite int default 20)
returns setof public.application_restaurants
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  qn text := trim(regexp_replace(lower(extensions.unaccent(coalesce(q, ''))), '[^a-z0-9 ]', ' ', 'g'));
  racines text[] := '{}';
  mot text;
  n int;
begin
  qn := replace(' ' || qn || ' ', ' mc do ', ' mcdonald ');
  qn := replace(qn, ' mcdo ', ' mcdonald ');
  qn := replace(qn, ' mac do ', ' mcdonald ');
  qn := replace(qn, ' bk ', ' burger king ');
  foreach mot in array regexp_split_to_array(trim(qn), '\s+') loop
    if mot = '' or mot = any (array['de','du','des','la','le','les','a','au','aux','et','en','un','une','avec']) then
      continue;
    end if;
    if length(mot) > 3 and right(mot, 1) in ('s', 'x') then mot := left(mot, -1); end if;
    racines := racines || mot;
  end loop;
  n := cardinality(racines);
  if n = 0 then return; end if;

  return query
  select r.*
  from public.application_restaurants r
  cross join lateral (
    select count(*) filter (where r.nom_normalise like '%' || x || '%') as nb from unnest(racines) x
  ) m
  where m.nb >= greatest(1, n - 1)
  order by m.nb desc, extensions.similarity(r.nom_normalise, qn) desc, length(r.nom)
  limit least(greatest(limite, 1), 50);
end;
$$;

revoke execute on function public.application_rechercher_restaurants(text, int) from public, anon;
grant execute on function public.application_rechercher_restaurants(text, int) to authenticated;

-- ============ STORAGE (photos de repas) ============
-- Bucket privé : les photos s'affichent via des liens signés (1 h).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-repas-photos', 'application-repas-photos', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "application_photos_select" on storage.objects;
create policy "application_photos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'application-repas-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.application_is_admin())
  );

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

-- ============ OBJECTIF DE POIDS ============
-- Fixé par le client lui-même (onglet Progrès) : seule cette colonne lui est
-- modifiable, via cette fonction ; le reste de sa fiche reste réservé à l'admin.
alter table public.application_clients
  add column if not exists poids_objectif numeric check (poids_objectif between 30 and 300);

create or replace function public.application_definir_poids_objectif(p_kg numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kg is not null and (p_kg < 30 or p_kg > 300) then
    raise exception 'poids hors limites';
  end if;
  update public.application_clients set poids_objectif = round(p_kg, 1) where id = auth.uid();
end;
$$;

revoke execute on function public.application_definir_poids_objectif(numeric) from public, anon;
grant execute on function public.application_definir_poids_objectif(numeric) to authenticated;

-- ============ NOTIFICATIONS (rappel du soir, bilan du lundi) ============
-- Abonnements push des téléphones (un par appareil).
create table if not exists public.application_push_abonnements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists application_push_abonnements_client_idx on public.application_push_abonnements (client_id);
alter table public.application_push_abonnements enable row level security;
drop policy if exists "push_self" on public.application_push_abonnements;
create policy "push_self" on public.application_push_abonnements
  for all to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- Secrets du coffre (clés VAPID « vapid_prive » / « vapid_public », secret
-- « rappel_cron_secret »), lisibles seulement par la fonction d'envoi.
-- Création (une fois, valeurs jamais versionnées) :
--   select vault.create_secret('<valeur>', 'vapid_prive', '...');
create or replace function public.application_secret(p_nom text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nom;
$$;
revoke execute on function public.application_secret(text) from public, anon, authenticated;
grant execute on function public.application_secret(text) to service_role;

-- Envois planifiés vers la fonction supabase/functions/rappels (heures UTC :
-- 19 h = 20 h à Casablanca ; lundi 8 h = 9 h).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
-- select cron.schedule('chef2box-rappel-soir', '0 19 * * *', $$ select net.http_post(
--   url := 'https://gsptgfzgkefgmequnhzk.supabase.co/functions/v1/rappels',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
--     (select decrypted_secret from vault.decrypted_secrets where name = 'rappel_cron_secret')),
--   body := '{"type":"soir"}'::jsonb, timeout_milliseconds := 30000); $$);
-- select cron.schedule('chef2box-bilan-lundi', '0 8 * * 1', ... body := '{"type":"bilan"}' ...);

-- ============ POINTS, RÉCOMPENSES ET DÉFIS ============
-- Points gagnés (calculés côté serveur, impossibles à trafiquer) :
--   +10 par jour avec au moins un repas noté
--   +10 par jour dans l'objectif calories (±10 %)
--   +10 par jour objectif protéines atteint (≥ 90 %)
--   +50 par tranche de 7 jours d'affilée
--   + les points de chaque défi réussi
-- Dépensés : récompenses réclamées (sauf refusées).

-- Catalogue des récompenses, modifiable par l'admin.
create table if not exists public.application_recompenses (
  id text primary key,
  emoji text not null default '🎁',
  titre text not null,
  cout int not null check (cout between 1 and 100000),
  actif boolean not null default true,
  ordre int not null default 0
);
insert into public.application_recompenses (id, emoji, titre, cout, ordre) values
  ('boisson', '🥤', 'Boisson offerte', 300, 1),
  ('dessert', '🍰', 'Dessert offert', 600, 2),
  ('remise10', '💸', '−10 % sur la prochaine commande', 1000, 3),
  ('box', '🎁', 'Une box offerte', 2000, 4)
on conflict (id) do nothing;

-- Récompenses réclamées par les clients (traitées par l'admin).
create table if not exists public.application_recompenses_demandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.application_clients (id) on delete cascade,
  recompense_id text references public.application_recompenses (id) on delete set null,
  titre text not null,
  cout int not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'remise', 'refusee')),
  created_at timestamptz not null default now(),
  traite_le timestamptz
);
create index if not exists application_recompenses_demandes_client_idx
  on public.application_recompenses_demandes (client_id, created_at desc);

-- Défis lancés par l'admin (ex. « 5 jours à l'objectif protéines cette semaine »).
create table if not exists public.application_defis (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  type text not null check (type in ('jours_notes', 'jours_calories', 'jours_proteines')),
  cible int not null check (cible between 1 and 31),
  date_debut date not null,
  date_fin date not null check (date_fin >= date_debut),
  points int not null default 100 check (points between 0 and 10000),
  created_at timestamptz not null default now()
);

alter table public.application_recompenses enable row level security;
alter table public.application_recompenses_demandes enable row level security;
alter table public.application_defis enable row level security;

drop policy if exists "recompenses_lecture" on public.application_recompenses;
create policy "recompenses_lecture" on public.application_recompenses
  for select to authenticated using (true);
drop policy if exists "recompenses_admin" on public.application_recompenses;
create policy "recompenses_admin" on public.application_recompenses
  for all to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

-- Les clients voient leurs demandes ; seules les fonctions ci-dessous en créent.
drop policy if exists "demandes_lecture" on public.application_recompenses_demandes;
create policy "demandes_lecture" on public.application_recompenses_demandes
  for select to authenticated using (client_id = auth.uid() or public.application_is_admin());
drop policy if exists "demandes_admin_maj" on public.application_recompenses_demandes;
create policy "demandes_admin_maj" on public.application_recompenses_demandes
  for update to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

drop policy if exists "defis_lecture" on public.application_defis;
create policy "defis_lecture" on public.application_defis
  for select to authenticated using (true);
drop policy if exists "defis_admin" on public.application_defis;
create policy "defis_admin" on public.application_defis
  for all to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

-- Totaux par jour d'un client.
create or replace function public.application_jours_client(p_client uuid)
returns table (jour date, calories numeric, proteines numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.date, sum(r.calories * r.quantite), sum(r.proteines * r.quantite)
  from public.application_repas_journal r
  where r.client_id = p_client
  group by r.date;
$$;
revoke execute on function public.application_jours_client(uuid) from public, anon, authenticated;

-- Avancement de chaque défi pour un client.
create or replace function public.application_defis_client(p_client uuid default auth.uid())
returns table (id uuid, titre text, type text, cible int, date_debut date, date_fin date, points int, fait int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_client is distinct from auth.uid() and not public.application_is_admin() then
    raise exception 'accès refusé';
  end if;
  return query
  with c as (
    select objectif_calories as cal, objectif_proteines as prot from public.application_clients where application_clients.id = p_client
  ), j as (select * from public.application_jours_client(p_client))
  select d.id, d.titre, d.type, d.cible, d.date_debut, d.date_fin, d.points,
    (select count(*)::int from j, c
      where j.jour between d.date_debut and d.date_fin
        and case d.type
          when 'jours_notes' then true
          when 'jours_calories' then c.cal > 0 and abs(j.calories - c.cal) <= c.cal * 0.1
          else c.prot > 0 and j.proteines >= c.prot * 0.9
        end)
  from public.application_defis d
  order by d.date_debut desc;
end;
$$;
revoke execute on function public.application_defis_client(uuid) from public, anon;
grant execute on function public.application_defis_client(uuid) to authenticated;

-- Solde de points d'un client (le sien, ou n'importe lequel pour l'admin).
create or replace function public.application_points(p_client uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours int; v_cal int; v_prot int; v_series int; v_defis int; v_depenses int;
  c record;
begin
  if p_client is distinct from auth.uid() and not public.application_is_admin() then
    raise exception 'accès refusé';
  end if;
  select objectif_calories as cal, objectif_proteines as prot into c
  from public.application_clients where id = p_client;

  select count(*),
         count(*) filter (where c.cal > 0 and abs(calories - c.cal) <= c.cal * 0.1),
         count(*) filter (where c.prot > 0 and proteines >= c.prot * 0.9)
  into v_jours, v_cal, v_prot
  from public.application_jours_client(p_client);

  -- Séries : jours consécutifs regroupés (îlots), 50 points par tranche de 7.
  select coalesce(sum(floor(n / 7.0)), 0) into v_series
  from (
    select count(*) as n
    from (select jour, jour - (row_number() over (order by jour))::int as ilot
          from public.application_jours_client(p_client)) t
    group by ilot
  ) s;

  select coalesce(sum(points), 0) into v_defis
  from public.application_defis_client(p_client) where fait >= cible;

  select coalesce(sum(cout), 0) into v_depenses
  from public.application_recompenses_demandes where client_id = p_client and statut <> 'refusee';

  return jsonb_build_object(
    'jours', v_jours, 'jours_calories', v_cal, 'jours_proteines', v_prot,
    'bonus_series', v_series * 50, 'defis', v_defis,
    'gagnes', v_jours * 10 + v_cal * 10 + v_prot * 10 + v_series * 50 + v_defis,
    'depenses', v_depenses,
    'solde', v_jours * 10 + v_cal * 10 + v_prot * 10 + v_series * 50 + v_defis - v_depenses
  );
end;
$$;
revoke execute on function public.application_points(uuid) from public, anon;
grant execute on function public.application_points(uuid) to authenticated;

-- Réclamer une récompense : vérifie le solde, enregistre la demande et
-- prévient l'admin dans la messagerie du client.
create or replace function public.application_reclamer_recompense(p_recompense text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  r record;
  v_solde int;
  v_id uuid;
begin
  if v_client is null then raise exception 'non connecté'; end if;
  perform pg_advisory_xact_lock(hashtext('recompense:' || v_client::text));
  select * into r from public.application_recompenses where id = p_recompense and actif;
  if not found then raise exception 'récompense indisponible'; end if;
  v_solde := (public.application_points(v_client) ->> 'solde')::int;
  if v_solde < r.cout then raise exception 'points insuffisants'; end if;

  insert into public.application_recompenses_demandes (client_id, recompense_id, titre, cout)
  values (v_client, r.id, r.emoji || ' ' || r.titre, r.cout)
  returning id into v_id;

  insert into public.application_messages (client_id, expediteur, contenu)
  values (v_client, 'client',
    '🎁 J''ai débloqué une récompense : ' || r.emoji || ' ' || r.titre || ' (' || r.cout || ' points). Merci de me la réserver !');
  return v_id;
end;
$$;
revoke execute on function public.application_reclamer_recompense(text) from public, anon;
grant execute on function public.application_reclamer_recompense(text) to authenticated;

-- ============ MON PROFIL (modifié par le client) ============
-- Le client met à jour son profil et ses objectifs du jour, dans des bornes
-- raisonnables ; Chef2Box est prévenu dans la messagerie si les kcal changent.
create or replace function public.application_maj_mon_profil(
  p_nom text,
  p_profil jsonb,
  p_calories int,
  p_proteines int,
  p_glucides int,
  p_lipides int,
  p_palier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  v_avant int;
begin
  if v_client is null then raise exception 'non connecté'; end if;
  if coalesce(length(trim(p_nom)), 0) not between 1 and 80 then raise exception 'nom invalide'; end if;
  if p_calories not between 1200 and 5000 then raise exception 'calories hors limites'; end if;
  if p_proteines not between 30 and 350 or p_glucides not between 30 and 700 or p_lipides not between 20 and 250 then
    raise exception 'macros hors limites';
  end if;
  if p_palier is not null and p_palier not in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6') then raise exception 'palier invalide'; end if;
  if p_profil is not null and (jsonb_typeof(p_profil) <> 'object' or length(p_profil::text) > 2000) then
    raise exception 'profil invalide';
  end if;

  select objectif_calories into v_avant from public.application_clients where id = v_client;
  update public.application_clients
  set nom = trim(p_nom),
      profil = coalesce(p_profil, profil),
      objectif_calories = p_calories,
      objectif_proteines = p_proteines,
      objectif_glucides = p_glucides,
      objectif_lipides = p_lipides,
      palier = coalesce(p_palier, palier)
  where id = v_client;

  if v_avant is distinct from p_calories then
    insert into public.application_messages (client_id, expediteur, contenu)
    values (v_client, 'client',
      '✏️ J''ai mis à jour mon profil : objectif ' || coalesce(v_avant::text, '?') || ' → ' || p_calories
      || ' kcal/jour (P ' || p_proteines || ' g · G ' || p_glucides || ' g · L ' || p_lipides || ' g).');
  end if;
end;
$$;
revoke execute on function public.application_maj_mon_profil(text, jsonb, int, int, int, int, text) from public, anon;
grant execute on function public.application_maj_mon_profil(text, jsonb, int, int, int, int, text) to authenticated;

-- ============ PARAMÈTRES GÉNÉRAUX ============
-- Réglages de l'appli modifiables par l'admin (ex. récompenses activées ou non).
create table if not exists public.application_parametres (
  cle text primary key,
  valeur jsonb not null
);
alter table public.application_parametres enable row level security;
drop policy if exists "parametres_lecture" on public.application_parametres;
create policy "parametres_lecture" on public.application_parametres
  for select to authenticated using (true);
drop policy if exists "parametres_admin" on public.application_parametres;
create policy "parametres_admin" on public.application_parametres
  for all to authenticated using (public.application_is_admin()) with check (public.application_is_admin());

-- Récompenses désactivées par défaut : l'admin les active quand il est prêt.
insert into public.application_parametres (cle, valeur) values ('recompenses_actives', 'false')
on conflict (cle) do nothing;

-- Garde-fou : une journée ne compte (points, séries, défis) que si elle est
-- réaliste, c'est-à-dire au moins 40 % de l'objectif calories noté.
create or replace function public.application_defis_client(p_client uuid default auth.uid())
returns table (id uuid, titre text, type text, cible int, date_debut date, date_fin date, points int, fait int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_client is distinct from auth.uid() and not public.application_is_admin() then
    raise exception 'accès refusé';
  end if;
  return query
  with c as (
    select objectif_calories as cal, objectif_proteines as prot from public.application_clients where application_clients.id = p_client
  ), j as (
    select jc.* from public.application_jours_client(p_client) jc, c where c.cal > 0 and jc.calories >= c.cal * 0.4
  )
  select d.id, d.titre, d.type, d.cible, d.date_debut, d.date_fin, d.points,
    (select count(*)::int from j, c
      where j.jour between d.date_debut and d.date_fin
        and case d.type
          when 'jours_notes' then true
          when 'jours_calories' then abs(j.calories - c.cal) <= c.cal * 0.1
          else c.prot > 0 and j.proteines >= c.prot * 0.9
        end)
  from public.application_defis d
  order by d.date_debut desc;
end;
$$;

create or replace function public.application_points(p_client uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours int; v_cal int; v_prot int; v_series int; v_defis int; v_depenses int;
  c record;
begin
  if p_client is distinct from auth.uid() and not public.application_is_admin() then
    raise exception 'accès refusé';
  end if;
  select objectif_calories as cal, objectif_proteines as prot into c
  from public.application_clients where id = p_client;

  select count(*),
         count(*) filter (where abs(v.calories - c.cal) <= c.cal * 0.1),
         count(*) filter (where c.prot > 0 and v.proteines >= c.prot * 0.9)
  into v_jours, v_cal, v_prot
  from public.application_jours_client(p_client) v
  where c.cal > 0 and v.calories >= c.cal * 0.4;

  select coalesce(sum(floor(n / 7.0)), 0) into v_series
  from (
    select count(*) as n
    from (select v.jour, v.jour - (row_number() over (order by v.jour))::int as ilot
          from public.application_jours_client(p_client) v
          where c.cal > 0 and v.calories >= c.cal * 0.4) t
    group by ilot
  ) s;

  select coalesce(sum(points), 0) into v_defis
  from public.application_defis_client(p_client) where fait >= cible;

  select coalesce(sum(cout), 0) into v_depenses
  from public.application_recompenses_demandes where client_id = p_client and statut <> 'refusee';

  return jsonb_build_object(
    'jours', v_jours, 'jours_calories', v_cal, 'jours_proteines', v_prot,
    'bonus_series', v_series * 50, 'defis', v_defis,
    'gagnes', v_jours * 10 + v_cal * 10 + v_prot * 10 + v_series * 50 + v_defis,
    'depenses', v_depenses,
    'solde', v_jours * 10 + v_cal * 10 + v_prot * 10 + v_series * 50 + v_defis - v_depenses
  );
end;
$$;

create or replace function public.application_reclamer_recompense(p_recompense text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := auth.uid();
  r record;
  v_solde int;
  v_id uuid;
begin
  if v_client is null then raise exception 'non connecté'; end if;
  if coalesce((select valeur = 'true'::jsonb from public.application_parametres where cle = 'recompenses_actives'), false) is not true then
    raise exception 'récompenses désactivées';
  end if;
  perform pg_advisory_xact_lock(hashtext('recompense:' || v_client::text));
  select * into r from public.application_recompenses where id = p_recompense and actif;
  if not found then raise exception 'récompense indisponible'; end if;
  v_solde := (public.application_points(v_client) ->> 'solde')::int;
  if v_solde < r.cout then raise exception 'points insuffisants'; end if;

  insert into public.application_recompenses_demandes (client_id, recompense_id, titre, cout)
  values (v_client, r.id, r.emoji || ' ' || r.titre, r.cout)
  returning id into v_id;

  insert into public.application_messages (client_id, expediteur, contenu)
  values (v_client, 'client',
    '🎁 J''ai débloqué une récompense : ' || r.emoji || ' ' || r.titre || ' (' || r.cout || ' points). Merci de me la réserver !');
  return v_id;
end;
$$;

-- ============ MESSAGES LUS ============
-- Marque comme lus les messages reçus : le client lit ceux de Chef2Box,
-- l'admin lit ceux d'un client donné.
create or replace function public.application_marquer_lus(p_client uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if p_client is not null and p_client <> auth.uid() then
    if not public.application_is_admin() then raise exception 'accès refusé'; end if;
    update public.application_messages set lu = true
    where client_id = p_client and expediteur = 'client' and not lu;
  else
    update public.application_messages set lu = true
    where client_id = auth.uid() and expediteur = 'admin' and not lu;
  end if;
end;
$$;
revoke execute on function public.application_marquer_lus(uuid) from public, anon;
grant execute on function public.application_marquer_lus(uuid) to authenticated;

create index if not exists application_messages_non_lus_idx
  on public.application_messages (client_id, expediteur) where not lu;

-- ============ REALTIME ============
-- Pour que la messagerie se mette à jour en direct.
do $$
begin
  alter publication supabase_realtime add table public.application_messages;
exception
  when duplicate_object then null;
end $$;
