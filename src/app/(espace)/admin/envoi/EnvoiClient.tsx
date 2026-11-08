"use client";

import { useEffect, useState } from "react";
import { Send, Check, RotateCcw } from "lucide-react";
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
}

type Filtre = "restants" | "tous" | "client" | "prospect";

const MODELE_DEFAUT = `Bonjour {prenom} 👋

Le menu Chef2Box de la semaine du {semaine} est en ligne :

{menu}

Commande ici en 1 minute (midi, soir, les jours que tu veux) :
{lien}

Modifiable jusqu'à la veille 20 h. À très vite !`;

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
}: {
  semaines: string[];
  menus: Record<string, Record<string, { dejeuner: string; diner: string }>>;
  destinatairesInitiaux: Destinataire[];
}) {
  const supabase = createClient();
  const [semaine, setSemaine] = useState(semaines[0]);
  const [destinataires, setDestinataires] = useState(destinatairesInitiaux);
  const [modele, setModele] = useState(MODELE_DEFAUT);
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<Filtre>("restants");
  const [preparation, setPreparation] = useState("");
  const [modeleOuvert, setModeleOuvert] = useState(false);

  // Modèle et envois déjà faits : gardés sur ce téléphone (par semaine).
  useEffect(() => {
    const m = lire("c2b-envoi-modele");
    if (m) setModele(m);
  }, []);
  useEffect(() => {
    setEnvoyes(new Set(JSON.parse(lire(`c2b-envoi-${semaine}`) ?? "[]") as string[]));
  }, [semaine]);

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

  const liste = destinataires.filter((d) =>
    filtre === "restants" ? !envoyes.has(d.cle) : filtre === "tous" ? true : d.type === filtre
  );
  const prochain = destinataires.find((d) => !envoyes.has(d.cle) && d.jeton);
  const sansLien = destinataires.filter((d) => !d.jeton).length;
  const nbClients = destinataires.filter((d) => d.type === "client").length;

  function marquer(d: Destinataire, envoye = true) {
    setEnvoyes((s) => {
      const n = new Set(s);
      if (envoye) n.add(d.cle);
      else n.delete(d.cle);
      ecrire(`c2b-envoi-${semaine}`, JSON.stringify([...n]));
      return n;
    });
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
            Envoyés : {envoyes.size} / {destinataires.length}
          </p>
          <p className="text-xs text-c2b-muted">
            {nbClients} clients · {destinataires.length - nbClients} prospects
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-c2b-green/10">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${destinataires.length ? (envoyes.size / destinataires.length) * 100 : 0}%` }} />
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
            <a
              href={lienWa(prochain)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => marquer(prochain)}
              className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-base font-bold text-white"
            >
              <Send size={18} /> Envoyer à {prochain.nom.split(/\s+/)[0]}
            </a>
            <p className="text-[11px] text-c2b-muted">WhatsApp s&apos;ouvre avec le message prêt : envoyez, revenez, le suivant s&apos;affiche.</p>
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 px-3 py-3 text-center text-sm font-bold text-emerald-700">
            {sansLien ? "Préparez d'abord les liens ci-dessus." : "Tout le monde a reçu le menu ✓"}
          </p>
        )}
      </section>

      {/* Liste */}
      <section className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["restants", `À envoyer (${destinataires.length - envoyes.size})`],
              ["tous", `Tous (${destinataires.length})`],
              ["client", `Clients (${nbClients})`],
              ["prospect", `Prospects (${destinataires.length - nbClients})`],
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
            const fait = envoyes.has(d.cle);
            return (
              <li key={d.cle} className={`carte flex items-center gap-2 px-3 py-2 ${fait ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-c2b-green">
                    {d.nom}{" "}
                    <span className={`text-[10px] font-bold ${d.type === "client" ? "text-emerald-700" : "text-c2b-gold"}`}>
                      {d.type === "client" ? "client" : "prospect"}
                    </span>
                  </p>
                  <p className="text-[11px] text-c2b-muted">+{d.numero}</p>
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
        {envoyes.size > 0 && (
          <button
            onClick={() => {
              setEnvoyes(new Set());
              ecrire(`c2b-envoi-${semaine}`, "[]");
            }}
            className="mx-auto flex items-center gap-1 py-2 text-xs font-semibold text-c2b-muted underline"
          >
            <RotateCcw size={12} /> Tout remettre à « à envoyer »
          </button>
        )}
      </section>
    </main>
  );
}
