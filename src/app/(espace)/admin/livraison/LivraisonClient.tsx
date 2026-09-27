"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Crosshair, MapPin, Navigation, RotateCcw, Search, Send, Settings } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import type { ReglagesLivraison } from "@/lib/livraison";
import { createClient } from "@/lib/supabase/client";
import { decalerDate, libelleDate } from "@/lib/dates";
import {
  duree,
  heure,
  lienPoint,
  liensGoogleMaps,
  lireCoordonnees,
  mesurer,
  planifier,
  type Arret,
  type Point,
} from "@/lib/tournees";

type Service = "dejeuner" | "diner";

export interface ArretLivraison {
  cle: string; // « c:<client> » ou « a:<ajout> »
  source: "client" | "ajout";
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null; // consigne du jour
}

type ArretPlace = Arret & ArretLivraison & { lat: number; lng: number };

const COULEURS = ["#c9973a", "#3e6e96", "#b5603f"];

function nomCourt(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  const initiale = reste.at(-1)?.[0];
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1);
  return initiale ? `${p} ${initiale.toUpperCase()}.` : p;
}

const dateLongue = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Numéro marocain → format international pour wa.me (0612… → 212612…).
function numeroWhatsApp(telephone: string) {
  let n = telephone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.length === 10 && n.startsWith("0")) n = `212${n.slice(1)}`;
  return n.length >= 8 ? n : "";
}

// Saisie d'une position : lien Google Maps / position WhatsApp collé,
// « Ma position » (sur place), ou recherche de l'adresse sur la carte.
function EditeurPosition({
  adresseInitiale,
  pointInitial,
  telephoneInitial,
  avecTelephone,
  onEnregistrer,
  onAnnuler,
}: {
  adresseInitiale: string;
  pointInitial: Point | null;
  telephoneInitial?: string;
  avecTelephone?: boolean;
  onEnregistrer: (adresse: string, point: Point | null, telephone: string) => Promise<void>;
  onAnnuler: () => void;
}) {
  const [adresse, setAdresse] = useState(adresseInitiale);
  const [lien, setLien] = useState("");
  const [point, setPoint] = useState<Point | null>(pointInitial);
  const [telephone, setTelephone] = useState(telephoneInitial ?? "");
  const [info, setInfo] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function lireLien(texte: string) {
    setLien(texte);
    if (!texte.trim()) return;
    const direct = lireCoordonnees(texte);
    if (direct) {
      setPoint(direct);
      return setInfo("Position trouvée ✓");
    }
    if (!/^https?:\/\//.test(texte.trim())) return;
    setInfo("Lecture du lien...");
    const res = await fetch(`/api/admin/lieu?lien=${encodeURIComponent(texte.trim())}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.lat) {
      setPoint({ lat: data.lat, lng: data.lng });
      setInfo("Position trouvée ✓");
    } else setInfo(data?.erreur ?? "Position introuvable dans ce lien.");
  }

  function maPosition() {
    if (!navigator.geolocation) return setInfo("Position indisponible sur cet appareil.");
    setInfo("Recherche de votre position...");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint({ lat: p.coords.latitude, lng: p.coords.longitude });
        setInfo(`Position enregistrée ✓ (précision ${Math.round(p.coords.accuracy)} m)`);
      },
      () => setInfo("Position refusée : autorisez la localisation pour ce site."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function chercher() {
    if (adresse.trim().length < 3) return setInfo("Tapez d'abord l'adresse.");
    setInfo("Recherche sur la carte...");
    const res = await fetch(`/api/admin/lieu?adresse=${encodeURIComponent(adresse.trim())}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.lat) {
      setPoint({ lat: data.lat, lng: data.lng });
      setInfo(`Trouvé : ${data.libelle ?? "position"} — vérifiez sur la carte.`);
    } else setInfo(data?.erreur ?? "Adresse introuvable.");
  }

  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-c2b-cream p-3">
      <input
        value={adresse}
        onChange={(e) => setAdresse(e.target.value)}
        placeholder="Adresse / repère (ex : Guéliz, rés. Les Jardins, 3e étage)"
        maxLength={200}
        className="champ py-2 text-sm"
      />
      <input
        value={lien}
        onChange={(e) => lireLien(e.target.value)}
        placeholder="Coller un lien Google Maps ou une position WhatsApp"
        className="champ py-2 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={maPosition} className="btn-secondary px-2 py-2 text-xs">
          <Crosshair size={14} /> Ma position
        </button>
        <button onClick={chercher} className="btn-secondary px-2 py-2 text-xs">
          <Search size={14} /> Chercher l&apos;adresse
        </button>
      </div>
      {avecTelephone && (
        <input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Téléphone (facultatif)"
          inputMode="tel"
          maxLength={30}
          className="champ py-2 text-sm"
        />
      )}
      <p className="text-xs text-c2b-muted">
        {point ? (
          <>
            📍 {point.lat.toFixed(5)}, {point.lng.toFixed(5)} ·{" "}
            <a href={lienPoint(point)} target="_blank" rel="noopener noreferrer" className="font-semibold text-c2b-green underline">
              voir sur la carte
            </a>
          </>
        ) : (
          "Pas encore de position GPS."
        )}
        {info && <span className="block">{info}</span>}
      </p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setEnCours(true);
            await onEnregistrer(adresse.trim(), point, telephone.trim());
            setEnCours(false);
          }}
          disabled={enCours}
          className="btn-primary flex-1 py-2 text-sm"
        >
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button onClick={onAnnuler} className="btn-secondary flex-1 py-2 text-sm">
          Annuler
        </button>
      </div>
    </div>
  );
}

export function LivraisonClient({
  date,
  aujourdhui,
  service,
  arretsInitiaux,
  reglagesInitiaux,
}: {
  date: string;
  aujourdhui: string;
  service: Service;
  arretsInitiaux: ArretLivraison[];
  reglagesInitiaux: ReglagesLivraison;
}) {
  const supabase = createClient();
  const [arrets, setArrets] = useState(arretsInitiaux);
  const [reglages, setReglages] = useState(reglagesInitiaux);
  const [reglagesOuverts, setReglagesOuverts] = useState(!reglagesInitiaux.depart);
  const [editionDepart, setEditionDepart] = useState(false);
  const [editionArret, setEditionArret] = useState<string | null>(null);
  // Ordre modifié à la main : liste de clés par livreur (sinon calcul auto).
  const [plan, setPlan] = useState<string[][] | null>(null);
  const [message, setMessage] = useState("");

  const heureDepart = service === "dejeuner" ? reglages.heureMidi : reglages.heureSoir;
  const nb = Math.min(Math.max(reglages.nbLivreurs, 1), 3);
  const places = arrets.filter((a): a is ArretPlace => a.lat != null && a.lng != null);
  const sansAdresse = arrets.filter((a) => a.lat == null || a.lng == null);
  const depart = reglages.depart;
  const params = { vitesseKmh: reglages.vitesseKmh, minutesParArret: reglages.minutesParArret };

  const tournees = useMemo(() => {
    if (!depart) return [];
    if (plan) {
      const parCle = new Map(places.map((a) => [a.cle, a]));
      return plan.map((cles) => mesurer(depart, cles.map((c) => parCle.get(c)).filter((a): a is ArretPlace => !!a), params));
    }
    return planifier(depart, places, nb, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart, plan, places.length, nb, reglages.vitesseKmh, reglages.minutesParArret, arrets]);

  const planActuel = () => tournees.map((t) => t.arrets.map((a) => a.cle));
  function deplacer(livreur: number, index: number, sens: -1 | 1) {
    const p = planActuel();
    const cible = index + sens;
    if (cible < 0 || cible >= p[livreur].length) return;
    [p[livreur][index], p[livreur][cible]] = [p[livreur][cible], p[livreur][index]];
    setPlan(p);
  }
  function changerLivreur(livreur: number, index: number, vers: number) {
    const p = planActuel();
    const [cle] = p[livreur].splice(index, 1);
    p[vers].push(cle);
    setPlan(p);
  }

  async function enregistrerReglages(maj: Partial<ReglagesLivraison>) {
    const nouveaux = { ...reglages, ...maj };
    setReglages(nouveaux);
    const { error } = await supabase.from("application_livraison_reglages").upsert({ id: 1, valeur: nouveaux });
    setMessage(error ? "Réglages non enregistrés, réessayez." : "");
  }

  async function enregistrerAdresse(a: ArretLivraison, adresse: string, point: Point | null, telephone: string) {
    const maj = { adresse: adresse || null, lat: point?.lat ?? null, lng: point?.lng ?? null };
    const { error } =
      a.source === "client"
        ? await supabase
            .from("application_clients")
            .update({ livraison_adresse: maj.adresse, livraison_lat: maj.lat, livraison_lng: maj.lng })
            .eq("id", a.id)
        : // Même personne ajoutée à la main : midi et soir du jour.
          await supabase
            .from("application_cuisine_extras")
            .update({ ...maj, telephone: telephone || null })
            .eq("date", date)
            .eq("nom", a.nom);
    if (error) return setMessage("Adresse non enregistrée, réessayez.");
    setArrets((prev) =>
      prev.map((x) => (x.cle === a.cle ? { ...x, ...maj, telephone: a.source === "ajout" ? telephone || null : x.telephone } : x))
    );
    setPlan(null);
    setEditionArret(null);
  }

  function texteTournee(i: number) {
    const t = tournees[i];
    const livreur = reglages.livreurs[i]?.nom || `Livreur ${i + 1}`;
    const lignes = [
      `*🛵 Tournée ${service === "dejeuner" ? "☀️ midi" : "🌙 soir"} — ${dateLongue(date)}*`,
      `*${livreur}* · ${t.arrets.length} arrêt${t.arrets.length > 1 ? "s" : ""} · ~${duree(t.dureeMin)} · départ ${heureDepart}, fin vers ${heure(heureDepart, t.dureeMin)}`,
      "",
    ];
    t.arrets.forEach((a, k) => {
      const x = a as ArretPlace;
      lignes.push(`${k + 1}. ${heure(heureDepart, t.arrivees[k])} — *${nomCourt(x.nom)}*${x.telephone ? ` 📞 ${x.telephone}` : ""}`);
      if (x.adresse) lignes.push(`   ${x.adresse}`);
      lignes.push(`   ${lienPoint(x)}`);
      if (x.note) lignes.push(`   → ${x.note}`);
    });
    const liens = depart ? liensGoogleMaps(depart, t.arrets) : [];
    if (liens.length) {
      lignes.push("", liens.length > 1 ? "*Itinéraire (en plusieurs parties) :*" : "*Itinéraire :*");
      liens.forEach((l, k) => lignes.push(liens.length > 1 ? `Partie ${k + 1} : ${l}` : l));
    }
    return lignes.join("\n");
  }

  const libelleJour =
    libelleDate(date, aujourdhui) === "Aujourd'hui" || libelleDate(date, aujourdhui) === "Hier"
      ? libelleDate(date, aujourdhui)
      : date === decalerDate(aujourdhui, 1)
        ? "Demain"
        : new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const lien = (d: string, s: Service) => `/admin/livraison?date=${d}&service=${s}`;

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Tournées de <em>livraison</em>
          </h1>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Link
            href={lien(decalerDate(date, -1), service)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Jour précédent"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[80px] text-center text-sm font-bold text-c2b-green first-letter:uppercase">{libelleJour}</span>
          <Link
            href={lien(decalerDate(date, 1), service)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Jour suivant"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["dejeuner", "diner"] as const).map((s) => (
          <Link
            key={s}
            href={lien(date, s)}
            className={`rounded-full py-2.5 text-center text-sm font-bold ${
              service === s ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
            }`}
          >
            {s === "dejeuner" ? "☀️ Midi" : "🌙 Soir"}
          </Link>
        ))}
      </div>

      {/* Réglages : départ, livreurs, heure, vitesse */}
      <section className="carte p-4">
        <button onClick={() => setReglagesOuverts(!reglagesOuverts)} className="flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-2 font-bold text-c2b-green">
            <Settings size={17} /> Réglages
          </span>
          <span className="text-xs text-c2b-muted">
            {nb} livreur{nb > 1 ? "s" : ""} · départ {heureDepart}
          </span>
        </button>
        {reglagesOuverts && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-bold text-c2b-muted mb-1">Point de départ (cuisine)</p>
              {reglages.depart && !editionDepart ? (
                <p className="text-sm text-c2b-green">
                  📍 {reglages.depart.adresse || "Position enregistrée"} ·{" "}
                  <button onClick={() => setEditionDepart(true)} className="font-semibold text-c2b-gold">
                    modifier
                  </button>
                </p>
              ) : (
                <EditeurPosition
                  adresseInitiale={reglages.depart?.adresse ?? ""}
                  pointInitial={reglages.depart ? { lat: reglages.depart.lat, lng: reglages.depart.lng } : null}
                  onEnregistrer={async (adresse, point) => {
                    if (!point) return setMessage("Indiquez la position de la cuisine (lien, Ma position ou recherche).");
                    await enregistrerReglages({ depart: { adresse, lat: point.lat, lng: point.lng } });
                    setEditionDepart(false);
                    setPlan(null);
                  }}
                  onAnnuler={() => setEditionDepart(false)}
                />
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-c2b-muted mb-1">Nombre de livreurs</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setPlan(null);
                      enregistrerReglages({ nbLivreurs: n });
                    }}
                    className={`rounded-full py-2 text-sm font-bold ${
                      nb === n ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-c2b-muted">Livreurs (nom et WhatsApp pour leur envoyer la tournée)</p>
              {reglages.livreurs.slice(0, nb).map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input
                    defaultValue={l.nom}
                    onBlur={(e) => {
                      const livreurs = [...reglages.livreurs];
                      livreurs[i] = { ...livreurs[i], nom: e.target.value.trim().slice(0, 40) || `Livreur ${i + 1}` };
                      enregistrerReglages({ livreurs });
                    }}
                    placeholder={`Livreur ${i + 1}`}
                    className="champ py-2 text-sm"
                    style={{ borderLeft: `4px solid ${COULEURS[i]}` }}
                  />
                  <input
                    defaultValue={l.telephone}
                    onBlur={(e) => {
                      const livreurs = [...reglages.livreurs];
                      livreurs[i] = { ...livreurs[i], telephone: e.target.value.trim().slice(0, 30) };
                      enregistrerReglages({ livreurs });
                    }}
                    placeholder="06…"
                    inputMode="tel"
                    className="champ py-2 text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["heureMidi", "Départ midi"],
                  ["heureSoir", "Départ soir"],
                ] as const
              ).map(([cle, libelle]) => (
                <label key={cle} className="block text-xs font-bold text-c2b-muted">
                  {libelle}
                  <input
                    type="time"
                    defaultValue={reglages[cle]}
                    onBlur={(e) => e.target.value && enregistrerReglages({ [cle]: e.target.value })}
                    className="champ mt-1 py-2 text-sm"
                  />
                </label>
              ))}
              <label className="block text-xs font-bold text-c2b-muted">
                Vitesse moyenne (km/h)
                <input
                  type="number"
                  min={8}
                  max={60}
                  defaultValue={reglages.vitesseKmh}
                  onBlur={(e) => enregistrerReglages({ vitesseKmh: Math.min(60, Math.max(8, Number(e.target.value) || 22)) })}
                  className="champ mt-1 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-c2b-muted">
                Minutes par arrêt
                <input
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={reglages.minutesParArret}
                  onBlur={(e) => enregistrerReglages({ minutesParArret: Math.min(20, Math.max(1, Number(e.target.value) || 4)) })}
                  className="champ mt-1 py-2 text-sm"
                />
              </label>
            </div>
            <p className="text-[11px] text-c2b-muted">
              Temps estimé à partir des distances et de la vitesse moyenne (trafic non compris). Ajustez la vitesse après
              quelques tournées pour coller à la réalité.
            </p>
          </div>
        )}
      </section>

      {message && <p className="text-sm font-semibold text-red-700">{message}</p>}

      {arrets.length === 0 && (
        <p className="carte p-5 text-center text-sm text-c2b-muted">
          Aucune livraison pour ce service. Préparez d&apos;abord la{" "}
          <Link href={`/admin/cuisine?date=${date}`} className="font-bold text-c2b-green underline">
            fiche cuisine
          </Link>
          .
        </p>
      )}

      {/* Personnes sans position GPS */}
      {sansAdresse.length > 0 && (
        <section className="carte border-red-200 p-4">
          <p className="font-bold text-red-700">
            <MapPin size={16} className="mr-1 inline" />
            {sansAdresse.length} adresse{sansAdresse.length > 1 ? "s" : ""} à compléter
          </p>
          <p className="mt-0.5 text-xs text-c2b-muted">
            Sans position, la personne n&apos;est pas placée dans une tournée. À faire une seule fois : c&apos;est mémorisé.
          </p>
          <ul className="mt-2 divide-y divide-black/5">
            {sansAdresse.map((a) => (
              <li key={a.cle} className="py-2">
                <button onClick={() => setEditionArret(editionArret === a.cle ? null : a.cle)} className="flex w-full items-center justify-between text-left">
                  <span className="text-sm font-bold text-c2b-green">{a.nom}</span>
                  <span className="text-xs font-semibold text-c2b-gold">Ajouter l&apos;adresse</span>
                </button>
                {editionArret === a.cle && (
                  <EditeurPosition
                    adresseInitiale={a.adresse ?? ""}
                    pointInitial={null}
                    telephoneInitial={a.telephone ?? ""}
                    avecTelephone={a.source === "ajout"}
                    onEnregistrer={(adresse, point, tel) => enregistrerAdresse(a, adresse, point, tel)}
                    onAnnuler={() => setEditionArret(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!depart && places.length > 0 && (
        <p className="carte p-4 text-sm font-semibold text-c2b-green">
          Indiquez le point de départ (la cuisine) dans les réglages pour calculer les tournées.
        </p>
      )}

      {/* Tournées */}
      {depart && places.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl text-c2b-green">
              {places.length} livraison{places.length > 1 ? "s" : ""}
            </h2>
            {plan && (
              <button onClick={() => setPlan(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-c2b-gold">
                <RotateCcw size={14} /> Recalculer
              </button>
            )}
          </div>
          {tournees.map((t, i) => {
            const livreur = reglages.livreurs[i] ?? { nom: `Livreur ${i + 1}`, telephone: "" };
            const liens = liensGoogleMaps(depart, t.arrets);
            const numero = livreur.telephone ? numeroWhatsApp(livreur.telephone) : "";
            return (
              <div key={i} className="carte overflow-hidden">
                <div className="px-4 py-3 text-white" style={{ backgroundColor: COULEURS[i] }}>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold">🛵 {livreur.nom}</span>
                    <span className="text-sm font-bold">
                      {t.arrets.length} arrêt{t.arrets.length > 1 ? "s" : ""}
                    </span>
                  </p>
                  <p className="text-sm text-white/90">
                    ~{duree(t.dureeMin)} · {t.distanceKm.toFixed(1)} km · départ {heureDepart} → fin vers{" "}
                    <strong>{heure(heureDepart, t.dureeMin)}</strong>
                  </p>
                </div>
                {t.arrets.length === 0 ? (
                  <p className="p-4 text-sm text-c2b-muted">Aucun arrêt.</p>
                ) : (
                  <ol className="divide-y divide-black/5">
                    {t.arrets.map((a, k) => {
                      const x = a as ArretPlace;
                      return (
                        <li key={x.cle} className="flex items-start gap-3 px-4 py-2.5">
                          <span
                            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: COULEURS[i] }}
                          >
                            {k + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-bold tabular-nums text-c2b-green">{heure(heureDepart, t.arrivees[k])}</span>{" "}
                              <span className="font-bold text-c2b-green">{x.nom}</span>
                            </p>
                            {x.adresse && <p className="truncate text-xs text-c2b-muted">{x.adresse}</p>}
                            {x.note && <p className="text-xs italic text-c2b-text">→ {x.note}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                              <a href={lienPoint(x)} target="_blank" rel="noopener noreferrer" className="text-c2b-green underline">
                                Carte
                              </a>
                              {x.telephone && (
                                <a href={`tel:${x.telephone.replace(/\s/g, "")}`} className="text-c2b-green underline">
                                  Appeler
                                </a>
                              )}
                              <button onClick={() => setEditionArret(editionArret === x.cle ? null : x.cle)} className="text-c2b-gold">
                                Adresse
                              </button>
                              {nb > 1 && (
                                <select
                                  value={i}
                                  onChange={(e) => changerLivreur(i, k, Number(e.target.value))}
                                  className="rounded-full border border-c2b-green/15 bg-white px-2 py-0.5 text-xs text-c2b-green"
                                  aria-label={`Livreur de ${x.nom}`}
                                >
                                  {tournees.map((_, j) => (
                                    <option key={j} value={j}>
                                      {reglages.livreurs[j]?.nom ?? `Livreur ${j + 1}`}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            {editionArret === x.cle && (
                              <EditeurPosition
                                adresseInitiale={x.adresse ?? ""}
                                pointInitial={{ lat: x.lat, lng: x.lng }}
                                telephoneInitial={x.telephone ?? ""}
                                avecTelephone={x.source === "ajout"}
                                onEnregistrer={(adresse, point, tel) => enregistrerAdresse(x, adresse, point, tel)}
                                onAnnuler={() => setEditionArret(null)}
                              />
                            )}
                          </div>
                          <div className="flex flex-shrink-0 flex-col">
                            <button
                              onClick={() => deplacer(i, k, -1)}
                              disabled={k === 0}
                              className="p-1 text-c2b-muted disabled:opacity-20"
                              aria-label={`Monter ${x.nom}`}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              onClick={() => deplacer(i, k, 1)}
                              disabled={k === t.arrets.length - 1}
                              className="p-1 text-c2b-muted disabled:opacity-20"
                              aria-label={`Descendre ${x.nom}`}
                            >
                              <ArrowDown size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {t.arrets.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-t border-black/5 p-3">
                    <a
                      href={liens[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-full bg-c2b-green px-3 py-2.5 text-sm font-bold text-c2b-cream"
                    >
                      <Navigation size={15} /> Itinéraire{liens.length > 1 ? ` (1/${liens.length})` : ""}
                    </a>
                    <a
                      href={`https://wa.me/${numero}?text=${encodeURIComponent(texteTournee(i))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
                    >
                      <Send size={15} /> {numero ? `Envoyer à ${livreur.nom}` : "WhatsApp"}
                    </a>
                    {liens.slice(1).map((l, k) => (
                      <a
                        key={l}
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="col-span-2 rounded-full border border-c2b-green/15 py-2 text-center text-xs font-bold text-c2b-green"
                      >
                        Itinéraire, partie {k + 2}/{liens.length}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-c2b-muted">
            Les flèches changent l&apos;ordre, le menu déplace une livraison vers un autre livreur. « Recalculer » revient à
            l&apos;ordre automatique.
          </p>
        </section>
      )}
    </main>
  );
}
