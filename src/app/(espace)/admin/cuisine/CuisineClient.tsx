"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy, FileDown, Pencil, Printer, Send, UserPlus, X } from "lucide-react";
import type { jsPDF as JsPDF } from "jspdf";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate, libelleDate } from "@/lib/dates";
import { genererFichePdf, libellePalier, type LigneFiche, type ServiceFiche } from "@/lib/fiche-cuisine-pdf";
import type { Palier } from "@/lib/types";

type Service = "dejeuner" | "diner";

export interface ClientCuisine {
  id: string;
  nom: string;
  palier: Palier | null;
  cuisine_allergies: string | null;
  cuisine_refus: string | null;
  repas_habituels: Service[];
}

export interface CommandeCuisine {
  id: string;
  client_id: string;
  repas_type: Service;
  note: string | null;
  palier: Palier | null; // palier du jour, sinon celui du client
}

// Personne ajoutée à la main sur la fiche (sans compte dans l'appli).
export interface AjoutCuisine {
  id: string;
  repas_type: Service;
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
}

const SERVICES: { cle: Service; libelle: string; court: string; icone: string }[] = [
  { cle: "dejeuner", libelle: "Midi", court: "MIDI", icone: "☀️" },
  { cle: "diner", libelle: "Soir", court: "SOIR", icone: "🌙" },
];
const PALIERS: Palier[] = ["P1", "P2", "P3", "P4", "P5", "P6"];

// « Rebecca Sturm » → « Rebecca S. » : court, et distingue deux prénoms identiques.
function nomCourt(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  const initiale = reste.at(-1)?.[0];
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1);
  return initiale ? `${p} ${initiale.toUpperCase()}.` : p;
}

const dateLongue = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const AJOUT_VIDE = { nom: "", services: ["dejeuner"] as Service[], palier: "" as Palier | "", allergies: "", refus: "", note: "" };

export function CuisineClient({
  date,
  aujourdhui,
  clients: clientsInitiaux,
  commandesInitiales,
  platsInitiaux,
  ajoutsInitiaux,
}: {
  date: string;
  aujourdhui: string;
  clients: ClientCuisine[];
  commandesInitiales: CommandeCuisine[];
  platsInitiaux: Record<Service, string>;
  ajoutsInitiaux: AjoutCuisine[];
}) {
  const supabase = createClient();
  const [clients, setClients] = useState(clientsInitiaux);
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [plats, setPlats] = useState(platsInitiaux);
  const [ajouts, setAjouts] = useState(ajoutsInitiaux);
  const [nouvelAjout, setNouvelAjout] = useState<typeof AJOUT_VIDE | null>(null);
  const [edition, setEdition] = useState<{ id: string; allergies: string; refus: string; habituels: Service[] } | null>(null);
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);
  // Bibliothèque PDF chargée d'avance : le PDF se fabrique sans attente au
  // toucher, ce qu'exige le partage sur iPhone.
  const [JsPdf, setJsPdf] = useState<typeof JsPDF | null>(null);
  useEffect(() => {
    import("jspdf").then((m) => setJsPdf(() => m.jsPDF)).catch(() => {});
  }, []);

  const parClient = new Map(clients.map((c) => [c.id, c]));
  const commande = (clientId: string, service: Service) =>
    commandes.find((c) => c.client_id === clientId && c.repas_type === service);

  // Fiche : pour chaque service, clients et ajouts regroupés par palier.
  const fiche: (ServiceFiche & { cle: Service; icone: string; libelle: string })[] = SERVICES.map((s) => {
    const lignes: (LigneFiche & { ajout: boolean })[] = [
      ...commandes
        .filter((c) => c.repas_type === s.cle && parClient.has(c.client_id))
        .map((c) => {
          const client = parClient.get(c.client_id)!;
          return {
            cle: c.id,
            nom: nomCourt(client.nom),
            palier: c.palier ?? client.palier,
            allergies: client.cuisine_allergies,
            refus: client.cuisine_refus,
            note: c.note,
            ajout: false,
          };
        }),
      ...ajouts
        .filter((a) => a.repas_type === s.cle)
        .map((a) => ({ cle: a.id, nom: a.nom, palier: a.palier, allergies: a.allergies, refus: a.refus, note: a.note, ajout: true })),
    ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const paliers = [...PALIERS, null]
      .map((p) => ({ palier: p, lignes: lignes.filter((l) => l.palier === p) }))
      .filter((g) => g.lignes.length > 0);
    return { ...s, plat: plats[s.cle].trim(), total: lignes.length, paliers };
  });
  const total = fiche.reduce((t, s) => t + s.total, 0);
  const nbAllergies = fiche.reduce((t, s) => t + s.paliers.reduce((u, g) => u + g.lignes.filter((l) => l.allergies).length, 0), 0);
  const habitudes = SERVICES.map((s) => ({ ...s, n: clients.filter((c) => c.repas_habituels.includes(s.cle)).length }));

  function texteFiche() {
    const lignes = [`*FICHE CUISINE — ${dateLongue(date)}*`, `Total : ${total} repas (${fiche.map((s) => `${s.total} ${s.libelle.toLowerCase()}`).join(" · ")})`];
    for (const s of fiche) {
      lignes.push("", `*${s.icone} ${s.court}${s.plat ? ` (${s.plat})` : ""} : ${s.total} repas*`);
      if (s.total === 0) lignes.push("Aucun repas");
      for (const g of s.paliers) {
        lignes.push(`*${libellePalier(g.palier)}*`);
        for (const l of g.lignes) {
          const details = [
            l.allergies && `⚠️ ALLERGIE : ${l.allergies}`,
            l.refus && `sans : ${l.refus}`,
            l.note && `→ ${l.note}`,
          ].filter(Boolean);
          lignes.push(`• ${l.nom}${details.length ? ` — ${details.join(" — ")}` : ""}`);
        }
        lignes.push(`_Total ${libellePalier(g.palier).toLowerCase()} : ${g.lignes.length}_`);
      }
    }
    return lignes.join("\n");
  }

  async function envoyerPdf() {
    if (!JsPdf) return setMessage("Préparation du PDF, réessayez dans une seconde.");
    const blob = genererFichePdf(JsPdf, { titreDate: dateLongue(date), services: fiche });
    const fichier = new File([blob], `fiche-cuisine-${date}.pdf`, { type: "application/pdf" });
    // Téléphone : menu de partage (WhatsApp, mail…). Sinon : téléchargement.
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: `Fiche cuisine ${dateLongue(date)}` });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = fichier.name;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function preparer() {
    setEnCours(true);
    const lignes = clients.flatMap((c) =>
      c.repas_habituels.map((service) => ({ client_id: c.id, date_livraison: date, repas_type: service, statut: "confirmee" }))
    );
    const { data, error } = await supabase
      .from("application_commandes")
      .upsert(lignes, { onConflict: "client_id,date_livraison,repas_type" })
      .select("id, client_id, repas_type, note, palier")
      .returns<CommandeCuisine[]>();
    setEnCours(false);
    if (error) return setMessage("Préparation impossible, réessayez.");
    setCommandes(data ?? []);
  }

  async function basculer(client: ClientCuisine, service: Service) {
    const existante = commande(client.id, service);
    if (existante) {
      const { error } = await supabase.from("application_commandes").delete().eq("id", existante.id);
      if (!error) setCommandes((prev) => prev.filter((c) => c.id !== existante.id));
      return;
    }
    const { data, error } = await supabase
      .from("application_commandes")
      .upsert(
        { client_id: client.id, date_livraison: date, repas_type: service, statut: "confirmee" },
        { onConflict: "client_id,date_livraison,repas_type" }
      )
      .select("id, client_id, repas_type, note, palier")
      .single<CommandeCuisine>();
    if (!error && data) setCommandes((prev) => [...prev, data]);
  }

  async function modifierCommande(c: CommandeCuisine, maj: Partial<Pick<CommandeCuisine, "note" | "palier">>) {
    const { error } = await supabase.from("application_commandes").update(maj).eq("id", c.id);
    if (!error) setCommandes((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...maj } : x)));
  }

  async function enregistrerPlat(service: Service, valeur: string) {
    const plat = valeur.trim().slice(0, 120) || null;
    await supabase
      .from("application_cuisine_services")
      .upsert({ date, repas_type: service, plat }, { onConflict: "date,repas_type" });
  }

  async function ajouterPersonne() {
    if (!nouvelAjout) return;
    const nom = nouvelAjout.nom.trim().slice(0, 80);
    if (!nom) return setMessage("Indiquez un nom.");
    if (nouvelAjout.services.length === 0) return setMessage("Choisissez midi, soir ou les deux.");
    const texte = (t: string, max: number) => t.trim().slice(0, max) || null;
    const { data, error } = await supabase
      .from("application_cuisine_extras")
      .insert(
        nouvelAjout.services.map((service) => ({
          date,
          repas_type: service,
          nom,
          palier: nouvelAjout.palier || null,
          allergies: texte(nouvelAjout.allergies, 300),
          refus: texte(nouvelAjout.refus, 300),
          note: texte(nouvelAjout.note, 200),
        }))
      )
      .select("id, repas_type, nom, palier, allergies, refus, note")
      .returns<AjoutCuisine[]>();
    if (error) return setMessage("Ajout impossible, réessayez.");
    setAjouts((prev) => [...prev, ...(data ?? [])]);
    setNouvelAjout(null);
    setMessage("");
  }

  async function retirerAjout(id: string) {
    const { error } = await supabase.from("application_cuisine_extras").delete().eq("id", id);
    if (!error) setAjouts((prev) => prev.filter((a) => a.id !== id));
  }

  async function enregistrerPreferences() {
    if (!edition) return;
    const maj = {
      cuisine_allergies: edition.allergies.trim().slice(0, 300) || null,
      cuisine_refus: edition.refus.trim().slice(0, 300) || null,
      repas_habituels: edition.habituels,
    };
    const { error } = await supabase.from("application_clients").update(maj).eq("id", edition.id);
    if (error) return setMessage("Enregistrement impossible, réessayez.");
    setClients((prev) => prev.map((c) => (c.id === edition.id ? { ...c, ...maj } : c)));
    setEdition(null);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(texteFiche());
      setMessage("Fiche copiée : collez-la dans WhatsApp.");
    } catch {
      setMessage("Copie impossible sur cet appareil.");
    }
  }

  const libelleJour =
    libelleDate(date, aujourdhui) === "Aujourd'hui" || libelleDate(date, aujourdhui) === "Hier"
      ? libelleDate(date, aujourdhui)
      : date === decalerDate(aujourdhui, 1)
        ? "Demain"
        : new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6 print:max-w-none print:p-0">
      <div className="print:hidden space-y-6">
        <AdminOnglets />
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="lbl mb-2">Espace admin</span>
            <h1 className="titre text-[34px]">
              Fiche <em>cuisine</em>
            </h1>
          </div>
          <div className="flex items-center gap-1 pb-1">
            <Link
              href={`/admin/cuisine?date=${decalerDate(date, -1)}`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
              aria-label="Jour précédent"
            >
              <ChevronLeft size={20} />
            </Link>
            <span className="min-w-[92px] text-center text-sm font-bold text-c2b-green first-letter:uppercase">{libelleJour}</span>
            <Link
              href={`/admin/cuisine?date=${decalerDate(date, 1)}`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
              aria-label="Jour suivant"
            >
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>

        {commandes.length === 0 && ajouts.length === 0 && (
          <section className="carte border-c2b-gold/50 p-5 space-y-3">
            <p className="font-bold text-c2b-green">La fiche du {dateLongue(date)} n&apos;est pas encore préparée.</p>
            <p className="text-sm text-c2b-muted">
              Elle reprend les repas habituels de chaque client ({habitudes.map((h) => `${h.n} ${h.libelle.toLowerCase()}`).join(", ")}).
              Vous ajustez ensuite les absents, les paliers et ajoutez des noms à la main.
            </p>
            <button onClick={preparer} disabled={enCours} className="btn-primary w-full">
              {enCours ? "Préparation..." : "Préparer la fiche"}
            </button>
          </section>
        )}
      </div>

      {/* La fiche elle-même : seule partie imprimée. */}
      <section className="carte p-5 print:border-0 print:p-0">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-c2b-green pb-2">
          <h2 className="font-serif text-2xl text-c2b-green first-letter:uppercase">Fiche cuisine · {dateLongue(date)}</h2>
          <span className="text-sm font-bold text-c2b-green whitespace-nowrap">{total} repas</span>
        </div>
        {nbAllergies > 0 && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 print:border print:border-red-700">
            ⚠️ {nbAllergies} repas avec allergie : bien vérifier avant de fermer les boîtes.
          </p>
        )}
        <div className="mt-3 grid gap-5 md:grid-cols-2 print:grid-cols-2">
          {fiche.map((s) => (
            <div key={s.cle}>
              <h3 className="flex items-baseline justify-between gap-2 rounded-lg bg-c2b-green px-3 py-2 text-c2b-cream print:bg-white print:text-c2b-green print:border-2 print:border-c2b-green">
                <span className="font-bold">
                  {s.icone} {s.court}
                  {s.plat && <span className="font-semibold"> ({s.plat})</span>}
                </span>
                <span className="text-lg font-bold whitespace-nowrap">{s.total} repas</span>
              </h3>
              <input
                defaultValue={plats[s.cle]}
                onChange={(e) => setPlats((p) => ({ ...p, [s.cle]: e.target.value }))}
                onBlur={(e) => enregistrerPlat(s.cle, e.target.value)}
                placeholder={`Nom du plat du ${s.libelle.toLowerCase()}`}
                maxLength={120}
                className="champ mt-2 py-2 text-sm print:hidden"
              />
              {s.total === 0 ? (
                <p className="px-1 py-3 text-sm text-c2b-muted">Aucun repas</p>
              ) : (
                s.paliers.map((g) => (
                  <div key={g.palier ?? "aucun"} className="mt-3">
                    <p className="border-b border-c2b-green/20 pb-1 text-sm font-bold text-c2b-green">{libellePalier(g.palier)}</p>
                    <ul className="mt-1 space-y-1">
                      {g.lignes.map((l) => (
                        <li key={l.cle} className="flex items-start gap-1 text-sm leading-snug">
                          <span className="flex-1">
                            <span className="font-bold text-c2b-green">{l.nom}</span>
                            {l.allergies && <span className="ml-1.5 font-bold text-red-700">⚠️ {l.allergies}</span>}
                            {l.refus && <span className="text-c2b-text"> · sans {l.refus}</span>}
                            {l.note && <span className="italic text-c2b-text"> · {l.note}</span>}
                          </span>
                          {l.ajout && (
                            <button
                              onClick={() => retirerAjout(l.cle)}
                              className="print:hidden flex-shrink-0 text-c2b-muted hover:text-red-600"
                              aria-label={`Retirer ${l.nom}`}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-right text-xs font-bold text-c2b-muted">
                      Total {libellePalier(g.palier).toLowerCase()} : {g.lignes.length}
                    </p>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="print:hidden space-y-6">
        {total > 0 && (
          <div className="space-y-2">
            <button onClick={envoyerPdf} className="btn-primary w-full py-3.5">
              <FileDown size={18} /> Envoyer la fiche en PDF
            </button>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(texteFiche())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
              >
                <Send size={15} /> Texte
              </a>
              <button onClick={copier} className="btn-secondary px-3 py-2 text-sm">
                <Copy size={15} /> Copier
              </button>
              <button onClick={() => window.print()} className="btn-secondary px-3 py-2 text-sm">
                <Printer size={15} /> Imprimer
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-sm font-semibold text-c2b-green">{message}</p>}

        {/* Ajout à la main : n'importe quel nom, dans le palier voulu. */}
        {nouvelAjout ? (
          <section className="carte p-4 space-y-3">
            <p className="font-bold text-c2b-green">Ajouter une personne</p>
            <input
              autoFocus
              value={nouvelAjout.nom}
              onChange={(e) => setNouvelAjout({ ...nouvelAjout, nom: e.target.value })}
              placeholder="Nom (ex : Yasmine B.)"
              maxLength={80}
              className="champ py-2.5"
            />
            <div className="grid grid-cols-2 gap-2">
              {SERVICES.map((s) => {
                const coche = nouvelAjout.services.includes(s.cle);
                return (
                  <button
                    key={s.cle}
                    onClick={() =>
                      setNouvelAjout({
                        ...nouvelAjout,
                        services: coche ? nouvelAjout.services.filter((x) => x !== s.cle) : [...nouvelAjout.services, s.cle],
                      })
                    }
                    className={`rounded-full py-2 text-sm font-bold ${
                      coche ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-muted"
                    }`}
                  >
                    {s.icone} {s.libelle}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PALIERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setNouvelAjout({ ...nouvelAjout, palier: nouvelAjout.palier === p ? "" : p })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    nouvelAjout.palier === p ? "bg-c2b-gold text-c2b-green" : "bg-white border border-c2b-green/15 text-c2b-green"
                  }`}
                >
                  {libellePalier(p)}
                </button>
              ))}
            </div>
            <input
              value={nouvelAjout.allergies}
              onChange={(e) => setNouvelAjout({ ...nouvelAjout, allergies: e.target.value })}
              placeholder="Allergies (facultatif)"
              maxLength={300}
              className="champ py-2.5 text-sm"
            />
            <input
              value={nouvelAjout.refus}
              onChange={(e) => setNouvelAjout({ ...nouvelAjout, refus: e.target.value })}
              placeholder="Ne mange pas (ex : parmesan, oignon)"
              maxLength={300}
              className="champ py-2.5 text-sm"
            />
            <input
              value={nouvelAjout.note}
              onChange={(e) => setNouvelAjout({ ...nouvelAjout, note: e.target.value })}
              placeholder="Consigne (facultatif)"
              maxLength={200}
              className="champ py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={ajouterPersonne} className="btn-primary flex-1 py-2.5 text-sm">
                Ajouter à la fiche
              </button>
              <button onClick={() => setNouvelAjout(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Annuler
              </button>
            </div>
          </section>
        ) : (
          <button onClick={() => setNouvelAjout(AJOUT_VIDE)} className="btn-secondary w-full">
            <UserPlus size={17} /> Ajouter une personne à la main
          </button>
        )}

        <section className="space-y-2">
          <h2 className="font-serif text-2xl text-c2b-green">Clients de l&apos;appli</h2>
          <p className="text-sm text-c2b-muted">
            Touchez Midi ou Soir pour ajouter ou retirer un repas. Sous chaque repas : le palier du jour et une consigne.
          </p>
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.id} className="carte p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-c2b-green">
                      {c.nom}
                      <span className="ml-2 rounded-full bg-c2b-gold/[0.15] px-2 py-0.5 text-[11px] font-bold text-c2b-green">
                        {c.palier ?? "Sans palier"}
                      </span>
                    </p>
                    {(c.cuisine_allergies || c.cuisine_refus) && (
                      <p className="mt-0.5 text-xs text-c2b-muted">
                        {c.cuisine_allergies && <span className="font-bold text-red-700">⚠️ {c.cuisine_allergies} </span>}
                        {c.cuisine_refus && <span>· sans {c.cuisine_refus}</span>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setEdition({
                        id: c.id,
                        allergies: c.cuisine_allergies ?? "",
                        refus: c.cuisine_refus ?? "",
                        habituels: c.repas_habituels,
                      })
                    }
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-c2b-muted hover:bg-c2b-green/[0.06]"
                    aria-label={`Préférences cuisine de ${c.nom}`}
                  >
                    <Pencil size={15} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SERVICES.map((s) => {
                    const actif = !!commande(c.id, s.cle);
                    return (
                      <button
                        key={s.cle}
                        onClick={() => basculer(c, s.cle)}
                        className={`rounded-full py-2 text-sm font-bold transition ${
                          actif ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-muted"
                        }`}
                        aria-pressed={actif}
                      >
                        {s.icone} {s.libelle}
                      </button>
                    );
                  })}
                </div>
                {SERVICES.map((s) => {
                  const cmd = commande(c.id, s.cle);
                  return (
                    cmd && (
                      <div key={cmd.id} className="mt-2 flex gap-2">
                        <select
                          value={cmd.palier ?? c.palier ?? ""}
                          onChange={(e) =>
                            modifierCommande(cmd, {
                              palier: e.target.value && e.target.value !== c.palier ? (e.target.value as Palier) : null,
                            })
                          }
                          className="champ w-[104px] flex-shrink-0 py-2 text-sm"
                          aria-label={`Palier du ${s.libelle.toLowerCase()}`}
                        >
                          <option value="">Sans palier</option>
                          {PALIERS.map((p) => (
                            <option key={p} value={p}>
                              {s.icone} {p}
                            </option>
                          ))}
                        </select>
                        <input
                          key={`${cmd.id}-${cmd.note ?? ""}`}
                          defaultValue={cmd.note ?? ""}
                          onBlur={(e) => {
                            const note = e.target.value.trim().slice(0, 200) || null;
                            if (note !== cmd.note) modifierCommande(cmd, { note });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          placeholder={`Consigne ${s.libelle.toLowerCase()} (facultatif)`}
                          maxLength={200}
                          className="champ py-2 text-sm"
                        />
                      </div>
                    )
                  );
                })}

                {edition?.id === c.id && (
                  <div className="mt-3 space-y-2 rounded-2xl bg-c2b-cream p-3">
                    <label className="block text-xs font-bold text-c2b-muted">
                      Allergies / intolérances
                      <input
                        value={edition.allergies}
                        onChange={(e) => setEdition({ ...edition, allergies: e.target.value })}
                        placeholder="Ex : fruits à coque, lactose"
                        maxLength={300}
                        className="champ mt-1 py-2 text-sm font-medium"
                      />
                    </label>
                    <label className="block text-xs font-bold text-c2b-muted">
                      Ne mange pas
                      <input
                        value={edition.refus}
                        onChange={(e) => setEdition({ ...edition, refus: e.target.value })}
                        placeholder="Ex : parmesan, oignon"
                        maxLength={300}
                        className="champ mt-1 py-2 text-sm font-medium"
                      />
                    </label>
                    <p className="text-xs font-bold text-c2b-muted">Repas pris d&apos;habitude</p>
                    <div className="grid grid-cols-2 gap-2">
                      {SERVICES.map((s) => {
                        const coche = edition.habituels.includes(s.cle);
                        return (
                          <button
                            key={s.cle}
                            onClick={() =>
                              setEdition({
                                ...edition,
                                habituels: coche ? edition.habituels.filter((h) => h !== s.cle) : [...edition.habituels, s.cle],
                              })
                            }
                            className={`rounded-full py-1.5 text-sm font-bold ${
                              coche ? "bg-c2b-gold text-c2b-green" : "bg-white border border-c2b-green/15 text-c2b-muted"
                            }`}
                          >
                            {s.libelle}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={enregistrerPreferences} className="btn-primary flex-1 py-2 text-sm">
                        Enregistrer
                      </button>
                      <button onClick={() => setEdition(null)} className="btn-secondary flex-1 py-2 text-sm">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
