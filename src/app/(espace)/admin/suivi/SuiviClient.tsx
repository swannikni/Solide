"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { decalerDate } from "@/lib/dates";

export interface LigneSuivi {
  id: string;
  nom: string;
  telephone: string | null;
  statut: "regulier" | "irregulier" | "decroche" | "jamais";
  joursSemaine: number; // jours avec au moins un repas noté sur les 7 derniers
  joursMois: number;
  dernierRepas: string | null;
  inscritDepuis: number; // jours
  derniereVisite: string | null;
  installee: boolean;
  plateforme: string | null;
  rappels: boolean;
  ia7j: number;
  dernierePesee: string | null;
}

const STATUTS: Record<LigneSuivi["statut"], { libelle: string; classe: string }> = {
  regulier: { libelle: "🟢 Régulier", classe: "bg-emerald-50 text-emerald-800" },
  irregulier: { libelle: "🟡 Irrégulier", classe: "bg-amber-50 text-amber-800" },
  decroche: { libelle: "🔴 Décroche", classe: "bg-red-50 text-red-700" },
  jamais: { libelle: "⚪ Pas commencé", classe: "bg-black/5 text-c2b-muted" },
};

const prenom = (nom: string) => nom.trim().split(/\s+/)[0] ?? nom;

// Message de relance prêt à envoyer (modifiable avant l'envoi dans WhatsApp).
function messageRelance(l: LigneSuivi) {
  const p = prenom(l.nom);
  if (l.statut === "jamais")
    return `Bonjour ${p} ! Avez-vous pu ouvrir l'appli Chef2Box ? Je peux vous aider à l'installer et à noter votre premier repas en 2 minutes 🙂 https://chef2box-appli.netlify.app`;
  if (l.statut === "decroche")
    return `Bonjour ${p} ! On ne vous a pas vu noter vos repas depuis quelques jours sur l'appli Chef2Box. Tout va bien ? Besoin d'un coup de main ? 💪`;
  return `Bonjour ${p} ! Bravo pour vos repas notés 👏 Petit conseil : avec « Mon plat Chef2Box », votre box se note en 10 secondes. On garde le rythme ?`;
}

// Numéro marocain → format international pour wa.me (0612… → 212612…).
function lienWhatsApp(telephone: string | null, texte: string) {
  if (!telephone) return null;
  let n = telephone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.length === 10 && n.startsWith("0")) n = `212${n.slice(1)}`;
  if (n.length < 8) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texte)}`;
}

function ilYA(date: string | null, aujourdhui: string) {
  if (!date) return "jamais";
  const jours = Math.round((Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${date.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} j`;
}

export function SuiviClient({ lignes, aujourdhui }: { lignes: LigneSuivi[]; aujourdhui: string }) {
  const ilYa3Jours = decalerDate(aujourdhui, -3);
  const aRelancer = (l: LigneSuivi) =>
    l.statut === "decroche" ||
    (l.statut === "jamais" && l.inscritDepuis >= 2) ||
    (l.statut === "irregulier" && (l.dernierRepas ?? "") <= ilYa3Jours);
  // Ceux qui viennent de décrocher d'abord : les plus faciles à faire revenir.
  const ordre = { decroche: 0, jamais: 1, irregulier: 2, regulier: 3 };
  const relances = lignes.filter(aRelancer).sort((a, b) => ordre[a.statut] - ordre[b.statut]);
  const [filtre, setFiltre] = useState<"relancer" | "tous">(relances.length ? "relancer" : "tous");
  const affichees = filtre === "relancer" ? relances : [...lignes].sort((a, b) => ordre[a.statut] - ordre[b.statut]);

  const total = lignes.length;
  const actifs = lignes.filter((l) => l.joursSemaine > 0).length;
  const installes = lignes.filter((l) => l.installee).length;
  const avecRappels = lignes.filter((l) => l.rappels).length;
  const iphones = lignes.filter((l) => l.plateforme === "ios");
  const iphonesInstalles = iphones.filter((l) => l.installee).length;

  const chiffres = [
    { valeur: `${actifs}/${total}`, libelle: "ont noté un repas cette semaine" },
    { valeur: String(relances.length), libelle: "à relancer", alerte: relances.length > 0 },
    { valeur: `${installes}/${total}`, libelle: "ont installé l'appli" },
    { valeur: `${avecRappels}/${total}`, libelle: "ont activé le rappel du soir" },
  ];

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          Suivi des <em>clients</em>
        </h1>
        <p className="text-sm text-c2b-muted mt-2">
          Qui utilise vraiment l&apos;appli, et qui relancer aujourd&apos;hui.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {chiffres.map((c) => (
          <div key={c.libelle} className={`carte p-4 ${c.alerte ? "border-red-200" : ""}`}>
            <p className={`font-serif text-3xl ${c.alerte ? "text-red-700" : "text-c2b-green"}`}>{c.valeur}</p>
            <p className="mt-1 text-xs text-c2b-muted">{c.libelle}</p>
          </div>
        ))}
      </div>

      {iphones.length > 0 && (
        <p className="rounded-2xl bg-c2b-gold/[0.1] px-4 py-3 text-sm text-c2b-green">
          📱 Sur iPhone, <strong>{iphonesInstalles} sur {iphones.length}</strong> ont installé l&apos;appli sur leur écran
          d&apos;accueil
          {iphones.length >= 5 &&
            (iphonesInstalles / iphones.length < 0.5
              ? ". Moins de la moitié : passer sur l'App Store simplifierait l'installation."
              : ". Plus de la moitié : l'installation actuelle suffit pour l'instant.")}
          {iphones.length < 5 && "."}
        </p>
      )}

      <div className="flex gap-2">
        {(
          [
            ["relancer", `À relancer (${relances.length})`],
            ["tous", `Tous les clients (${total})`],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setFiltre(cle)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
              filtre === cle ? "bg-c2b-green text-white" : "bg-white text-c2b-green border border-c2b-green/15"
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {affichees.length === 0 ? (
        <p className="carte p-5 text-center text-sm text-c2b-muted">
          {filtre === "relancer" ? "Personne à relancer aujourd'hui 🎉" : "Aucun client pour l'instant."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {affichees.map((l) => {
            const texte = messageRelance(l);
            const whatsapp = lienWhatsApp(l.telephone, texte);
            return (
              <li key={l.id} className="carte p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-c2b-green truncate">{l.nom}</p>
                    <p className="text-xs text-c2b-muted mt-0.5">
                      {l.dernierRepas
                        ? `Dernier repas noté ${ilYA(l.dernierRepas, aujourdhui)} · ${l.joursSemaine} j sur 7`
                        : l.inscritDepuis <= 30
                          ? `Aucun repas noté · inscrit ${ilYA(decalerDate(aujourdhui, -l.inscritDepuis), aujourdhui)}`
                          : "Aucun repas noté depuis 30 jours"}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUTS[l.statut].classe}`}>
                    {STATUTS[l.statut].libelle}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-c2b-green">
                    {l.installee ? "📱 Appli installée" : l.derniereVisite ? "🌐 Via le navigateur" : "❓ Pas encore ouvert"}
                    {l.plateforme === "ios" ? " · iPhone" : l.plateforme === "android" ? " · Android" : ""}
                  </span>
                  <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-c2b-green">
                    {l.rappels ? "🔔 Rappels activés" : "🔕 Rappels non activés"}
                  </span>
                  {l.derniereVisite && (
                    <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-c2b-green">
                      👀 Ouvert {ilYA(l.derniereVisite, aujourdhui)}
                    </span>
                  )}
                  {l.ia7j > 0 && (
                    <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-c2b-green">✨ {l.ia7j} usage IA (7 j)</span>
                  )}
                  {l.dernierePesee && (
                    <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-c2b-green">
                      ⚖️ Pesé {ilYA(l.dernierePesee, aujourdhui)}
                    </span>
                  )}
                </div>

                {aRelancer(l) && (
                  <div className="mt-3 flex gap-2">
                    {whatsapp && (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-full bg-[#25D366] px-4 py-2.5 text-center text-sm font-bold text-white"
                      >
                        WhatsApp
                      </a>
                    )}
                    <Link
                      href={`/messages?client=${l.id}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-c2b-green/20 bg-white px-4 py-2.5 text-sm font-bold text-c2b-green"
                    >
                      <MessageCircle size={15} /> Message
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-c2b-muted">
        Régulier : repas notés au moins 4 jours sur les 7 derniers. Irrégulier : 1 à 3 jours. Décroche : rien depuis 7
        jours alors qu&apos;il notait avant. « Appli installée » et « Ouvert » sont suivis depuis le 26 septembre.
      </p>
    </main>
  );
}
