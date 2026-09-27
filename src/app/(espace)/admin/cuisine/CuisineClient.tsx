"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy, Pencil, Printer, Send } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate, libelleDate } from "@/lib/dates";
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
}

const SERVICES: { cle: Service; libelle: string; court: string }[] = [
  { cle: "dejeuner", libelle: "Midi", court: "MIDI" },
  { cle: "diner", libelle: "Soir", court: "SOIR" },
];
const PALIERS: (Palier | null)[] = ["P1", "P2", "P3", "P4", "P5", "P6", null];

// « Rebecca Sturm » → « Rebecca S. » : court, et distingue deux prénoms identiques.
function nomCourt(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  const initiale = reste.at(-1)?.[0];
  return initiale ? `${prenom.charAt(0).toUpperCase()}${prenom.slice(1)} ${initiale.toUpperCase()}.` : prenom;
}

const dateLongue = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function CuisineClient({
  date,
  aujourdhui,
  clients: clientsInitiaux,
  commandesInitiales,
}: {
  date: string;
  aujourdhui: string;
  clients: ClientCuisine[];
  commandesInitiales: CommandeCuisine[];
}) {
  const supabase = createClient();
  const [clients, setClients] = useState(clientsInitiaux);
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [edition, setEdition] = useState<{ id: string; allergies: string; refus: string; habituels: Service[] } | null>(null);
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);

  const parClient = new Map(clients.map((c) => [c.id, c]));
  const commande = (clientId: string, service: Service) =>
    commandes.find((c) => c.client_id === clientId && c.repas_type === service);

  // Fiche : pour chaque service, les clients regroupés par palier.
  const fiche = SERVICES.map((s) => {
    const lignes = commandes
      .filter((c) => c.repas_type === s.cle && parClient.has(c.client_id))
      .map((c) => ({ commande: c, client: parClient.get(c.client_id)! }))
      .sort((a, b) => a.client.nom.localeCompare(b.client.nom, "fr"));
    const paliers = PALIERS.map((p) => ({ palier: p, lignes: lignes.filter((l) => l.client.palier === p) })).filter(
      (g) => g.lignes.length > 0
    );
    return { ...s, total: lignes.length, paliers };
  });
  const total = fiche.reduce((t, s) => t + s.total, 0);
  const allergiques = fiche.flatMap((s) => s.paliers.flatMap((g) => g.lignes)).filter((l) => l.client.cuisine_allergies);

  const habitudes = SERVICES.map((s) => ({ ...s, n: clients.filter((c) => c.repas_habituels.includes(s.cle)).length }));

  function texteFiche() {
    const lignes = [`*FICHE CUISINE — ${dateLongue(date)}*`, `Total : ${total} repas (${fiche.map((s) => `${s.total} ${s.libelle.toLowerCase()}`).join(" · ")})`];
    for (const s of fiche) {
      lignes.push("", `*${s.cle === "dejeuner" ? "☀️" : "🌙"} ${s.court} — ${s.total} repas*`);
      if (s.total === 0) lignes.push("Aucun repas");
      for (const g of s.paliers) {
        lignes.push(`*${g.palier ?? "Sans palier"} × ${g.lignes.length}*`);
        for (const { client, commande: c } of g.lignes) {
          const details = [
            client.cuisine_allergies && `⚠️ ALLERGIE : ${client.cuisine_allergies}`,
            client.cuisine_refus && `sans : ${client.cuisine_refus}`,
            c.note && `→ ${c.note}`,
          ].filter(Boolean);
          lignes.push(`• ${nomCourt(client.nom)}${details.length ? ` — ${details.join(" — ")}` : ""}`);
        }
      }
    }
    return lignes.join("\n");
  }

  async function preparer() {
    setEnCours(true);
    const lignes = clients.flatMap((c) =>
      c.repas_habituels.map((service) => ({ client_id: c.id, date_livraison: date, repas_type: service, statut: "confirmee" }))
    );
    const { data, error } = await supabase
      .from("application_commandes")
      .upsert(lignes, { onConflict: "client_id,date_livraison,repas_type" })
      .select("id, client_id, repas_type, note")
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
      .select("id, client_id, repas_type, note")
      .single<CommandeCuisine>();
    if (!error && data) setCommandes((prev) => [...prev, data]);
  }

  async function noter(c: CommandeCuisine, note: string) {
    const propre = note.trim().slice(0, 200) || null;
    if (propre === c.note) return;
    const { error } = await supabase.from("application_commandes").update({ note: propre }).eq("id", c.id);
    if (!error) setCommandes((prev) => prev.map((x) => (x.id === c.id ? { ...x, note: propre } : x)));
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
            <span className="min-w-[92px] text-center text-sm font-bold text-c2b-green first-letter:uppercase">
              {libelleDate(date, aujourdhui) === "Aujourd'hui" || libelleDate(date, aujourdhui) === "Hier"
                ? libelleDate(date, aujourdhui)
                : date === decalerDate(aujourdhui, 1)
                  ? "Demain"
                  : new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            </span>
            <Link
              href={`/admin/cuisine?date=${decalerDate(date, 1)}`}
              className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
              aria-label="Jour suivant"
            >
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>

        {commandes.length === 0 && (
          <section className="carte border-c2b-gold/50 p-5 space-y-3">
            <p className="font-bold text-c2b-green">La fiche du {dateLongue(date)} n&apos;est pas encore préparée.</p>
            <p className="text-sm text-c2b-muted">
              Elle reprend les repas habituels de chaque client ({habitudes.map((h) => `${h.n} ${h.libelle.toLowerCase()}`).join(", ")}).
              Vous ajustez ensuite les absents et les consignes du jour ci-dessous.
            </p>
            <button onClick={preparer} disabled={enCours} className="btn-primary w-full">
              {enCours ? "Préparation..." : "Préparer la fiche"}
            </button>
          </section>
        )}
      </div>

      {/* La fiche elle-même : seule partie imprimée. */}
      <section className="carte p-5 print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-c2b-green pb-2">
          <h2 className="font-serif text-2xl text-c2b-green first-letter:uppercase">Fiche cuisine · {dateLongue(date)}</h2>
          <span className="text-sm font-bold text-c2b-green whitespace-nowrap">{total} repas</span>
        </div>
        {allergiques.length > 0 && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700 print:border print:border-red-700">
            ⚠️ {allergiques.length} repas avec allergie : bien vérifier avant de fermer les boîtes.
          </p>
        )}
        <div className="mt-3 grid gap-5 md:grid-cols-2 print:grid-cols-2">
          {fiche.map((s) => (
            <div key={s.cle}>
              <h3 className="flex items-baseline justify-between rounded-lg bg-c2b-green px-3 py-2 text-c2b-cream print:bg-white print:text-c2b-green print:border-2 print:border-c2b-green">
                <span className="font-bold">
                  {s.cle === "dejeuner" ? "☀️" : "🌙"} {s.court}
                </span>
                <span className="text-lg font-bold">{s.total} repas</span>
              </h3>
              {s.total === 0 ? (
                <p className="px-1 py-3 text-sm text-c2b-muted">Aucun repas</p>
              ) : (
                s.paliers.map((g) => (
                  <div key={g.palier ?? "aucun"} className="mt-3">
                    <p className="flex items-baseline justify-between border-b border-c2b-green/20 pb-1 text-sm font-bold text-c2b-green">
                      <span>{g.palier ?? "Sans palier"}</span>
                      <span>× {g.lignes.length}</span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      {g.lignes.map(({ client, commande: c }) => (
                        <li key={c.id} className="text-sm leading-snug">
                          <span className="font-bold text-c2b-green">{nomCourt(client.nom)}</span>
                          {client.cuisine_allergies && (
                            <span className="ml-1.5 font-bold text-red-700">⚠️ {client.cuisine_allergies}</span>
                          )}
                          {client.cuisine_refus && <span className="text-c2b-text"> · sans {client.cuisine_refus}</span>}
                          {c.note && <span className="italic text-c2b-text"> · {c.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="print:hidden space-y-6">
        {total > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(texteFiche())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-3 text-sm font-bold text-white"
            >
              <Send size={16} /> WhatsApp
            </a>
            <button onClick={copier} className="btn-secondary px-3 text-sm">
              <Copy size={16} /> Copier
            </button>
            <button onClick={() => window.print()} className="btn-secondary px-3 text-sm">
              <Printer size={16} /> Imprimer
            </button>
          </div>
        )}
        {message && <p className="text-sm font-semibold text-c2b-green">{message}</p>}

        <section className="space-y-2">
          <h2 className="font-serif text-2xl text-c2b-green">Qui mange ce jour-là ?</h2>
          <p className="text-sm text-c2b-muted">
            Touchez Midi ou Soir pour ajouter ou retirer un repas. La consigne du jour (« sauce à part ») s&apos;ajoute sous le
            client.
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
                        {s.cle === "dejeuner" ? "☀️" : "🌙"} {s.libelle}
                      </button>
                    );
                  })}
                </div>
                {SERVICES.map((s) => {
                  const cmd = commande(c.id, s.cle);
                  return (
                    cmd && (
                      <input
                        key={`${cmd.id}-${cmd.note ?? ""}`}
                        defaultValue={cmd.note ?? ""}
                        onBlur={(e) => noter(cmd, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        placeholder={`Consigne du jour, ${s.libelle.toLowerCase()} (facultatif)`}
                        maxLength={200}
                        className="champ mt-2 py-2 text-sm"
                      />
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
