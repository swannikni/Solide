"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { Pastille } from "@/components/Pastille";
import { decalerDate } from "@/lib/dates";
import type { DemandeRecompense, Defi, Recompense, TypeDefi } from "@/lib/types";

type Demande = DemandeRecompense & { client: { nom: string } | null };

const TYPES_DEFI: { type: TypeDefi; libelle: string }[] = [
  { type: "jours_notes", libelle: "Jours avec repas notés" },
  { type: "jours_calories", libelle: "Jours dans l'objectif calories" },
  { type: "jours_proteines", libelle: "Jours objectif protéines" },
];

const dateCourte = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Semaine en cours, du lundi au dimanche.
function semaineCourante(aujourdhui: string) {
  const rang = (new Date(`${aujourdhui}T12:00:00Z`).getUTCDay() + 6) % 7;
  const lundi = decalerDate(aujourdhui, -rang);
  return { debut: lundi, fin: decalerDate(lundi, 6) };
}

export function RecompensesAdmin({
  demandesInitiales,
  defisInitiaux,
  catalogueInitial,
  aujourdhui,
  activesInitial,
}: {
  demandesInitiales: Demande[];
  defisInitiaux: Defi[];
  catalogueInitial: Recompense[];
  aujourdhui: string;
  activesInitial: boolean;
}) {
  const supabase = createClient();
  const [demandes, setDemandes] = useState(demandesInitiales);
  const [defis, setDefis] = useState(defisInitiaux);
  const [catalogue, setCatalogue] = useState(catalogueInitial);
  const semaine = semaineCourante(aujourdhui);
  const [nouveauDefi, setNouveauDefi] = useState({
    titre: "5 jours à l'objectif protéines",
    type: "jours_proteines" as TypeDefi,
    cible: "5",
    debut: semaine.debut,
    fin: semaine.fin,
    points: "150",
  });
  const [message, setMessage] = useState("");
  const [actives, setActives] = useState(activesInitial);

  async function basculerRecompenses() {
    const valeur = !actives;
    const { error } = await supabase
      .from("application_parametres")
      .upsert({ cle: "recompenses_actives", valeur }, { onConflict: "cle" });
    if (error) return setMessage("Changement impossible, réessayez.");
    setActives(valeur);
    setMessage(valeur ? "Récompenses activées : les clients voient leurs points et les cadeaux." : "Récompenses désactivées.");
  }

  const enAttente = demandes.filter((d) => d.statut === "en_attente");
  const traitees = demandes.filter((d) => d.statut !== "en_attente").slice(0, 15);

  async function traiter(d: Demande, statut: "remise" | "refusee") {
    const { error } = await supabase
      .from("application_recompenses_demandes")
      .update({ statut, traite_le: new Date().toISOString() })
      .eq("id", d.id);
    if (error) return setMessage("Mise à jour impossible, réessayez.");
    setDemandes((l) => l.map((x) => (x.id === d.id ? { ...x, statut } : x)));
    if (statut === "remise") {
      await supabase.from("application_messages").insert({
        client_id: d.client_id,
        expediteur: "admin",
        contenu: `🎁 ${d.titre} : c'est prévu avec votre prochaine livraison. Bravo pour vos efforts !`,
      });
    }
  }

  async function creerDefi() {
    const cible = parseInt(nouveauDefi.cible, 10);
    const points = parseInt(nouveauDefi.points, 10);
    if (!nouveauDefi.titre.trim() || !(cible >= 1 && cible <= 31) || !(points >= 0) || nouveauDefi.fin < nouveauDefi.debut) {
      return setMessage("Vérifiez le défi : titre, nombre de jours (1 à 31), dates et points.");
    }
    const { data, error } = await supabase
      .from("application_defis")
      .insert({
        titre: nouveauDefi.titre.trim(),
        type: nouveauDefi.type,
        cible,
        date_debut: nouveauDefi.debut,
        date_fin: nouveauDefi.fin,
        points,
      })
      .select("*")
      .single<Defi>();
    if (error || !data) return setMessage("Création impossible, réessayez.");
    setDefis((l) => [data, ...l]);
    setMessage("Défi lancé ✓ Il apparaît chez tous les clients.");
  }

  async function supprimerDefi(id: string) {
    const { error } = await supabase.from("application_defis").delete().eq("id", id);
    if (!error) setDefis((l) => l.filter((d) => d.id !== id));
  }

  async function enregistrerRecompense(r: Recompense) {
    const cout = Math.round(Number(r.cout));
    if (!r.titre.trim() || !(cout >= 1)) return setMessage("Chaque récompense a besoin d'un nom et d'un coût.");
    const { error } = await supabase
      .from("application_recompenses")
      .upsert({ id: r.id, emoji: r.emoji || "🎁", titre: r.titre.trim(), cout, actif: r.actif, ordre: r.ordre });
    setMessage(error ? "Enregistrement impossible, réessayez." : `« ${r.titre} » enregistrée ✓`);
  }

  function modifierRecompense(id: string, modif: Partial<Recompense>) {
    setCatalogue((l) => l.map((r) => (r.id === id ? { ...r, ...modif } : r)));
  }

  function ajouterRecompense() {
    setCatalogue((l) => [
      ...l,
      { id: `r${Date.now().toString(36)}`, emoji: "🎁", titre: "", cout: 500, actif: true, ordre: l.length + 1 },
    ]);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          Récompenses <em>&amp; défis</em>
        </h1>
        <p className="text-sm text-c2b-muted mt-2">
          Les clients gagnent des points en notant leurs repas et en tenant leurs objectifs, puis les échangent contre les
          récompenses ci-dessous. Chaque demande arrive aussi dans leurs Messages.
        </p>
      </div>

      <section className={`carte p-5 ${actives ? "border-c2b-gold/50" : ""}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-c2b-green">Points et cadeaux pour les clients</p>
            <p className="text-xs text-c2b-muted mt-0.5">
              {actives
                ? "Activés : les clients voient leurs points et peuvent débloquer les cadeaux."
                : "Désactivés : les clients ne voient ni points ni cadeaux. Les défis restent visibles, sans points."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={actives}
            aria-label="Activer les récompenses"
            onClick={basculerRecompenses}
            className={`relative h-8 w-14 flex-shrink-0 rounded-full transition ${actives ? "bg-c2b-green" : "bg-c2b-green/20"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${actives ? "left-7" : "left-1"}`}
            />
          </button>
        </div>
        <p className="text-[11px] text-c2b-muted mt-3">
          Garde-fou : une journée ne rapporte des points (et ne compte pour les défis) que si au moins 40 % de
          l&apos;objectif calories est noté. Remplir quelques aliments au hasard ne sert à rien.
        </p>
      </section>

      {message && (
        <button onClick={() => setMessage("")} className="w-full carte px-4 py-3 text-left text-sm font-semibold text-c2b-green">
          {message}
        </button>
      )}

      <section className="space-y-2.5">
        <h2 className="font-serif text-2xl text-c2b-green">
          À remettre {enAttente.length > 0 && <span className="text-c2b-gold">· {enAttente.length}</span>}
        </h2>
        {enAttente.length === 0 ? (
          <p className="carte p-5 text-sm text-c2b-muted">Aucune récompense à préparer pour le moment.</p>
        ) : (
          <ul className="carte divide-y divide-black/5 overflow-hidden">
            {enAttente.map((d) => (
              <li key={d.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-c2b-green">{d.client?.nom ?? "Client"}</p>
                  <p className="text-sm text-c2b-green">{d.titre}</p>
                  <p className="text-xs text-c2b-muted">
                    {d.cout} pts · demandé le {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <button onClick={() => traiter(d, "remise")} className="btn-primary px-4 py-2 text-sm">
                  Remise ✓
                </button>
                <button onClick={() => traiter(d, "refusee")} className="text-sm font-semibold text-c2b-muted">
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        )}
        {traitees.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-c2b-muted">Historique</summary>
            <ul className="mt-2 space-y-1 text-c2b-green">
              {traitees.map((d) => (
                <li key={d.id}>
                  {d.statut === "remise" ? "✓" : "✕"} {d.client?.nom} · {d.titre}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-2.5">
        <h2 className="font-serif text-2xl text-c2b-green">Défis</h2>
        <div className="carte p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted">Lancer un défi (pour tous les clients)</p>
          <input
            value={nouveauDefi.titre}
            onChange={(e) => setNouveauDefi({ ...nouveauDefi, titre: e.target.value })}
            placeholder="Titre du défi"
            className="champ"
          />
          <div className="flex flex-wrap gap-1.5">
            {TYPES_DEFI.map((t) => (
              <Pastille key={t.type} active={nouveauDefi.type === t.type} onClick={() => setNouveauDefi({ ...nouveauDefi, type: t.type })}>
                {t.libelle}
              </Pastille>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Champ label="Nombre de jours">
              <input
                inputMode="numeric"
                value={nouveauDefi.cible}
                onChange={(e) => setNouveauDefi({ ...nouveauDefi, cible: e.target.value.replace(/\D/g, "") })}
                className="champ"
              />
            </Champ>
            <Champ label="Points gagnés">
              <input
                inputMode="numeric"
                value={nouveauDefi.points}
                onChange={(e) => setNouveauDefi({ ...nouveauDefi, points: e.target.value.replace(/\D/g, "") })}
                className="champ"
              />
            </Champ>
            <Champ label="Du">
              <input
                type="date"
                value={nouveauDefi.debut}
                onChange={(e) => setNouveauDefi({ ...nouveauDefi, debut: e.target.value })}
                className="champ"
              />
            </Champ>
            <Champ label="Au">
              <input
                type="date"
                value={nouveauDefi.fin}
                onChange={(e) => setNouveauDefi({ ...nouveauDefi, fin: e.target.value })}
                className="champ"
              />
            </Champ>
          </div>
          <button onClick={creerDefi} className="btn-primary w-full py-3">
            Lancer le défi
          </button>
        </div>
        {defis.length > 0 && (
          <ul className="carte divide-y divide-black/5 overflow-hidden">
            {defis.map((d) => {
              const enCours = d.date_debut <= aujourdhui && d.date_fin >= aujourdhui;
              return (
                <li key={d.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-c2b-green">
                      {enCours && <span className="text-c2b-gold">● </span>}
                      {d.titre}
                    </p>
                    <p className="text-xs text-c2b-muted">
                      {dateCourte(d.date_debut)} → {dateCourte(d.date_fin)} · {d.cible} jours · +{d.points} pts
                    </p>
                  </div>
                  <button
                    onClick={() => supprimerDefi(d.id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-red-600/80 hover:bg-red-50"
                    aria-label={`Supprimer le défi ${d.titre}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-c2b-green">Catalogue</h2>
          <button onClick={ajouterRecompense} className="btn-secondary px-3.5 py-2 text-sm">
            <Plus size={15} /> Ajouter
          </button>
        </div>
        <ul className="space-y-2">
          {catalogue.map((r) => (
            <li key={r.id} className={`carte p-3 space-y-2 ${r.actif ? "" : "opacity-60"}`}>
              <div className="flex gap-2">
                <input
                  value={r.emoji}
                  onChange={(e) => modifierRecompense(r.id, { emoji: e.target.value.slice(0, 4) })}
                  className="champ w-14 px-2 text-center text-lg"
                  aria-label="Emoji"
                />
                <input
                  value={r.titre}
                  onChange={(e) => modifierRecompense(r.id, { titre: e.target.value })}
                  placeholder="Ex : Dessert offert"
                  className="champ flex-1"
                  aria-label="Nom de la récompense"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={String(r.cout)}
                  onChange={(e) => modifierRecompense(r.id, { cout: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  className="champ w-28"
                  aria-label="Coût en points"
                />
                <span className="text-sm text-c2b-muted">pts</span>
                <label className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-c2b-green">
                  <input
                    type="checkbox"
                    checked={r.actif}
                    onChange={(e) => modifierRecompense(r.id, { actif: e.target.checked })}
                    className="h-4 w-4 accent-c2b-green"
                  />
                  Visible
                </label>
                <button onClick={() => enregistrerRecompense(r)} className="btn-primary px-3.5 py-2 text-sm">
                  OK
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
