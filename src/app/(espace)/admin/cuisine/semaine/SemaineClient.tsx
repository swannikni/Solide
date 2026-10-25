"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CopyPlus, MoreHorizontal, Search, UserPlus } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import type { ClientCuisine } from "@/app/(espace)/admin/cuisine/CuisineClient";
import { createClient } from "@/lib/supabase/client";
import { decalerDate } from "@/lib/dates";
import { libellePalier } from "@/lib/fiche-cuisine-pdf";
import type { Palier } from "@/lib/types";

type Service = "dejeuner" | "diner";

export interface CommandeSemaine {
  id: string;
  client_id: string;
  date_livraison: string;
  repas_type: Service;
  note: string | null;
  palier: Palier | null;
}

// Fiche d'une personne ajoutée à la main (sans compte), reprise quand on la
// coche un nouveau jour.
export interface PersonneHistorique {
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  adresse: string | null;
  lat: number | null;
  lng: number | null;
  telephone: string | null;
  complement: string | null;
}

export interface ExtraSemaine extends PersonneHistorique {
  id: string;
  date: string;
  repas_type: Service;
  note: string | null;
}

// Une ligne du planning : client de l'appli ou personne ajoutée à la main.
interface Personne {
  cle: string; // « c:<id> » ou « m:<nom en minuscules> »
  clientId: string | null;
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
}

const SERVICES: { cle: Service; libelle: string; icone: string }[] = [
  { cle: "dejeuner", libelle: "Midi", icone: "☀️" },
  { cle: "diner", libelle: "Soir", icone: "🌙" },
];
const PALIERS: Palier[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
const CHAMPS_EXTRA = "id, date, repas_type, nom, palier, allergies, refus, note, adresse, lat, lng, telephone, complement";

const cleNom = (nom: string) => nom.trim().toLowerCase();
const sansAccents = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dateCourte = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });

export function SemaineClient({
  lundi,
  aujourdhui,
  clients,
  commandesInitiales,
  extrasInitiaux,
  personnesConnues,
}: {
  lundi: string;
  aujourdhui: string;
  clients: ClientCuisine[];
  commandesInitiales: CommandeSemaine[];
  extrasInitiaux: ExtraSemaine[];
  personnesConnues: PersonneHistorique[];
}) {
  const supabase = createClient();
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [extras, setExtras] = useState(extrasInitiaux);
  // Personnes ajoutées au planning à l'instant (pas encore de repas coché).
  const [ajoutees, setAjoutees] = useState<Personne[]>([]);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [actions, setActions] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [nouvelle, setNouvelle] = useState<{ nom: string; palier: Palier | ""; allergies: string; refus: string } | null>(null);
  const [message, setMessage] = useState("");

  const jours = Array.from({ length: 5 }, (_, i) => decalerDate(lundi, i));
  const vendredi = jours[4];
  const lundiAvant = decalerDate(lundi, -7);
  const parClient = new Map(clients.map((c) => [c.id, c]));
  const connues = new Map(personnesConnues.map((p) => [cleNom(p.nom), p]));

  // Dernière fiche connue d'une personne ajoutée à la main : ses lignes de la
  // semaine (la plus récente), sinon son historique.
  function ficheMain(cle: string): PersonneHistorique | null {
    const lignes = extras.filter((e) => cleNom(e.nom) === cle).sort((a, b) => b.date.localeCompare(a.date));
    return lignes[0] ?? connues.get(cle) ?? extrasInitiaux.find((e) => cleNom(e.nom) === cle) ?? null;
  }

  // Lignes du planning : tous ceux qui mangent cette semaine ou la précédente
  // (à l'ouverture ou depuis), plus ceux ajoutés à l'instant. Triées par nom :
  // une ligne ne bouge ni ne disparaît quand on décoche.
  const personnes = new Map<string, Personne>();
  for (const c of [...commandesInitiales, ...commandes]) {
    const client = parClient.get(c.client_id);
    if (!client || personnes.has(`c:${client.id}`)) continue;
    personnes.set(`c:${client.id}`, {
      cle: `c:${client.id}`,
      clientId: client.id,
      nom: client.nom,
      palier: client.palier,
      allergies: client.cuisine_allergies,
      refus: client.cuisine_refus,
    });
  }
  for (const e of [...extrasInitiaux, ...extras]) {
    const cle = `m:${cleNom(e.nom)}`;
    if (personnes.has(cle)) continue;
    const f = ficheMain(cleNom(e.nom)) ?? e;
    personnes.set(cle, { cle, clientId: null, nom: f.nom, palier: f.palier, allergies: f.allergies, refus: f.refus });
  }
  for (const p of ajoutees) if (!personnes.has(p.cle)) personnes.set(p.cle, p);
  const liste = Array.from(personnes.values()).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const commandeDe = (p: Personne, date: string, service: Service) =>
    commandes.find((c) => c.client_id === p.clientId && c.date_livraison === date && c.repas_type === service);
  const extraDe = (p: Personne, date: string, service: Service) =>
    extras.find((e) => `m:${cleNom(e.nom)}` === p.cle && e.date === date && e.repas_type === service);
  const coche = (p: Personne, date: string, service: Service) =>
    !!(p.clientId ? commandeDe(p, date, service) : extraDe(p, date, service));

  const totalJour = (date: string, service: Service) =>
    commandes.filter((c) => c.date_livraison === date && c.repas_type === service && parClient.has(c.client_id)).length +
    extras.filter((e) => e.date === date && e.repas_type === service).length;
  const totalSemaine = jours.reduce((t, d) => t + totalJour(d, "dejeuner") + totalJour(d, "diner"), 0);
  const repasPersonne = (p: Personne) => jours.reduce((t, d) => t + SERVICES.filter((s) => coche(p, d, s.cle)).length, 0);

  // Ajoute ou retire un repas (une case du planning).
  async function poser(p: Personne, date: string, service: Service, voulu: boolean) {
    const id = `${p.cle}|${date}|${service}`;
    if (enCours.has(id) || coche(p, date, service) === voulu) return;
    setEnCours((s) => new Set(s).add(id));
    try {
      if (p.clientId) {
        const existante = commandeDe(p, date, service);
        if (existante) {
          const { error } = await supabase.from("application_commandes").delete().eq("id", existante.id);
          if (error) throw error;
          setCommandes((prev) => prev.filter((c) => c.id !== existante.id));
        } else {
          const { data, error } = await supabase
            .from("application_commandes")
            .upsert(
              { client_id: p.clientId, date_livraison: date, repas_type: service, statut: "confirmee" },
              { onConflict: "client_id,date_livraison,repas_type" }
            )
            .select("id, client_id, date_livraison, repas_type, note, palier")
            .single<CommandeSemaine>();
          if (error || !data) throw error;
          setCommandes((prev) => [...prev, data]);
        }
      } else {
        const existant = extraDe(p, date, service);
        if (existant) {
          const { error } = await supabase.from("application_cuisine_extras").delete().eq("id", existant.id);
          if (error) throw error;
          setExtras((prev) => prev.filter((e) => e.id !== existant.id));
        } else {
          const f = ficheMain(p.cle.slice(2));
          const { data, error } = await supabase
            .from("application_cuisine_extras")
            .insert({
              date,
              repas_type: service,
              nom: f?.nom ?? p.nom,
              palier: f ? f.palier : p.palier,
              allergies: f ? f.allergies : p.allergies,
              refus: f ? f.refus : p.refus,
              adresse: f?.adresse ?? null,
              lat: f?.lat ?? null,
              lng: f?.lng ?? null,
              telephone: f?.telephone ?? null,
              complement: f?.complement ?? null,
            })
            .select(CHAMPS_EXTRA)
            .single<ExtraSemaine>();
          if (error || !data) throw error;
          setExtras((prev) => [...prev, data]);
        }
      }
      setMessage("");
    } catch {
      setMessage("Enregistrement impossible, vérifiez la connexion et réessayez.");
    } finally {
      setEnCours((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function toutLaSemaine(p: Personne, service: Service) {
    setActions(null);
    for (const d of jours) await poser(p, d, service, true);
  }

  async function effacerSemaine(p: Personne) {
    setActions(null);
    if (!window.confirm(`Retirer tous les repas de ${p.nom} cette semaine ?`)) return;
    for (const d of jours) for (const s of SERVICES) await poser(p, d, s.cle, false);
  }

  // Reprend la semaine précédente, jour par jour (lundi → lundi…), sans
  // toucher à ce qui est déjà coché cette semaine.
  const aReprendre =
    commandes.filter((c) => c.date_livraison < lundi && !commandes.some((x) => x.client_id === c.client_id && x.repas_type === c.repas_type && x.date_livraison === decalerDate(c.date_livraison, 7))).length +
    extras.filter((e) => e.date < lundi && !extras.some((x) => cleNom(x.nom) === cleNom(e.nom) && x.repas_type === e.repas_type && x.date === decalerDate(e.date, 7))).length;

  async function reprendreSemaineAvant() {
    if (!window.confirm(`Ajouter les ${aReprendre} repas de la semaine dernière (mêmes jours, midi et soir) ?`)) return;
    setEnCours((s) => new Set(s).add("reprise"));
    const nouvellesCommandes = commandes
      .filter((c) => c.date_livraison < lundi && parClient.has(c.client_id))
      .map((c) => ({
        client_id: c.client_id,
        date_livraison: decalerDate(c.date_livraison, 7),
        repas_type: c.repas_type,
        statut: "confirmee",
        note: c.note,
        palier: c.palier,
      }))
      .filter((c) => !commandes.some((x) => x.client_id === c.client_id && x.repas_type === c.repas_type && x.date_livraison === c.date_livraison));
    const nouveauxExtras = extras
      .filter((e) => e.date < lundi)
      .map(({ id: _id, date, ...e }) => ({ ...e, date: decalerDate(date, 7) }))
      .filter((e) => !extras.some((x) => cleNom(x.nom) === cleNom(e.nom) && x.repas_type === e.repas_type && x.date === e.date));
    const [rc, re] = await Promise.all([
      nouvellesCommandes.length
        ? supabase
            .from("application_commandes")
            .upsert(nouvellesCommandes, { onConflict: "client_id,date_livraison,repas_type", ignoreDuplicates: true })
            .select("id, client_id, date_livraison, repas_type, note, palier")
            .returns<CommandeSemaine[]>()
        : { data: [] as CommandeSemaine[], error: null },
      nouveauxExtras.length
        ? supabase.from("application_cuisine_extras").insert(nouveauxExtras).select(CHAMPS_EXTRA).returns<ExtraSemaine[]>()
        : { data: [] as ExtraSemaine[], error: null },
    ]);
    setCommandes((prev) => [...prev, ...(rc.data ?? [])]);
    setExtras((prev) => [...prev, ...(re.data ?? [])]);
    setMessage(rc.error || re.error ? "Reprise incomplète, réessayez." : "Semaine dernière reprise : ajustez les cases.");
    setEnCours((s) => {
      const n = new Set(s);
      n.delete("reprise");
      return n;
    });
  }

  // Recherche : personnes connues (et clients de l'appli) pas encore dans le planning.
  const saisie = sansAccents(recherche);
  const suggestions = saisie
    ? [
        ...clients.map((c) => ({ cle: `c:${c.id}`, clientId: c.id, nom: c.nom, palier: c.palier, allergies: c.cuisine_allergies, refus: c.cuisine_refus })),
        ...personnesConnues.map((p) => ({ cle: `m:${cleNom(p.nom)}`, clientId: null, nom: p.nom, palier: p.palier, allergies: p.allergies, refus: p.refus })),
      ]
        .filter((p) => !personnes.has(p.cle))
        .filter((p) => sansAccents(p.nom).startsWith(saisie) || sansAccents(p.nom).split(/\s+/).some((m) => m.startsWith(saisie)))
        .slice(0, 6)
    : [];
  const dejaLa = saisie ? liste.filter((p) => sansAccents(p.nom).includes(saisie)) : [];

  function ajouterAuPlanning(p: Personne) {
    setAjoutees((prev) => [...prev, p]);
    setRecherche("");
    setNouvelle(null);
    setMessage(`${p.nom} est dans le planning : cochez ses repas.`);
  }

  function creerPersonne() {
    if (!nouvelle) return;
    const nom = nouvelle.nom.trim().slice(0, 80);
    if (!nom) return setMessage("Indiquez un nom.");
    if (personnes.has(`m:${cleNom(nom)}`) || connues.has(cleNom(nom))) return setMessage("Ce nom existe déjà : choisissez-le dans la liste.");
    const texte = (t: string) => t.trim().slice(0, 300) || null;
    ajouterAuPlanning({ cle: `m:${cleNom(nom)}`, clientId: null, nom, palier: nouvelle.palier || null, allergies: texte(nouvelle.allergies), refus: texte(nouvelle.refus) });
  }

  const titreSemaine = `${dateCourte(lundi, { day: "numeric", month: "short" })} – ${dateCourte(vendredi, { day: "numeric", month: "short" })}`;
  const grille = "grid grid-cols-[30px_repeat(5,minmax(0,1fr))] gap-1";

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Planning <em>semaine</em>
          </h1>
        </div>
        <Link href="/admin/cuisine" className="pb-1 whitespace-nowrap text-sm font-bold text-c2b-green underline underline-offset-4">
          Fiche du jour
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-full bg-white border border-c2b-green/10 px-1 py-1">
        <Link
          href={`/admin/cuisine/semaine?lundi=${lundiAvant}`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
          aria-label="Semaine précédente"
        >
          <ChevronLeft size={20} />
        </Link>
        <span className="text-sm font-bold text-c2b-green">
          {titreSemaine} · {totalSemaine} repas
        </span>
        <Link
          href={`/admin/cuisine/semaine?lundi=${decalerDate(lundi, 7)}`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
          aria-label="Semaine suivante"
        >
          <ChevronRight size={20} />
        </Link>
      </div>

      <p className="text-sm text-c2b-muted">
        Cochez ☀️ midi et 🌙 soir pour chaque jour. Chaque case cochée apparaît sur la fiche cuisine du jour (touchez un jour pour l&apos;ouvrir).
      </p>

      {aReprendre > 0 && (
        <button onClick={reprendreSemaineAvant} disabled={enCours.has("reprise")} className="btn-secondary w-full">
          <CopyPlus size={17} /> {enCours.has("reprise") ? "Reprise..." : `Reprendre la semaine dernière (${aReprendre})`}
        </button>
      )}

      {/* Totaux du jour, toujours visibles en haut. */}
      <div className="sticky top-[68px] md:top-20 z-10 -mx-4 bg-c2b-cream/95 px-4 py-2 backdrop-blur">
        <div className={grille}>
          <span />
          {jours.map((d) => (
            <Link
              key={d}
              href={`/admin/cuisine?date=${d}`}
              className={`rounded-lg py-1 text-center leading-tight ${d === aujourdhui ? "bg-c2b-gold/20" : "hover:bg-c2b-green/[0.06]"}`}
            >
              <span className="block text-[11px] font-bold uppercase text-c2b-green">{dateCourte(d, { weekday: "short" }).replace(".", "")}</span>
              <span className="block text-[11px] text-c2b-muted">{dateCourte(d, { day: "numeric" })}</span>
              <span className="block text-[11px] tabular-nums text-c2b-text">
                ☀️{totalJour(d, "dejeuner")} 🌙{totalJour(d, "diner")}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {message && <p className="text-sm font-semibold text-c2b-green">{message}</p>}

      {liste.length === 0 && (
        <section className="carte p-5 text-center text-sm text-c2b-muted">
          Personne cette semaine. Ajoutez des personnes ci-dessous{aReprendre > 0 ? " ou reprenez la semaine dernière" : ""}.
        </section>
      )}

      <ul className="space-y-2">
        {liste.map((p) => {
          const n = repasPersonne(p);
          return (
            <li key={p.cle} className={`carte p-3 ${n === 0 ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-c2b-green">
                    {p.nom}
                    <span className="ml-2 rounded-full bg-c2b-gold/[0.15] px-2 py-0.5 text-[11px] font-bold text-c2b-green">
                      {p.palier ?? "Sans palier"}
                    </span>
                    <span className="ml-1.5 text-[11px] font-semibold text-c2b-muted">
                      {n} repas{p.clientId ? " · appli" : ""}
                    </span>
                  </p>
                  {(p.allergies || p.refus) && (
                    <p className="mt-0.5 truncate text-xs text-c2b-muted">
                      {p.allergies && <span className="font-bold text-red-700">⚠️ {p.allergies} </span>}
                      {p.refus && <span>· sans {p.refus}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActions(actions === p.cle ? null : p.cle)}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-c2b-muted hover:bg-c2b-green/[0.06]"
                  aria-label={`Raccourcis pour ${p.nom}`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>

              {actions === p.cle && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SERVICES.map((s) => (
                    <button
                      key={s.cle}
                      onClick={() => toutLaSemaine(p, s.cle)}
                      className="rounded-full bg-white border border-c2b-green/15 px-3 py-1.5 text-xs font-bold text-c2b-green"
                    >
                      {s.icone} {s.libelle} tous les jours
                    </button>
                  ))}
                  <button
                    onClick={() => effacerSemaine(p)}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700"
                  >
                    Tout décocher
                  </button>
                </div>
              )}

              <div className={`mt-2 ${grille}`}>
                <span />
                {jours.map((d) => (
                  <span key={d} className="text-center text-[10px] font-bold uppercase text-c2b-muted">
                    {dateCourte(d, { weekday: "short" }).replace(".", "")}
                  </span>
                ))}
                {SERVICES.map((s) => (
                  <Fragment key={s.cle}>
                    <span className="flex items-center justify-center text-base" title={s.libelle}>
                      {s.icone}
                    </span>
                    {jours.map((d) => {
                      const actif = coche(p, d, s.cle);
                      const attente = enCours.has(`${p.cle}|${d}|${s.cle}`);
                      return (
                        <button
                          key={d}
                          onClick={() => poser(p, d, s.cle, !actif)}
                          disabled={attente}
                          aria-pressed={actif}
                          aria-label={`${p.nom}, ${s.libelle.toLowerCase()} ${dateCourte(d, { weekday: "long" })}`}
                          className={`h-10 rounded-xl text-sm font-bold transition ${
                            actif ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-transparent"
                          } ${attente ? "opacity-50" : ""} ${d < aujourdhui ? "opacity-60" : ""}`}
                        >
                          ✓
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Ajouter quelqu'un au planning : nom connu, ou nouvelle personne. */}
      <section className="carte p-4 space-y-3">
        <p className="flex items-center gap-2 font-bold text-c2b-green">
          <UserPlus size={17} /> Ajouter une personne
        </p>
        {nouvelle ? (
          <>
            <input
              autoFocus
              value={nouvelle.nom}
              onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })}
              placeholder="Nom (ex : Yasmine B.)"
              maxLength={80}
              autoComplete="off"
              className="champ py-2.5"
            />
            <div className="flex flex-wrap gap-1.5">
              {PALIERS.map((pl) => (
                <button
                  key={pl}
                  onClick={() => setNouvelle({ ...nouvelle, palier: nouvelle.palier === pl ? "" : pl })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    nouvelle.palier === pl ? "bg-c2b-gold text-c2b-green" : "bg-white border border-c2b-green/15 text-c2b-green"
                  }`}
                >
                  {libellePalier(pl)}
                </button>
              ))}
            </div>
            <input
              value={nouvelle.allergies}
              onChange={(e) => setNouvelle({ ...nouvelle, allergies: e.target.value })}
              placeholder="Allergies (facultatif)"
              maxLength={300}
              className="champ py-2.5 text-sm"
            />
            <input
              value={nouvelle.refus}
              onChange={(e) => setNouvelle({ ...nouvelle, refus: e.target.value })}
              placeholder="Ne mange pas (ex : parmesan, oignon)"
              maxLength={300}
              className="champ py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={creerPersonne} className="btn-primary flex-1 py-2.5 text-sm">
                Ajouter au planning
              </button>
              <button onClick={() => setNouvelle(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-c2b-muted" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Tapez un nom"
                maxLength={80}
                autoComplete="off"
                className="champ py-2.5 pl-9"
              />
            </div>
            {saisie && (
              <ul className="overflow-hidden rounded-xl border border-c2b-green/10 bg-white">
                {suggestions.map((p) => (
                  <li key={p.cle}>
                    <button
                      onClick={() => ajouterAuPlanning(p)}
                      className="w-full border-b border-c2b-green/5 px-3 py-2 text-left hover:bg-c2b-cream"
                    >
                      <span className="text-sm font-bold text-c2b-green">{p.nom}</span>
                      <span className="ml-1.5 text-xs text-c2b-muted">
                        {[p.palier && libellePalier(p.palier), p.clientId && "appli"].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
                {dejaLa.map((p) => (
                  <li key={p.cle} className="border-b border-c2b-green/5 px-3 py-2 text-sm text-c2b-muted">
                    <strong className="text-c2b-green">{p.nom}</strong> est déjà dans le planning
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => {
                      setNouvelle({ nom: recherche.trim(), palier: "", allergies: "", refus: "" });
                      setRecherche("");
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-bold text-c2b-green hover:bg-c2b-cream"
                  >
                    + Nouvelle personne « {recherche.trim()} »
                  </button>
                </li>
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
