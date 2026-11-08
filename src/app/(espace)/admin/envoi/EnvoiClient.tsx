"use client";

import { useEffect, useState } from "react";
import { Send, Check, ImagePlus, Camera } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate } from "@/lib/dates";
import { nouveauJeton } from "@/lib/ma-semaine";
import type { Palier } from "@/lib/types";

// Une personne à prévenir : fiche client (avec ou sans commande) ou prospect
// du questionnaire (sa fiche et son lien sont créés à la préparation).
export interface Destinataire {
  cle: string; // « f:<fiche> » ou « q:<questionnaire> »
  nom: string;
  numero: string; // chiffres internationaux
  type: "client" | "prospect";
  ficheId: string | null;
  jeton: string | null;
  palier?: Palier | null;
  homonyme?: boolean;
  envois: number; // semaines où le menu lui a été envoyé
  vuLe: string | null; // dernière ouverture de son lien
  pause: boolean; // ne plus lui envoyer
}

// Prospect qui n'a jamais ouvert son lien après 3 envois : on arrête de le relancer.
const SEUIL_SILENCE = 3;
const silencieux = (d: Destinataire) => d.type === "prospect" && !d.vuLe && d.envois >= SEUIL_SILENCE;
const cleEnvoi = (d: Destinataire) => (d.ficheId ? `f:${d.ficheId}` : d.cle);

type Filtre = "restants" | "tous" | "client" | "prospect";

const MODELE_DEFAUT = `Bonjour {prenom} 👋

Voici le menu Chef2Box de la semaine du {semaine} 🍽️

👉 Pour commander, ouvre ton lien personnel :
{lien}

1. Coche ☀️ midi et/ou 🌙 soir pour les jours que tu veux.
2. Vérifie ton quartier : le prix s'affiche en bas.
3. Touche « Valider ma commande ».

Modifiable jusqu'à la veille 20 h. Une question ? Réponds simplement à ce message.`;

const lire = (cle: string) => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (cle: string, valeur: string) => {
  try {
    localStorage.setItem(cle, valeur);
  } catch {}
};
const jourCourt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
const dateLongue = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

export function EnvoiClient({
  semaines,
  menus,
  destinatairesInitiaux,
  imagesInitiales = [],
  envoyesInitiaux = {},
}: {
  semaines: string[];
  menus: Record<string, Record<string, { dejeuner: string; diner: string }>>;
  destinatairesInitiaux: Destinataire[];
  imagesInitiales?: string[]; // semaines dont l'image du menu est déposée
  envoyesInitiaux?: Record<string, string[]>; // par semaine : « f:<fiche> » déjà prévenus
}) {
  const supabase = createClient();
  const [semaine, setSemaine] = useState(semaines[0]);
  const [destinataires, setDestinataires] = useState(destinatairesInitiaux);
  const [modele, setModele] = useState(MODELE_DEFAUT);
  const [envoyesParSemaine, setEnvoyesParSemaine] = useState<Record<string, string[]>>(envoyesInitiaux);
  const envoyes = new Set(envoyesParSemaine[semaine] ?? []);
  const [silenceVu, setSilenceVu] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("restants");
  const [recherche, setRecherche] = useState("");
  const [preparation, setPreparation] = useState("");
  const [modeleOuvert, setModeleOuvert] = useState(false);
  // Image du menu : déposée par semaine, gardée en mémoire pour le partage photo.
  const [images, setImages] = useState<Set<string>>(new Set(imagesInitiales));
  const [version, setVersion] = useState(0);
  const [fichierImage, setFichierImage] = useState<File | null>(null);
  const [etatImage, setEtatImage] = useState("");
  const aImage = images.has(semaine);
  useEffect(() => {
    setFichierImage(null);
    if (!images.has(semaine)) return;
    fetch(`/api/menu-image/${semaine}?v=${version}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setFichierImage(new File([b], `menu-chef2box-${semaine}.jpg`, { type: b.type || "image/jpeg" })))
      .catch(() => {});
  }, [semaine, images, version]);

  // Image réduite (1080 px de large, JPEG) puis enregistrée pour la semaine.
  async function deposerImage(fichier: File) {
    setEtatImage("Envoi de l'image…");
    try {
      const bitmap = await createImageBitmap(fichier);
      const largeur = Math.min(1080, bitmap.width);
      const hauteur = Math.round((bitmap.height * largeur) / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = largeur;
      canvas.height = hauteur;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, largeur, hauteur);
      const data = canvas.toDataURL("image/jpeg", 0.85);
      const { error } = await supabase
        .from("application_parametres")
        .upsert({ cle: `menu_image:${semaine}`, valeur: { data, maj: new Date().toISOString() } });
      if (error) throw error;
      setImages((s) => new Set(s).add(semaine));
      setVersion((v) => v + 1);
      setEtatImage("Image enregistrée ✓");
    } catch {
      setEtatImage("Image non enregistrée : réessayez avec une photo JPG ou PNG.");
    }
  }

  // Envoi avec la vraie photo : partage du téléphone (choisir le contact dans WhatsApp).
  async function partagerPhoto(d: Destinataire) {
    if (!fichierImage) return;
    const donnees = { files: [fichierImage], text: message(d) };
    if (!navigator.canShare?.(donnees)) return setEtatImage("Le partage de photo n'est pas disponible sur cet appareil.");
    try {
      await navigator.share(donnees);
      marquer(d);
    } catch {}
  }

  // Modèle et envois déjà faits : gardés sur ce téléphone (par semaine).
  useEffect(() => {
    const m = lire("c2b-envoi-modele");
    if (m) setModele(m);
  }, []);

  const jours = [0, 1, 2, 3, 4].map((i) => decalerDate(semaine, i));
  const menu = menus[semaine] ?? {};
  const lignesMenu = jours
    .map((d) => {
      const m = menu[d];
      const parts = [m?.dejeuner && `☀️ ${m.dejeuner}`, m?.diner && `🌙 ${m.diner}`].filter(Boolean);
      return parts.length ? `• ${jourCourt(d).charAt(0).toUpperCase()}${jourCourt(d).slice(1)} : ${parts.join(" · ")}` : null;
    })
    .filter(Boolean) as string[];
  const joursSansMenu = jours.filter((d) => !menu[d]?.dejeuner && !menu[d]?.diner).length;

  const [origine, setOrigine] = useState("https://chef2box-appli.netlify.app");
  useEffect(() => setOrigine(window.location.origin), []);
  const message = (d: Destinataire) =>
    modele
      .replaceAll("{prenom}", d.nom.split(/\s+/)[0])
      .replaceAll("{semaine}", dateLongue(semaine))
      .replaceAll("{menu}", lignesMenu.join("\n") || "(menu bientôt en ligne)")
      .replaceAll("{lien}", d.jeton ? `${origine}/ma-semaine/${d.jeton}` : "https://chef2box.com");

  // Ceux qui ne répondent jamais (ou mis en pause) sortent de l'envoi.
  const actifs = destinataires.filter((d) => !d.pause && !silencieux(d));
  const ecartes = destinataires.filter((d) => d.pause || silencieux(d));
  const envoyesActifs = actifs.filter((d) => envoyes.has(cleEnvoi(d))).length;
  // Recherche par nom ou numéro (sans accents), dans l'onglet choisi.
  const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cherche = sansAccents(recherche.trim());
  const correspond = (d: Destinataire) => !cherche || sansAccents(d.nom).includes(cherche) || d.numero.includes(cherche.replace(/[^\d]/g, "") || "§");
  const liste = actifs
    .filter((d) => (filtre === "restants" ? !envoyes.has(cleEnvoi(d)) : filtre === "tous" ? true : d.type === filtre))
    .filter(correspond);
  const ecartesTrouves = cherche ? ecartes.filter(correspond) : [];
  const prochain = actifs.find((d) => !envoyes.has(cleEnvoi(d)) && d.jeton);
  const sansLien = actifs.filter((d) => !d.jeton).length;
  const nbClients = actifs.filter((d) => d.type === "client").length;

  // Envoi noté dans la base (visible depuis n'importe quel téléphone).
  function marquer(d: Destinataire, envoye = true) {
    const c = cleEnvoi(d);
    setEnvoyesParSemaine((m) => {
      const l = new Set(m[semaine] ?? []);
      if (envoye) l.add(c);
      else l.delete(c);
      return { ...m, [semaine]: [...l] };
    });
    setDestinataires((prev) => prev.map((x) => (x.cle === d.cle ? { ...x, envois: Math.max(0, x.envois + (envoye ? 1 : -1)) } : x)));
    if (d.ficheId) {
      if (envoye) supabase.from("application_envois").upsert({ personne_id: d.ficheId, semaine }).then(() => {});
      else supabase.from("application_envois").delete().eq("personne_id", d.ficheId).eq("semaine", semaine).then(() => {});
    }
    // Prospect contacté : son suivi passe à « contacté ».
    if (envoye && d.cle.startsWith("q:")) {
      supabase.from("application_questionnaires").update({ suivi: "contacte" }).eq("id", d.cle.slice(2)).or("suivi.is.null,suivi.neq.client").then(() => {});
    }
  }

  // Crée les liens manquants : jeton pour les fiches, fiche + jeton pour les prospects.
  async function preparerLiens() {
    const aFaire = destinataires.filter((d) => !d.jeton);
    let faits = 0;
    const maj = new Map<string, Partial<Destinataire>>();
    for (let i = 0; i < aFaire.length; i += 10) {
      setPreparation(`Préparation des liens… ${faits} / ${aFaire.length}`);
      await Promise.all(
        aFaire.slice(i, i + 10).map(async (d) => {
          const jeton = nouveauJeton();
          if (d.ficheId) {
            const { error } = await supabase.from("application_personnes").update({ jeton }).eq("id", d.ficheId);
            if (!error) maj.set(d.cle, { jeton });
          } else {
            const nom = (d.homonyme ? `${d.nom} (questionnaire)` : d.nom).slice(0, 80);
            const { data, error } = await supabase
              .from("application_personnes")
              .insert({ nom, telephone: `+${d.numero}`, palier: d.palier ?? null, jeton })
              .select("id")
              .single<{ id: string }>();
            if (!error && data) maj.set(d.cle, { jeton, ficheId: data.id });
          }
          faits++;
        })
      );
    }
    setDestinataires((prev) => prev.map((d) => (maj.has(d.cle) ? { ...d, ...maj.get(d.cle) } : d)));
    const echecs = aFaire.length - maj.size;
    setPreparation(echecs ? `${maj.size} liens prêts, ${echecs} impossibles (nom déjà pris ?).` : `${maj.size} liens prêts ✓`);
  }

  // Ne plus envoyer / réactiver.
  async function mettreEnPause(d: Destinataire, pause: boolean) {
    if (!d.ficheId) return;
    const { error } = await supabase.from("application_personnes").update({ envoi_pause: pause }).eq("id", d.ficheId);
    if (!error) setDestinataires((prev) => prev.map((x) => (x.cle === d.cle ? { ...x, pause, envois: pause ? x.envois : Math.min(x.envois, SEUIL_SILENCE - 1) } : x)));
  }

  const suivi = (d: Destinataire) =>
    [
      d.envois ? `📩 ${d.envois} envoi${d.envois > 1 ? "s" : ""}` : null,
      d.vuLe
        ? `👀 ouvert le ${new Date(d.vuLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
        : d.envois
          ? "jamais ouvert"
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const lienWa = (d: Destinataire) => `https://wa.me/${d.numero}?text=${encodeURIComponent(message(d))}`;

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          <em>Envoi du menu</em>
        </h1>
        <p className="text-sm text-c2b-muted">Le menu de la semaine et son lien personnel, à chaque client et prospect, en un toucher chacun.</p>
      </div>

      {/* Semaine et menu */}
      <section className="carte space-y-3 p-4">
        <div className="grid grid-cols-2 gap-1.5">
          {semaines.map((l, i) => (
            <button
              key={l}
              onClick={() => setSemaine(l)}
              className={`rounded-full py-2 text-xs font-bold ${l === semaine ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"}`}
            >
              {i === 0 ? "Semaine du" : "Puis semaine du"} {dateLongue(l)}
            </button>
          ))}
        </div>
        {lignesMenu.length ? (
          <ul className="space-y-0.5 text-sm text-c2b-green">
            {lignesMenu.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            Menu pas encore rempli : remplissez-le dans Cuisine → 🍽️ Menu de la semaine.
          </p>
        )}
        {lignesMenu.length > 0 && joursSansMenu > 0 && (
          <p className="text-xs font-bold text-amber-700">⚠️ {joursSansMenu} jour{joursSansMenu > 1 ? "s" : ""} sans plat dans le menu.</p>
        )}
        <button onClick={() => setModeleOuvert((o) => !o)} className="text-xs font-bold text-c2b-gold underline">
          {modeleOuvert ? "Fermer le message" : "Modifier le message"}
        </button>
        {modeleOuvert && (
          <div className="space-y-1.5">
            <textarea
              value={modele}
              onChange={(e) => {
                setModele(e.target.value);
                ecrire("c2b-envoi-modele", e.target.value);
              }}
              rows={11}
              className="champ py-2 text-sm"
            />
            <p className="text-[11px] text-c2b-muted">
              {"{prenom}"} = son prénom · {"{semaine}"} = la date · {"{menu}"} = le menu · {"{lien}"} = son lien perso
            </p>
            <button
              onClick={() => {
                setModele(MODELE_DEFAUT);
                ecrire("c2b-envoi-modele", MODELE_DEFAUT);
              }}
              className="text-xs font-semibold text-c2b-muted underline"
            >
              Revenir au message de départ
            </button>
          </div>
        )}
      </section>

      {/* Image du menu */}
      <section className="carte space-y-2 p-4">
        <p className="text-sm font-bold text-c2b-green">📷 Image du menu</p>
        {aImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/menu-image/${semaine}?v=${version}`} alt="Menu de la semaine" className="max-h-80 rounded-xl border border-c2b-green/10" />
        ) : (
          <p className="text-xs text-c2b-muted">
            Déposez l&apos;image du menu de cette semaine : elle s&apos;affiche dans l&apos;aperçu du lien sur WhatsApp et dans l&apos;espace de chaque client.
          </p>
        )}
        <label className="btn-secondary flex w-full cursor-pointer items-center justify-center gap-1.5 py-2.5 text-sm">
          <ImagePlus size={16} /> {aImage ? "Changer l'image" : "Déposer l'image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) deposerImage(f);
              e.target.value = "";
            }}
          />
        </label>
        {etatImage && <p className="text-xs font-bold text-c2b-green">{etatImage}</p>}
      </section>

      {/* Liens à préparer (une fois) */}
      {sansLien > 0 && (
        <section className="carte space-y-2 border-c2b-gold/60 p-4">
          <p className="text-sm font-bold text-c2b-green">
            {sansLien} personne{sansLien > 1 ? "s" : ""} sans lien personnel
          </p>
          <p className="text-xs text-c2b-muted">
            Les prospects reçoivent une fiche (dans Clients, « sans commande ») et leur lien, pour commander directement. À faire une seule fois.
          </p>
          <button onClick={preparerLiens} disabled={preparation.startsWith("Préparation")} className="btn-primary w-full py-2.5 text-sm">
            Préparer les liens
          </button>
          {preparation && <p className="text-xs font-bold text-c2b-green">{preparation}</p>}
        </section>
      )}

      {/* Avancement + prochain */}
      <section className="carte space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-c2b-green">
            Envoyés : {envoyesActifs} / {actifs.length}
          </p>
          <p className="text-xs text-c2b-muted">
            {nbClients} clients · {actifs.length - nbClients} prospects
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-c2b-green/10">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${actifs.length ? (envoyesActifs / actifs.length) * 100 : 0}%` }} />
        </div>
        {prochain ? (
          <div className="space-y-2 rounded-xl bg-c2b-cream p-3">
            <p className="text-xs font-bold text-c2b-muted">Prochain</p>
            <p className="font-bold text-c2b-green">
              {prochain.nom}{" "}
              <span className={`text-[11px] font-bold ${prochain.type === "client" ? "text-emerald-700" : "text-c2b-gold"}`}>
                {prochain.type === "client" ? "client" : "prospect"}
              </span>
            </p>
            {suivi(prochain) && <p className="text-[11px] text-c2b-muted">{suivi(prochain)}</p>}
            {fichierImage ? (
              <>
                <button
                  onClick={() => partagerPhoto(prochain)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-base font-bold text-white"
                >
                  <Camera size={18} /> Photo + message à {prochain.nom.split(/\s+/)[0]}
                </button>
                <p className="text-[11px] text-c2b-muted">
                  Le partage s&apos;ouvre : choisissez WhatsApp puis {prochain.nom.split(/\s+/)[0]} (+{prochain.numero}). La photo part avec le texte et son lien.
                </p>
                <a
                  href={lienWa(prochain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => marquer(prochain)}
                  className="block text-center text-xs font-bold text-[#128C7E] underline"
                >
                  Sans photo (ouvre directement sa conversation)
                </a>
              </>
            ) : (
              <>
                <a
                  href={lienWa(prochain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => marquer(prochain)}
                  className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-base font-bold text-white"
                >
                  <Send size={18} /> Envoyer à {prochain.nom.split(/\s+/)[0]}
                </a>
                <p className="text-[11px] text-c2b-muted">Déposez l&apos;image du menu ci-dessus pour l&apos;envoyer avec la photo.</p>
              </>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 px-3 py-3 text-center text-sm font-bold text-emerald-700">
            {sansLien ? "Préparez d'abord les liens ci-dessus." : "Tout le monde a reçu le menu ✓"}
          </p>
        )}
      </section>

      {/* Liste */}
      <section className="space-y-2">
        <div className="relative">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="🔍 Rechercher un nom ou un numéro…"
            className="champ py-2.5 pr-9 text-sm"
          />
          {recherche && (
            <button
              onClick={() => setRecherche("")}
              className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full text-c2b-muted"
              aria-label="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["restants", `À envoyer (${actifs.length - envoyesActifs})`],
              ["tous", `Tous (${actifs.length})`],
              ["client", `Clients (${nbClients})`],
              ["prospect", `Prospects (${actifs.length - nbClients})`],
            ] as [Filtre, string][]
          ).map(([f, libelle]) => (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${filtre === f ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"}`}
            >
              {libelle}
            </button>
          ))}
        </div>
        <ul className="space-y-1.5">
          {liste.slice(0, 300).map((d) => {
            const fait = envoyes.has(cleEnvoi(d));
            return (
              <li key={d.cle} className={`carte flex items-center gap-2 px-3 py-2 ${fait ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-c2b-green">
                    {d.nom}{" "}
                    <span className={`text-[10px] font-bold ${d.type === "client" ? "text-emerald-700" : "text-c2b-gold"}`}>
                      {d.type === "client" ? "client" : "prospect"}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-c2b-muted">
                    +{d.numero}
                    {suivi(d) && ` · ${suivi(d)}`}
                  </p>
                </div>
                {fait ? (
                  <button onClick={() => marquer(d, false)} className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                    <Check size={13} /> Envoyé
                  </button>
                ) : d.jeton ? (
                  <a
                    href={lienWa(d)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => marquer(d)}
                    className="flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <Send size={13} /> Envoyer
                  </a>
                ) : (
                  <span className="text-[11px] font-semibold text-c2b-muted">Lien à préparer</span>
                )}
              </li>
            );
          })}
        </ul>
        {liste.length === 0 && (
          <p className="carte p-4 text-center text-sm text-c2b-muted">
            {cherche ? "Personne de ce nom dans cet onglet." : filtre === "restants" ? "Tout le monde a reçu le menu ✓" : "Personne ici."}
          </p>
        )}
        {ecartesTrouves.length > 0 && (
          <p className="px-1 text-xs text-c2b-muted">
            Aussi trouvé dans « Ne répondent pas » : {ecartesTrouves.map((d) => d.nom).join(", ")}.
          </p>
        )}
        {ecartes.length > 0 && (
          <div className="carte space-y-2 p-3">
            <button onClick={() => setSilenceVu((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="text-sm font-bold text-c2b-green">🔕 Ne répondent pas ({ecartes.length})</span>
              <span className="text-xs font-bold text-c2b-gold">{silenceVu ? "Masquer" : "Voir"}</span>
            </button>
            <p className="text-[11px] text-c2b-muted">
              Prospects qui n&apos;ont jamais ouvert leur lien après {SEUIL_SILENCE} envois, ou mis en pause : ils ne reçoivent plus le menu.
            </p>
            {silenceVu && (
              <ul className="space-y-1.5">
                {ecartes.map((d) => (
                  <li key={d.cle} className="flex items-center gap-2 rounded-lg bg-c2b-cream px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-c2b-green">{d.nom}</p>
                      <p className="truncate text-[11px] text-c2b-muted">{d.pause ? "En pause" : suivi(d)}</p>
                    </div>
                    {d.pause ? (
                      <button onClick={() => mettreEnPause(d, false)} className="text-xs font-bold text-c2b-green underline">
                        Réactiver
                      </button>
                    ) : (
                      <>
                        <button onClick={() => mettreEnPause(d, false)} className="text-xs font-bold text-c2b-green underline">
                          Relancer
                        </button>
                        <button onClick={() => mettreEnPause(d, true)} className="text-xs font-bold text-red-600 underline">
                          Pause
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
