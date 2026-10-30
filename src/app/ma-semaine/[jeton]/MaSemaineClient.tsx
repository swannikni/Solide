"use client";

import { useState } from "react";
import { Check, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ZONES, prixDemande, zoneDuQuartier, type RepasChoisi, type Service } from "@/lib/ma-semaine";
import type { Tarifs } from "@/lib/paiements";

export interface SemaineProposee {
  lundi: string;
  jours: { date: string; modifiable: boolean; midi: string | null; soir: string | null }[];
  choisis: RepasChoisi[];
  enAttente: boolean; // une demande attend déjà la validation
  dejaPrevus: RepasChoisi[]; // repas déjà au planning de la cuisine
}

const SERVICES: { cle: Service; libelle: string; icone: string; allume: string }[] = [
  { cle: "dejeuner", libelle: "Midi", icone: "☀️", allume: "bg-amber-400 text-amber-950 border-amber-400" },
  { cle: "diner", libelle: "Soir", icone: "🌙", allume: "bg-indigo-500 text-white border-indigo-500" },
];
const jourLong = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const jourCourt = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export function MaSemaineClient({
  jeton,
  prenom,
  fiche,
  semaines,
  tarifs,
}: {
  jeton: string | null; // null : lien commun (prénom + téléphone demandés)
  prenom: string;
  fiche: { allergies: string; refus: string; note: string; quartier: string; adresse: string };
  semaines: SemaineProposee[];
  tarifs: Tarifs;
}) {
  // Par défaut : la première semaine où l'on n'a encore rien choisi, sinon la première.
  const [lundi, setLundi] = useState(semaines.find((s) => s.choisis.length === 0)?.lundi ?? semaines[0]?.lundi ?? "");
  const [choix, setChoix] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(semaines.map((s) => [s.lundi, s.choisis.map((r) => `${r.date}|${r.service}`)]))
  );
  const [form, setForm] = useState(fiche);
  // Lien commun : qui est-ce ? (retrouvé par le téléphone côté serveur)
  const [identite, setIdentite] = useState({ nom: "", telephone: "" });
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [etatPosition, setEtatPosition] = useState("");
  const [envoi, setEnvoi] = useState<"" | "en_cours" | "envoye">("");
  const [erreur, setErreur] = useState("");

  const semaine = semaines.find((s) => s.lundi === lundi);
  if (!semaine) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
        <Logo />
        <p className="text-sm text-c2b-muted">Aucune semaine ouverte pour le moment. Écrivez-nous sur WhatsApp.</p>
      </main>
    );
  }
  const coches = choix[lundi] ?? [];
  const repas: RepasChoisi[] = coches.map((c) => ({ date: c.slice(0, 10), service: c.slice(11) as Service }));
  const zone = form.quartier ? zoneDuQuartier(form.quartier) : null;
  const prix = prixDemande(repas, zone, tarifs);
  const modifiables = semaine.jours.filter((j) => j.modifiable);

  function basculer(date: string, service: Service) {
    const k = `${date}|${service}`;
    setChoix((c) => ({ ...c, [lundi]: coches.includes(k) ? coches.filter((x) => x !== k) : [...coches, k] }));
    setErreur("");
  }
  function raccourci(services: Service[]) {
    // Garde les repas déjà passés (non modifiables), remplace le reste.
    const figes = coches.filter((c) => !semaine!.jours.find((j) => j.date === c.slice(0, 10))?.modifiable);
    setChoix((c) => ({ ...c, [lundi]: [...figes, ...modifiables.flatMap((j) => services.map((s) => `${j.date}|${s}`))] }));
  }

  function partagerPosition() {
    if (!navigator.geolocation) return setEtatPosition("Position indisponible sur ce téléphone.");
    setEtatPosition("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setEtatPosition("Position enregistrée ✓");
      },
      () => setEtatPosition("Position refusée : indiquez votre adresse ci-dessous."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function envoyer() {
    if (!jeton && identite.nom.trim().length < 2) return setErreur("Indiquez votre prénom.");
    if (!jeton && identite.telephone.replace(/\D/g, "").length < 9) return setErreur("Indiquez votre numéro WhatsApp.");
    if (repas.length === 0) return setErreur("Choisissez au moins un repas.");
    if (!form.quartier) return setErreur("Choisissez votre quartier de livraison.");
    setEnvoi("en_cours");
    setErreur("");
    try {
      const r = await fetch("/api/ma-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jeton, semaine: lundi, repas, ...form, ...(position ?? {}), ...(jeton ? {} : identite) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEnvoi("");
        return setErreur(d.erreur ?? "Envoi impossible, réessayez.");
      }
      setEnvoi("envoye");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setEnvoi("");
      setErreur("Pas de connexion, réessayez.");
    }
  }

  if (envoi === "envoye") {
    return (
      <main className="mx-auto max-w-md px-5 py-10 space-y-5 text-center">
        <Logo className="mx-auto h-14 w-auto" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-c2b-green text-c2b-cream">
          <Check size={32} />
        </div>
        <h1 className="titre text-3xl">
          C&apos;est envoyé{prenom || identite.nom ? <>, <em>{prenom || identite.nom.trim().split(/\s+/)[0]}</em></> : null} !
        </h1>
        <p className="text-sm text-c2b-muted">
          Chef2Box confirme votre semaine du {jourCourt(lundi)} très vite sur WhatsApp. Vous pouvez la modifier jusqu&apos;à la veille de chaque
          repas, 20 h.
        </p>
        <div className="carte p-4 text-left text-sm space-y-1">
          {repas
            .sort((a, b) => (a.date + a.service).localeCompare(b.date + b.service))
            .map((r) => (
              <p key={`${r.date}|${r.service}`} className="first-letter:uppercase">
                {jourLong(r.date)} · {r.service === "dejeuner" ? "☀️ midi" : "🌙 soir"}
              </p>
            ))}
          <p className="pt-2 font-bold text-c2b-green">
            Total : {prix.total != null ? `${prix.total} DH` : `${prix.prixRepas} DH + livraison sur devis`}
          </p>
        </div>
        <button onClick={() => setEnvoi("")} className="btn-secondary w-full">
          Modifier ma semaine
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6 space-y-5">
      <header className="space-y-3">
        <Logo className="h-12 w-auto" />
        <h1 className="titre text-[32px] leading-tight">
          {prenom ? (
            <>
              Bonjour <em>{prenom}</em> 👋
            </>
          ) : (
            <>
              Ma semaine <em>Chef2Box</em>
            </>
          )}
        </h1>
        <p className="text-sm text-c2b-muted">Choisissez vos repas de la semaine : midi, soir, ou les deux. Modifiable jusqu&apos;à la veille 20 h.</p>
      </header>

      {!jeton && (
        <section className="carte p-4 space-y-3">
          <h2 className="font-bold text-c2b-green">Vous</h2>
          <label className="block text-xs font-bold text-c2b-muted">
            Prénom et nom
            <input
              value={identite.nom}
              onChange={(e) => setIdentite({ ...identite, nom: e.target.value })}
              placeholder="Ex : Sara El Amrani"
              maxLength={60}
              autoComplete="name"
              className="champ mt-1 py-2.5 text-sm font-normal"
            />
          </label>
          <label className="block text-xs font-bold text-c2b-muted">
            Numéro WhatsApp
            <input
              value={identite.telephone}
              onChange={(e) => setIdentite({ ...identite, telephone: e.target.value })}
              placeholder="Ex : 06 12 34 56 78"
              inputMode="tel"
              maxLength={30}
              autoComplete="tel"
              className="champ mt-1 py-2.5 text-sm font-normal"
            />
          </label>
        </section>
      )}

      {semaines.length > 1 && (
        <div className="flex gap-1.5">
          {semaines.map((s) => (
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
      {semaine.enAttente && (
        <p className="rounded-xl bg-c2b-gold/15 px-3 py-2 text-sm font-semibold text-c2b-green">
          ⏳ Votre demande pour cette semaine attend la confirmation de Chef2Box. Vous pouvez encore la modifier.
        </p>
      )}

      {/* Raccourcis */}
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
            onClick={() => raccourci([...services])}
            disabled={modifiables.length === 0}
            className="rounded-full bg-white border border-c2b-green/15 px-3 py-1.5 text-xs font-bold text-c2b-green disabled:opacity-30"
          >
            {libelle}
          </button>
        ))}
      </div>

      {/* Les jours, avec le menu */}
      <ul className="space-y-2">
        {semaine.jours.map((j) => (
          <li key={j.date} className={`carte p-3 ${j.modifiable ? "" : "opacity-50"}`}>
            <p className="flex items-baseline justify-between text-sm font-bold text-c2b-green first-letter:uppercase">
              {jourLong(j.date)}
              {!j.modifiable && <span className="text-[11px] font-semibold text-c2b-muted">Fermé (veille 20 h)</span>}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SERVICES.map((s) => {
                const actif = coches.includes(`${j.date}|${s.cle}`);
                const plat = s.cle === "dejeuner" ? j.midi : j.soir;
                return (
                  <button
                    key={s.cle}
                    onClick={() => basculer(j.date, s.cle)}
                    disabled={!j.modifiable}
                    aria-pressed={actif}
                    className={`rounded-xl border-2 px-2.5 py-2 text-left transition ${actif ? s.allume : "bg-white border-c2b-green/10 text-c2b-green"}`}
                  >
                    <span className="flex items-center justify-between text-sm font-bold">
                      {s.icone} {s.libelle}
                      {actif && <Check size={16} />}
                    </span>
                    <span className={`mt-0.5 block text-[11px] leading-snug ${actif ? "opacity-90" : "text-c2b-muted"}`}>
                      {plat ?? "Menu bientôt en ligne"}
                    </span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {/* Préférences */}
      <section className="carte p-4 space-y-3">
        <h2 className="font-bold text-c2b-green">Vos préférences</h2>
        {(
          [
            ["allergies", "⚠️ Allergies", "Ex : arachides, lactose (ou rien)"],
            ["refus", "Ne mange pas", "Ex : oignon, parmesan"],
            ["note", "Message pour la cuisine", "Facultatif"],
          ] as const
        ).map(([cle, libelle, aide]) => (
          <label key={cle} className="block text-xs font-bold text-c2b-muted">
            {libelle}
            <input
              value={form[cle]}
              onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
              placeholder={aide}
              maxLength={cle === "note" ? 200 : 300}
              className="champ mt-1 py-2.5 text-sm font-normal"
            />
          </label>
        ))}
      </section>

      {/* Livraison */}
      <section className="carte p-4 space-y-3">
        <h2 className="font-bold text-c2b-green">Livraison</h2>
        <label className="block text-xs font-bold text-c2b-muted">
          Quartier
          <select
            value={form.quartier}
            onChange={(e) => {
              setForm({ ...form, quartier: e.target.value });
              setErreur("");
            }}
            className="champ mt-1 py-2.5 text-sm font-normal"
          >
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

      {/* Prix */}
      <section className="carte p-4 space-y-1.5 text-sm">
        <h2 className="font-bold text-c2b-green">Votre semaine</h2>
        <p className="flex justify-between">
          <span>
            {prix.jours} jour{prix.jours > 1 ? "s" : ""} · formule {prix.formule === 2 ? "midi + soir" : "1 repas / jour"}
          </span>
          <span className="font-semibold">{prix.prixRepas} DH</span>
        </p>
        <p className="flex justify-between">
          <span>Livraison {zone && zone !== "retrait" && zone !== "devis" ? `(${prix.jours} × ${ZONES.find((z) => z.cle === zone)?.prix} DH)` : ""}</span>
          <span className="font-semibold">
            {!zone ? "—" : prix.prixLivraison == null ? "sur devis" : prix.prixLivraison === 0 ? "gratuit" : `${prix.prixLivraison} DH`}
          </span>
        </p>
        <p className="flex justify-between border-t border-c2b-green/10 pt-2 text-base font-bold text-c2b-green">
          <span>Total</span>
          <span>{prix.total != null && zone ? `${prix.total} DH` : "—"}</span>
        </p>
      </section>

      {erreur && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{erreur}</p>}
      <button onClick={envoyer} disabled={envoi === "en_cours"} className="btn-primary w-full py-3.5 text-base">
        {envoi === "en_cours" ? "Envoi…" : semaine.enAttente ? "Mettre à jour ma semaine" : "Envoyer ma semaine"}
      </button>
      <p className="text-center text-[11px] text-c2b-muted">Chef2Box confirme votre semaine sur WhatsApp avant la livraison.</p>
    </main>
  );
}
