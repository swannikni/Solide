"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ZONES, encoreModifiable, lundiDe, prixDemande, zoneDuQuartier, type Conditions, type RepasChoisi, type Service } from "@/lib/ma-semaine";
import type { Tarifs } from "@/lib/paiements";

export interface SemaineOuverte {
  lundi: string;
  jours: { date: string; modifiable: boolean; midi: string | null; soir: string | null }[];
  prevus: RepasChoisi[]; // déjà au planning de la cuisine
  enAttente: RepasChoisi[] | null; // première commande en attente de validation
}

export interface SemaineCompte {
  lundi: string;
  repas: RepasChoisi[];
  montant: number | null; // montant enregistré par Chef2Box (sinon estimé)
  recu: number;
}

type Onglet = "commander" | "avenir" | "payer" | "fiche" | "historique";
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "commander", libelle: "🛒 Commander" },
  { cle: "avenir", libelle: "📅 À venir" },
  { cle: "payer", libelle: "💳 À payer" },
  { cle: "fiche", libelle: "👤 Ma fiche" },
  { cle: "historique", libelle: "🕘 Historique" },
];
const SERVICES: { cle: Service; libelle: string; icone: string; allume: string }[] = [
  { cle: "dejeuner", libelle: "Midi", icone: "☀️", allume: "bg-amber-400 text-amber-950 border-amber-400" },
  { cle: "diner", libelle: "Soir", icone: "🌙", allume: "bg-indigo-500 text-white border-indigo-500" },
];
const jourLong = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const jourCourt = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const cle = (r: RepasChoisi) => `${r.date}|${r.service}`;
const versRepas = (k: string): RepasChoisi => ({ date: k.slice(0, 10), service: k.slice(11) as Service });

export function MonEspaceClient({
  jeton,
  prenom,
  aujourdhui,
  connu,
  fiche,
  semainesOuvertes,
  semainesCompte,
  tarifs,
  conditions = {},
}: {
  jeton: string;
  prenom: string;
  aujourdhui: string;
  connu: boolean;
  fiche: { allergies: string; refus: string; note: string; quartier: string; adresse: string; position: boolean };
  semainesOuvertes: SemaineOuverte[];
  semainesCompte: SemaineCompte[];
  tarifs: Tarifs;
  conditions?: Conditions; // remise, livraison offerte (fiche du client)
}) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<Onglet>("commander");
  const [lundi, setLundi] = useState(semainesOuvertes[0]?.lundi ?? "");
  // Sélection par semaine : ce qui est prévu (ou en attente), modifiable.
  const [choix, setChoix] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(semainesOuvertes.map((s) => [s.lundi, (s.enAttente ?? s.prevus).map(cle)]))
  );
  const [form, setForm] = useState({ allergies: fiche.allergies, refus: fiche.refus, note: fiche.note, quartier: fiche.quartier, adresse: fiche.adresse });
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [etatPosition, setEtatPosition] = useState(fiche.position ? "Position déjà enregistrée ✓" : "");
  const [enCours, setEnCours] = useState("");
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);

  const zone = form.quartier ? zoneDuQuartier(form.quartier) : null;
  const semaine = semainesOuvertes.find((s) => s.lundi === lundi);
  const coches = choix[lundi] ?? [];
  const repasSemaine = coches.map(versRepas);
  const prix = prixDemande(repasSemaine, zone, tarifs, conditions);
  const lundiActuel = lundiDe(aujourdhui);

  async function appeler(corps: object, cleEnCours: string) {
    setEnCours(cleEnCours);
    setMessage(null);
    try {
      const r = await fetch("/api/ma-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, ...corps }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage({ texte: d.erreur ?? "Action impossible, réessayez.", ok: false });
        return null;
      }
      return d as { ok: true; aValider?: boolean };
    } catch {
      setMessage({ texte: "Pas de connexion, réessayez.", ok: false });
      return null;
    } finally {
      setEnCours("");
    }
  }

  function partagerPosition() {
    if (!navigator.geolocation) return setEtatPosition("Position indisponible sur ce téléphone.");
    setEtatPosition("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setEtatPosition("Position enregistrée ✓");
      },
      () => setEtatPosition("Position refusée : indiquez votre adresse."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function commander() {
    if (!semaine) return;
    if (coches.length === 0 && semaine.prevus.length === 0) return setMessage({ texte: "Choisissez au moins un repas.", ok: false });
    if (!zone) return setMessage({ texte: "Choisissez votre quartier de livraison.", ok: false });
    const modifiables = new Set(semaine.jours.filter((j) => j.modifiable).map((j) => j.date));
    const d = await appeler(
      { action: "commander", semaine: lundi, repas: repasSemaine.filter((r) => modifiables.has(r.date)), quartier: form.quartier, adresse: form.adresse, ...(position ?? {}) },
      "commander"
    );
    if (!d) return;
    setMessage({
      texte: d.aValider
        ? "Commande envoyée ✓ Chef2Box confirme votre première commande sur WhatsApp."
        : "Commande enregistrée ✓ C'est en cuisine. Modifiable jusqu'à la veille 20 h.",
      ok: true,
    });
    router.refresh();
  }

  async function annuler(r: RepasChoisi) {
    if (!window.confirm(`Annuler le repas du ${jourLong(r.date)} (${r.service === "dejeuner" ? "midi" : "soir"}) ?`)) return;
    const d = await appeler({ action: "annuler", date: r.date, service: r.service }, cle(r));
    if (!d) return;
    setChoix((c) => {
      const l = lundiDe(r.date);
      return { ...c, [l]: (c[l] ?? []).filter((k) => k !== cle(r)) };
    });
    setMessage({ texte: "Repas annulé ✓", ok: true });
    router.refresh();
  }

  async function enregistrerFiche() {
    const d = await appeler({ action: "fiche", ...form, ...(position ?? {}) }, "fiche");
    if (d) setMessage({ texte: "Fiche enregistrée ✓", ok: true });
  }

  // ---- Données dérivées ----
  const tousPrevus = semainesCompte.flatMap((s) => s.repas);
  const enAttente = semainesOuvertes.flatMap((s) => s.enAttente ?? []);
  const aVenir = [...tousPrevus.filter((r) => r.date >= aujourdhui), ...enAttente.filter((r) => !tousPrevus.some((p) => cle(p) === cle(r)))].sort((a, b) =>
    cle(a).localeCompare(cle(b))
  );
  const platDe = (r: RepasChoisi) => {
    const j = semainesOuvertes.flatMap((s) => s.jours).find((x) => x.date === r.date);
    return r.service === "dejeuner" ? j?.midi : j?.soir;
  };
  const montantDe = (s: SemaineCompte) => s.montant ?? prixDemande(s.repas, zone, tarifs, conditions).total ?? prixDemande(s.repas, zone, tarifs, conditions).prixRepas;
  const aPayer = semainesCompte.filter((s) => s.repas.length > 0 && montantDe(s) - s.recu > 0);
  const totalDu = aPayer.reduce((t, s) => t + (montantDe(s) - s.recu), 0);
  const historique = semainesCompte.filter((s) => s.lundi < lundiActuel);

  const champ = (nom: "allergies" | "refus" | "note", libelle: string, aide: string) => (
    <label className="block text-xs font-bold text-c2b-muted">
      {libelle}
      <input
        value={form[nom]}
        onChange={(e) => setForm({ ...form, [nom]: e.target.value })}
        placeholder={aide}
        maxLength={nom === "note" ? 200 : 300}
        className="champ mt-1 py-2.5 text-sm font-normal"
      />
    </label>
  );
  const livraison = (
    <section className="carte p-4 space-y-3">
      <h2 className="font-bold text-c2b-green">Livraison</h2>
      <label className="block text-xs font-bold text-c2b-muted">
        Quartier
        <select value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })} className="champ mt-1 py-2.5 text-sm font-normal">
          <option value="">Choisir votre quartier…</option>
          {ZONES.map((z) => (
            <optgroup key={z.cle} label={z.libelle}>
              {z.quartiers.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {zone !== "retrait" && (
        <>
          <label className="block text-xs font-bold text-c2b-muted">
            Adresse (repère pour le livreur)
            <input
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              placeholder="Ex : résidence, étage, bureau…"
              maxLength={200}
              className="champ mt-1 py-2.5 text-sm font-normal"
            />
          </label>
          <button onClick={partagerPosition} type="button" className="btn-secondary w-full py-2.5 text-sm">
            <MapPin size={16} /> Partager ma position
          </button>
          {etatPosition && <p className="text-xs font-semibold text-c2b-green">{etatPosition}</p>}
        </>
      )}
    </section>
  );

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6 space-y-5">
      <header className="space-y-2">
        <Logo className="h-12 w-auto" />
        <h1 className="titre text-[30px] leading-tight">
          Bonjour <em>{prenom}</em> 👋
        </h1>
        <p className="text-sm text-c2b-muted">Votre espace Chef2Box : commandez, modifiez jusqu&apos;à la veille 20 h, suivez vos paiements.</p>
      </header>

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => {
              setOnglet(o.cle);
              setMessage(null);
            }}
            className={`flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-bold ${
              onglet === o.cle ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
            }`}
          >
            {o.libelle}
            {o.cle === "avenir" && aVenir.length > 0 && ` (${aVenir.length})`}
          </button>
        ))}
      </nav>

      {message && (
        <p className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.texte}</p>
      )}

      {/* ---- Commander ---- */}
      {onglet === "commander" &&
        (!semaine ? (
          <p className="carte p-5 text-center text-sm text-c2b-muted">Aucune semaine ouverte pour le moment.</p>
        ) : (
          <>
            {semainesOuvertes.length > 1 && (
              <div className="flex gap-1.5">
                {semainesOuvertes.map((s) => (
                  <button
                    key={s.lundi}
                    onClick={() => setLundi(s.lundi)}
                    className={`flex-1 rounded-full px-2 py-2 text-xs font-bold ${
                      s.lundi === lundi ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    Sem. du {jourCourt(s.lundi)}
                  </button>
                ))}
              </div>
            )}
            <section className="rounded-2xl bg-c2b-green p-4 text-sm text-c2b-cream">
              <p className="font-bold">Comment commander ?</p>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[13px] text-c2b-cream/90">
                <li>Choisissez la semaine.</li>
                <li>Touchez ☀️ Midi et/ou 🌙 Soir pour chaque jour où vous voulez un repas.</li>
                <li>Vérifiez votre quartier de livraison : le prix s&apos;affiche en bas.</li>
                <li>Touchez « Valider ma commande ». Modifiable jusqu&apos;à la veille 20 h.</li>
              </ol>
            </section>
            {semaine.enAttente && (
              <p className="rounded-xl bg-c2b-gold/15 px-3 py-2 text-sm font-semibold text-c2b-green">
                ⏳ Votre commande attend la confirmation de Chef2Box. Vous pouvez encore la modifier.
              </p>
            )}
            {!connu && !semaine.enAttente && (
              <p className="rounded-xl bg-c2b-gold/15 px-3 py-2 text-xs font-semibold text-c2b-green">
                Première commande : Chef2Box la confirme sur WhatsApp. Ensuite, vos commandes passent directement en cuisine.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["☀️ Midi tous les jours", ["dejeuner"]],
                  ["🌙 Soir tous les jours", ["diner"]],
                  ["☀️🌙 Midi + soir", ["dejeuner", "diner"]],
                ] as const
              ).map(([libelle, services]) => (
                <button
                  key={libelle}
                  onClick={() => {
                    const figes = coches.filter((c) => !semaine.jours.find((j) => j.date === c.slice(0, 10))?.modifiable);
                    const ouverts = semaine.jours.filter((j) => j.modifiable).flatMap((j) => services.map((s) => `${j.date}|${s}`));
                    setChoix((c) => ({ ...c, [lundi]: [...figes, ...ouverts] }));
                  }}
                  className="rounded-full bg-white border border-c2b-green/15 px-3 py-1.5 text-xs font-bold text-c2b-green"
                >
                  {libelle}
                </button>
              ))}
            </div>
            <ul className="space-y-2">
              {semaine.jours.map((j) => (
                <li key={j.date} className={`carte p-3 ${j.modifiable ? "" : "opacity-60"}`}>
                  <p className="flex items-baseline justify-between text-sm font-bold text-c2b-green first-letter:uppercase">
                    {jourLong(j.date)}
                    {!j.modifiable && <span className="text-[11px] font-semibold text-c2b-muted">Fermé (veille 20 h)</span>}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {SERVICES.map((s) => {
                      const k = `${j.date}|${s.cle}`;
                      const actif = coches.includes(k);
                      const plat = s.cle === "dejeuner" ? j.midi : j.soir;
                      return (
                        <button
                          key={s.cle}
                          disabled={!j.modifiable}
                          aria-pressed={actif}
                          onClick={() => setChoix((c) => ({ ...c, [lundi]: actif ? coches.filter((x) => x !== k) : [...coches, k] }))}
                          className={`rounded-xl border-2 px-2.5 py-2 text-left transition ${actif ? s.allume : "bg-white border-c2b-green/10 text-c2b-green"}`}
                        >
                          <span className="flex items-center justify-between text-sm font-bold">
                            {s.icone} {s.libelle}
                            {actif && <Check size={16} />}
                          </span>
                          <span className={`mt-0.5 block text-[11px] leading-snug ${actif ? "opacity-90" : "text-c2b-muted"}`}>{plat ?? "Menu bientôt en ligne"}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
            {livraison}
            <section className="carte p-4 space-y-1.5 text-sm">
              <h2 className="font-bold text-c2b-green">Votre semaine du {jourCourt(lundi)}</h2>
              {prix.jours1 > 0 && (
                <p className="flex justify-between">
                  <span>
                    {prix.jours1} jour{prix.jours1 > 1 ? "s" : ""} × 1 repas
                  </span>
                  <span>{Math.round((prix.jours1 * tarifs.un_repas) / 5)} DH</span>
                </p>
              )}
              {prix.jours2 > 0 && (
                <p className="flex justify-between">
                  <span>
                    {prix.jours2} jour{prix.jours2 > 1 ? "s" : ""} × midi + soir
                  </span>
                  <span>{Math.round((prix.jours2 * tarifs.deux_repas) / 5)} DH</span>
                </p>
              )}
              {prix.remise > 0 && prix.brut > 0 && (
                <p className="flex justify-between font-semibold text-emerald-700">
                  <span>🎁 Remise {prix.remise} %</span>
                  <span>−{prix.brut - prix.prixRepas} DH</span>
                </p>
              )}
              <p className="flex justify-between">
                <span>Livraison{conditions.livraisonOfferte ? " 🎁" : ""}{zone && prix.jours > 0 && ZONES.find((z) => z.cle === zone)?.prix ? ` (${prix.jours} × ${ZONES.find((z) => z.cle === zone)?.prix} DH)` : ""}</span>
                <span>{!zone ? "—" : prix.prixLivraison == null ? "sur devis" : prix.prixLivraison === 0 ? "gratuit" : `${prix.prixLivraison} DH`}</span>
              </p>
              <p className="flex justify-between border-t border-c2b-green/10 pt-2 text-base font-bold text-c2b-green">
                <span>Total</span>
                <span>{zone && prix.total != null ? `${prix.total} DH` : prix.prixRepas ? `${prix.prixRepas} DH + livraison` : "—"}</span>
              </p>
            </section>
            <button onClick={commander} disabled={enCours === "commander"} className="btn-primary w-full py-3.5 text-base">
              {enCours === "commander" ? "Envoi…" : semaine.prevus.length ? "Mettre à jour ma commande" : "Valider ma commande"}
            </button>
          </>
        ))}

      {/* ---- À venir ---- */}
      {onglet === "avenir" &&
        (aVenir.length === 0 ? (
          <p className="carte p-5 text-center text-sm text-c2b-muted">Aucun repas prévu. Commandez dans l&apos;onglet 🛒 Commander.</p>
        ) : (
          <ul className="space-y-2">
            {aVenir.map((r) => {
              const attente = !tousPrevus.some((p) => cle(p) === cle(r));
              return (
                <li key={cle(r)} className="carte flex items-center gap-3 p-3">
                  <span className={`h-10 w-1.5 flex-shrink-0 rounded-full ${r.service === "dejeuner" ? "bg-amber-400" : "bg-indigo-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-c2b-green first-letter:uppercase">
                      {jourLong(r.date)} · {r.service === "dejeuner" ? "☀️ midi" : "🌙 soir"}
                    </span>
                    <span className="block truncate text-xs text-c2b-muted">
                      {attente ? "⏳ en attente de confirmation" : platDe(r) ?? "Plat du jour"}
                    </span>
                  </span>
                  {encoreModifiable(r.date) && (
                    <button
                      onClick={() => annuler(r)}
                      disabled={enCours === cle(r)}
                      className="flex-shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700"
                    >
                      {enCours === cle(r) ? "…" : "Annuler"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}

      {/* ---- À payer ---- */}
      {onglet === "payer" && (
        <>
          <section className="carte p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-c2b-muted">Reste à payer</p>
            <p className="mt-1 font-serif text-4xl text-c2b-green">{totalDu} DH</p>
            <p className="mt-1 text-xs text-c2b-muted">À régler à la livraison ou par virement.</p>
          </section>
          <ul className="space-y-2">
            {aPayer.map((s) => (
              <li key={s.lundi} className="carte flex items-baseline justify-between p-3 text-sm">
                <span>
                  <strong className="text-c2b-green">Sem. du {jourCourt(s.lundi)}</strong>
                  <span className="block text-xs text-c2b-muted">
                    {s.repas.length} repas{s.montant == null ? " · estimation" : ""}
                    {s.recu > 0 ? ` · déjà réglé ${s.recu} DH` : ""}
                  </span>
                </span>
                <strong className="text-red-700">{montantDe(s) - s.recu} DH</strong>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---- Ma fiche ---- */}
      {onglet === "fiche" && (
        <>
          <section className="carte p-4 space-y-3">
            <h2 className="font-bold text-c2b-green">Mes préférences</h2>
            {champ("allergies", "⚠️ Allergies", "Ex : arachides, lactose (ou rien)")}
            {champ("refus", "Ne mange pas", "Ex : oignon, parmesan")}
            {champ("note", "Message pour la cuisine", "Facultatif")}
          </section>
          {livraison}
          <button onClick={enregistrerFiche} disabled={enCours === "fiche"} className="btn-primary w-full py-3">
            {enCours === "fiche" ? "Enregistrement…" : "Enregistrer ma fiche"}
          </button>
        </>
      )}

      {/* ---- Historique ---- */}
      {onglet === "historique" &&
        (historique.length === 0 ? (
          <p className="carte p-5 text-center text-sm text-c2b-muted">Pas encore d&apos;historique.</p>
        ) : (
          <ul className="space-y-2">
            {historique.map((s) => {
              const du = montantDe(s);
              const reste = Math.max(0, du - s.recu);
              return (
                <li key={s.lundi} className="carte flex items-baseline justify-between p-3 text-sm">
                  <span>
                    <strong className="text-c2b-green">Sem. du {jourCourt(s.lundi)}</strong>
                    <span className="block text-xs text-c2b-muted">
                      {s.repas.length} repas · {du} DH
                    </span>
                  </span>
                  {reste === 0 ? <strong className="text-emerald-700">Payé ✓</strong> : <strong className="text-red-700">Reste {reste} DH</strong>}
                </li>
              );
            })}
          </ul>
        ))}

      <p className="pt-2 text-center text-[11px] text-c2b-muted">
        Une question ?{" "}
        <a href="https://wa.me/212660831640" className="font-semibold text-c2b-gold">
          Écrivez-nous sur WhatsApp
        </a>
      </p>
    </main>
  );
}
