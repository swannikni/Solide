"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, MapPin, Send } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate } from "@/lib/dates";

// Un client à livrer ce jour-là (repas de l'appli « c:<id> » ou ajoutés
// à la main « n:<nom> »).
export interface ArretTournee {
  cle: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  lien: string | null;
  midi: number;
  soir: number;
  frais: number; // prix de la livraison ce jour (0 : offerte / retrait)
  reste: number | null; // reste à payer de la semaine (suggestion)
  retrait: boolean; // retrait sur place (Sweat On) : hors tournée
  modifiable: boolean; // adresse modifiable ici (fiche cuisine)
}

export interface SuiviTournee {
  cle: string;
  encaisse_par: "moi" | "livreur" | null;
  recuperer: number;
  frais_paye: boolean;
  ordre: number | null;
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const dh = (n: number) => `${Math.round(n)} DH`;
const chiffres = (t: string) => t.replace(/[^\d]/g, "").replace(/^0(?=[67])/, "212");
const jourLong = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function TourneeClient({
  date,
  lundi,
  arrets,
  suivisInitiaux,
  livreurInitial,
}: {
  date: string;
  lundi: string;
  arrets: ArretTournee[];
  suivisInitiaux: SuiviTournee[];
  livreurInitial: string;
}) {
  const supabase = createClient();
  const [suivis, setSuivis] = useState(() => new Map(suivisInitiaux.map((s) => [s.cle, s])));
  const [adresses, setAdresses] = useState(() => new Map(arrets.map((a) => [a.cle, { adresse: a.adresse ?? "", lien: a.lien ?? "" }])));
  const [edition, setEdition] = useState<string | null>(null);
  const [livreur, setLivreur] = useState(livreurInitial);
  const [message, setMessage] = useState("");
  const [copie, setCopie] = useState(false);

  const suivi = (cle: string): SuiviTournee => suivis.get(cle) ?? { cle, encaisse_par: null, recuperer: 0, frais_paye: false, ordre: null };
  // ordre : -1 = retiré de la tournée ce jour ; même nombre > 0 = même sac / même adresse.
  const tournee = arrets.filter((a) => !a.retrait && suivi(a.cle).ordre !== -1).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const retires = arrets.filter((a) => !a.retrait && suivi(a.cle).ordre === -1);
  const retraits = arrets.filter((a) => a.retrait);
  const groupes: ArretTournee[][] = [];
  for (const a of tournee) {
    const o = suivi(a.cle).ordre;
    const g = o && o > 0 ? groupes.find((x) => suivi(x[0].cle).ordre === o) : undefined;
    if (g) g.push(a);
    else groupes.push([a]);
  }
  const [regroupe, setRegroupe] = useState<string | null>(null);

  // Met b dans le même sac que a (même numéro de groupe).
  async function regrouper(a: ArretTournee, b: ArretTournee) {
    const existant = suivi(a.cle).ordre;
    const n = existant && existant > 0 ? existant : Math.max(0, ...[...suivis.values()].map((x) => x.ordre ?? 0)) + 1;
    setRegroupe(null);
    if (suivi(a.cle).ordre !== n) await enregistrer(a.cle, { ordre: n });
    await enregistrer(b.cle, { ordre: n });
  }
  const parLivreur = (a: ArretTournee) => suivi(a.cle).encaisse_par === "livreur" && suivi(a.cle).recuperer > 0;

  const totalLivreur = tournee.filter(parLivreur).reduce((t, a) => t + suivi(a.cle).recuperer, 0);
  const totalFrais = tournee.reduce((t, a) => t + a.frais, 0);
  const fraisPayes = tournee.filter((a) => suivi(a.cle).frais_paye).reduce((t, a) => t + a.frais, 0);
  const parMoi = tournee.filter((a) => suivi(a.cle).encaisse_par === "moi").length;

  async function enregistrer(cle: string, maj: Partial<SuiviTournee>) {
    const avant = suivi(cle);
    const apres = { ...avant, ...maj };
    setSuivis((m) => new Map(m).set(cle, apres));
    const { error } = await supabase
      .from("application_tournee")
      .upsert({
        date,
        cle,
        encaisse_par: apres.encaisse_par,
        recuperer: apres.recuperer,
        frais_paye: apres.frais_paye,
        ordre: apres.ordre,
        maj_le: new Date().toISOString(),
      });
    if (error) {
      setSuivis((m) => new Map(m).set(cle, avant));
      setMessage("Non enregistré, réessayez.");
    } else setMessage("");
  }

  // Nouvelle adresse / lien : sa fiche et ses repas à partir de ce jour.
  async function enregistrerAdresse(a: ArretTournee) {
    const v = adresses.get(a.cle) ?? { adresse: "", lien: "" };
    const adresse = v.adresse.trim().slice(0, 200) || null;
    const lien = v.lien.trim();
    const complement = /^https?:\/\/\S+$/i.test(lien) && lien.length <= 150 ? lien : null;
    if (lien && !complement) return setMessage("Lien non reconnu : collez un lien Google Maps (https://…).");
    const motif = a.nom.replace(/[%_\\]/g, "\\$&");
    const [r1, r2] = await Promise.all([
      supabase.from("application_personnes").upsert({ nom: a.nom, adresse, complement, updated_at: new Date().toISOString() }, { onConflict: "cle" }),
      supabase.from("application_cuisine_extras").update({ adresse, complement }).ilike("nom", motif).gte("date", date),
    ]);
    if (r1.error || r2.error) return setMessage("Adresse non enregistrée, réessayez.");
    setEdition(null);
    setMessage("");
  }

  async function enregistrerLivreur() {
    await supabase.from("application_tournee_reglages").upsert({ id: 1, livreur_telephone: livreur.trim().slice(0, 30) || null });
  }

  function texteLivreur() {
    if (!groupes.length) return `🚚 Livraisons du ${jourLong(date)}\n\nAucune livraison.`;
    const l = [`🚚 Livraisons du ${jourLong(date)} — ${groupes.length} arrêt${groupes.length > 1 ? "s" : ""}`, ""];
    groupes.forEach((g, i) => {
      const midi = g.reduce((t, a) => t + a.midi, 0);
      const soir = g.reduce((t, a) => t + a.soir, 0);
      const repas = [midi && `☀️ ${midi} midi`, soir && `🌙 ${soir} soir`].filter(Boolean).join(" + ");
      l.push(`${i + 1}. *${g.map((a) => a.nom).join(" + ")}* (${repas}${g.length > 1 ? ", même sac" : ""})`);
      const tels = g.map((a) => a.telephone).filter(Boolean);
      if (tels.length) l.push(`📞 ${tels.join(" / ")}`);
      const ref = g.find((a) => adresses.get(a.cle)?.adresse.trim() || adresses.get(a.cle)?.lien.trim()) ?? g[0];
      const v = adresses.get(ref.cle);
      if (v?.adresse.trim()) l.push(`📍 ${v.adresse.trim()}`);
      if (v?.lien.trim()) l.push(v.lien.trim());
      const recup = g.filter(parLivreur).reduce((t, a) => t + suivi(a.cle).recuperer, 0);
      if (recup) l.push(`💰 Récupérer : ${dh(recup)}`);
      l.push("");
    });
    if (totalLivreur) l.push(`*Total à récupérer : ${dh(totalLivreur)}*`);
    return l.join("\n").trim();
  }

  const lienWhatsApp = () => {
    const n = chiffres(livreur);
    return `https://wa.me/${n.length >= 9 ? n : ""}?text=${encodeURIComponent(texteLivreur())}`;
  };

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          <em>Tournée</em>
        </h1>
        <p className="text-sm text-c2b-muted first-letter:uppercase">{jourLong(date)}</p>
      </div>

      {/* Jours de la semaine */}
      <div className="grid grid-cols-5 gap-1.5">
        {JOURS.map((j, i) => {
          const d = decalerDate(lundi, i);
          return (
            <Link
              key={d}
              href={`/admin/tournee?date=${d}`}
              className={`rounded-xl py-2 text-center text-sm font-bold ${d === date ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"}`}
            >
              {j}
            </Link>
          );
        })}
      </div>
      <div className="flex justify-between text-xs font-semibold">
        <Link href={`/admin/tournee?date=${decalerDate(lundi, -7)}`} className="text-c2b-muted">
          ← Semaine d&apos;avant
        </Link>
        <Link href={`/admin/tournee?date=${decalerDate(lundi, 7)}`} className="text-c2b-muted">
          Semaine d&apos;après →
        </Link>
      </div>

      {/* Résumé */}
      <section className="carte grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="font-serif text-2xl text-c2b-green">{groupes.length}</p>
          <p className="text-[11px] text-c2b-muted">arrêts</p>
        </div>
        <div>
          <p className="font-serif text-2xl text-c2b-gold">{dh(totalLivreur)}</p>
          <p className="text-[11px] text-c2b-muted">le livreur récupère</p>
        </div>
        <div>
          <p className="font-serif text-2xl text-c2b-green">{dh(totalFrais)}</p>
          <p className="text-[11px] text-c2b-muted">de livraison</p>
        </div>
        <p className="col-span-3 border-t border-c2b-green/10 pt-2 text-xs text-c2b-muted">
          Livraisons payées {dh(fraisPayes)} · reste {dh(totalFrais - fraisPayes)} · {parMoi} client{parMoi > 1 ? "s" : ""} te paie{parMoi > 1 ? "nt" : ""} directement
        </p>
      </section>

      {/* Envoi au livreur */}
      <section className="space-y-2">
        <label className="block text-xs font-bold text-c2b-muted">
          Numéro WhatsApp du livreur
          <input
            value={livreur}
            onChange={(e) => setLivreur(e.target.value)}
            onBlur={enregistrerLivreur}
            inputMode="tel"
            placeholder="+212 6…"
            className="champ mt-1 py-2.5 text-sm font-normal"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <a href={lienWhatsApp()} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] py-3 text-sm font-bold text-white">
            <Send size={15} /> Envoyer au livreur
          </a>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(texteLivreur())
                .then(() => setCopie(true))
                .catch(() => window.prompt("Copiez le message :", texteLivreur()))
            }
            className="btn-secondary py-3 text-sm"
          >
            <Copy size={15} /> {copie ? "Copié ✓" : "Copier"}
          </button>
        </div>
        <details className="carte px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-c2b-green">Voir le message</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs text-c2b-text">{texteLivreur()}</pre>
        </details>
      </section>

      {message && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{message}</p>}

      {/* Clients à livrer */}
      {tournee.length === 0 ? (
        <p className="carte p-5 text-center text-sm text-c2b-muted">Personne à livrer ce jour-là dans le planning de la cuisine.</p>
      ) : (
        <ul className="space-y-2.5">
          {groupes.map((g, gi) => (
            <li key={g[0].cle} className={g.length > 1 ? "space-y-2 rounded-2xl border-2 border-dashed border-c2b-gold/60 p-2" : ""}>
              {g.length > 1 && (
                <p className="px-2 pt-1 text-xs font-bold text-c2b-gold">
                  {gi + 1}. Même sac / même adresse : {g.map((a) => a.nom).join(" + ")}
                </p>
              )}
              <ul className="space-y-2">
          {g.map((a) => {
            const s = suivi(a.cle);
            const v = adresses.get(a.cle) ?? { adresse: "", lien: "" };
            return (
              <li key={a.cle} className={`carte space-y-2.5 p-4 ${s.frais_paye ? "ring-1 ring-emerald-500" : ""}`}>
                <div className="flex items-start gap-2">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-c2b-gold/20 text-xs font-bold text-c2b-gold">{gi + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-c2b-green">{a.nom}</p>
                    <p className="text-xs text-c2b-muted">
                      {[a.midi && `☀️ ${a.midi} midi`, a.soir && `🌙 ${a.soir} soir`].filter(Boolean).join(" · ")}
                      {a.telephone && <span className="select-all"> · 📞 {a.telephone}</span>}
                    </p>
                  </div>
                </div>

                {/* Adresse et lien */}
                {edition === a.cle ? (
                  <div className="space-y-2">
                    <textarea
                      value={v.adresse}
                      onChange={(e) => setAdresses((m) => new Map(m).set(a.cle, { ...v, adresse: e.target.value }))}
                      placeholder="Collez l'adresse (résidence, étage, appartement…)"
                      maxLength={200}
                      rows={3}
                      className="champ py-2 text-sm"
                    />
                    <input
                      value={v.lien}
                      onChange={(e) => setAdresses((m) => new Map(m).set(a.cle, { ...v, lien: e.target.value }))}
                      placeholder="Lien Google Maps (https://…)"
                      inputMode="url"
                      className="champ py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setEdition(null)} className="btn-secondary py-2 text-xs">
                        Annuler
                      </button>
                      <button onClick={() => enregistrerAdresse(a)} className="btn-primary py-2 text-xs">
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {v.adresse ? <p className="whitespace-pre-wrap text-sm">{v.adresse}</p> : <p className="text-xs text-c2b-muted">Pas d&apos;adresse</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      {v.lien && (
                        <a href={v.lien} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-bold text-c2b-gold">
                          <MapPin size={14} /> Ouvrir la position
                        </a>
                      )}
                      {a.modifiable && (
                        <button onClick={() => setEdition(a.cle)} className="text-xs font-bold text-c2b-green underline">
                          Changer l&apos;adresse / le lien
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Qui encaisse */}
                <div className="space-y-1.5 rounded-xl bg-c2b-cream p-2.5">
                  <p className="text-xs font-bold text-c2b-muted">Qui encaisse ?</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => enregistrer(a.cle, { encaisse_par: s.encaisse_par === "moi" ? null : "moi" })}
                      className={`rounded-full py-2 text-xs font-bold ${s.encaisse_par === "moi" ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"}`}
                    >
                      C&apos;est moi (virement…)
                    </button>
                    <button
                      onClick={() =>
                        enregistrer(a.cle, {
                          encaisse_par: s.encaisse_par === "livreur" ? null : "livreur",
                          recuperer: s.encaisse_par === "livreur" ? s.recuperer : s.recuperer || a.reste || 0,
                        })
                      }
                      className={`rounded-full py-2 text-xs font-bold ${s.encaisse_par === "livreur" ? "bg-c2b-gold text-c2b-green" : "bg-white border border-c2b-green/15 text-c2b-green"}`}
                    >
                      Le livreur récupère
                    </button>
                  </div>
                  {s.encaisse_par === "livreur" && (
                    <label className="flex items-center gap-2 text-sm font-semibold text-c2b-green">
                      Montant
                      <input
                        key={`${a.cle}-${s.recuperer}`}
                        defaultValue={s.recuperer || ""}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const n = Math.max(0, Math.min(100000, Math.round(Number(e.target.value.replace(/[^\d]/g, "")) || 0)));
                          if (n !== s.recuperer) enregistrer(a.cle, { recuperer: n });
                        }}
                        className="champ w-28 py-1.5 text-sm"
                      />
                      DH
                    </label>
                  )}
                  {a.reste != null && a.reste > 0 && (
                    <p className="text-[11px] text-c2b-muted">Reste à payer de sa semaine : {dh(a.reste)}</p>
                  )}
                </div>

                {/* Prix de la livraison */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-c2b-green">
                    Livraison <strong>{a.frais ? dh(a.frais) : "offerte"}</strong>
                  </span>
                  {a.frais > 0 && (
                    <button
                      onClick={() => enregistrer(a.cle, { frais_paye: !s.frais_paye })}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${s.frais_paye ? "bg-emerald-600 text-white" : "border border-red-200 bg-white text-red-600"}`}
                    >
                      {s.frais_paye ? "Payée ✓" : "Pas encore payée"}
                    </button>
                  )}
                </div>

                {/* Même sac / retirer de la tournée */}
                {regroupe === a.cle ? (
                  <div className="space-y-1.5 rounded-xl bg-c2b-cream p-2.5">
                    <p className="text-xs font-bold text-c2b-muted">Même sac / même adresse que :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tournee
                        .filter((x) => x.cle !== a.cle)
                        .map((x) => (
                          <button
                            key={x.cle}
                            onClick={() => regrouper(x, a)}
                            className="rounded-full border border-c2b-green/15 bg-white px-3 py-1.5 text-xs font-bold text-c2b-green"
                          >
                            {x.nom}
                          </button>
                        ))}
                      <button onClick={() => setRegroupe(null)} className="px-2 text-xs font-semibold text-c2b-muted">
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-c2b-green/10 pt-2 text-xs font-bold">
                    {g.length > 1 ? (
                      <button onClick={() => enregistrer(a.cle, { ordre: null })} className="text-c2b-green underline">
                        Séparer (autre arrêt)
                      </button>
                    ) : (
                      tournee.length > 1 && (
                        <button onClick={() => setRegroupe(a.cle)} className="text-c2b-green underline">
                          Même sac / adresse que…
                        </button>
                      )
                    )}
                    <button onClick={() => enregistrer(a.cle, { ordre: -1 })} className="text-red-600 underline">
                      Retirer de la tournée
                    </button>
                  </div>
                )}
              </li>
            );
          })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {retires.length > 0 && (
        <section className="carte space-y-1.5 p-4 text-sm">
          <p className="font-bold text-c2b-green">Retirés de la tournée ce jour</p>
          {retires.map((a) => (
            <div key={a.cle} className="flex items-center justify-between gap-2">
              <span className="text-c2b-muted">{a.nom}</span>
              <button onClick={() => enregistrer(a.cle, { ordre: null })} className="text-xs font-bold text-c2b-green underline">
                Remettre
              </button>
            </div>
          ))}
        </section>
      )}

      {retraits.length > 0 && (
        <section className="carte p-4 text-sm">
          <p className="font-bold text-c2b-green">Retrait sur place (hors tournée)</p>
          <p className="text-c2b-muted">
            {retraits.map((a) => `${a.nom} (${[a.midi && `☀️ ${a.midi}`, a.soir && `🌙 ${a.soir}`].filter(Boolean).join(" ")})`).join(" · ")}
          </p>
        </section>
      )}
    </main>
  );
}
