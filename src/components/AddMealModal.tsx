"use client";

import { useEffect, useState } from "react";
import { X, QrCode, Barcode, PenLine, Camera, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Scanner } from "@/components/Scanner";
import { chercherProduitParCodeBarres, rechercherProduitsParNom } from "@/lib/openfoodfacts";
import { ALIMENTS_POPULAIRES } from "@/lib/aliments-populaires";
import { REPAS_TYPE_LABELS } from "@/lib/macros";
import type { Aliment, RepasType, SourceRepas } from "@/lib/types";

type Etape = "choix" | "scan_chef2box" | "scan_barcode" | "recherche_code" | "manuel" | "confirmation" | "erreur";

type ProduitMarque = Awaited<ReturnType<typeof rechercherProduitsParNom>>[number];

const GRAMMES_RAPIDES = [50, 100, 150, 200, 250];

const UNITES_GRAMMES = /^(kg|g|gr|grs|gramme|grammes)$/i;
const NOMBRE_AVEC_UNITE = /^(\d+(?:[.,]\d+)?)(kg|g|gr|grs|gramme|grammes)?$/i;

// "compote 45gr", "45 g compote", "riz 150" -> recherche sans le poids + grammes.
// Un nombre sans unité n'est un poids qu'en fin de recherche ("pain 7 céréales"
// garde son 7).
function analyserRecherche(texte: string): { termes: string; grammes: number | null } {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  const versGrammes = (nombre: string, unite?: string) => {
    const valeur = Number(nombre.replace(",", "."));
    return unite?.toLowerCase() === "kg" ? valeur * 1000 : valeur;
  };

  for (let i = 0; i < mots.length; i++) {
    const m = mots[i].match(NOMBRE_AVEC_UNITE);
    if (!m) continue;
    const uniteSeparee = !m[2] && mots[i + 1] && UNITES_GRAMMES.test(mots[i + 1]);
    if (m[2] || uniteSeparee) {
      const grammes = versGrammes(m[1], m[2] ?? mots[i + 1]);
      const termes = mots.filter((_, j) => j !== i && !(uniteSeparee && j === i + 1));
      return { termes: termes.join(" "), grammes: grammes > 0 ? grammes : null };
    }
  }

  const dernier = mots.length > 1 ? mots[mots.length - 1].match(/^\d+(?:[.,]\d+)?$/) : null;
  if (dernier) {
    const grammes = versGrammes(dernier[0]);
    return { termes: mots.slice(0, -1).join(" "), grammes: grammes > 0 ? grammes : null };
  }
  return { termes: mots.join(" "), grammes: null };
}

interface Trouve {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  source: SourceRepas;
  plat_id?: string;
  quantiteParDefaut: number;
  paGrammes?: boolean; // true si quantite = grammes / 100 (produit du commerce)
}

export function AddMealModal({
  clientId,
  repasTypeParDefaut = "dejeuner",
  prefillTrouve,
  commandeId,
  onClose,
  onAjoute,
}: {
  clientId: string;
  repasTypeParDefaut?: RepasType;
  prefillTrouve?: Trouve;
  commandeId?: string;
  onClose: () => void;
  onAjoute: () => void;
}) {
  const supabase = createClient();
  const [etape, setEtape] = useState<Etape>(prefillTrouve ? "confirmation" : "choix");
  const [messageErreur, setMessageErreur] = useState("");
  const [trouve, setTrouve] = useState<Trouve | null>(prefillTrouve ?? null);
  const [repasType, setRepasType] = useState<RepasType>(repasTypeParDefaut);
  const [quantite, setQuantite] = useState(1);
  const [grammes, setGrammes] = useState(100);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [rechercheManuelle, setRechercheManuelle] = useState("");
  const [resultatsAliments, setResultatsAliments] = useState<Aliment[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [resultatsMarques, setResultatsMarques] = useState<ProduitMarque[] | null>(null);
  const [rechercheMarquesEnCours, setRechercheMarquesEnCours] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  const { termes: termesRecherche, grammes: grammesSaisis } = analyserRecherche(rechercheManuelle);
  const rechercheActive = termesRecherche.length >= 2;

  useEffect(() => {
    setResultatsMarques(null);
    if (!rechercheActive) {
      setResultatsAliments([]);
      return;
    }
    let annule = false;
    setRechercheEnCours(true);
    const minuteur = setTimeout(async () => {
      const { data } = await supabase.rpc("application_rechercher_aliments", {
        q: termesRecherche,
        limite: 30,
      });
      if (!annule) {
        setResultatsAliments((data as Aliment[] | null) ?? []);
        setRechercheEnCours(false);
      }
    }, 300);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termesRecherche]);

  async function chercherMarques() {
    setRechercheMarquesEnCours(true);
    try {
      setResultatsMarques(await rechercherProduitsParNom(termesRecherche));
    } catch {
      setResultatsMarques([]);
    } finally {
      setRechercheMarquesEnCours(false);
    }
  }

  function choisirPour100g(
    nom: string,
    valeurs: { calories: number; proteines: number; glucides: number; lipides: number },
    source: SourceRepas,
    grammesPreremplis: number | null = null
  ) {
    setTrouve({
      nom,
      calories: Math.round(valeurs.calories),
      proteines: valeurs.proteines,
      glucides: valeurs.glucides,
      lipides: valeurs.lipides,
      source,
      quantiteParDefaut: 1,
      paGrammes: true,
    });
    setGrammes(grammesPreremplis ?? 100);
    setEtape("confirmation");
  }

  // Saisie 100% manuelle (aliment absent de la base)
  const [nomLibre, setNomLibre] = useState("");
  const [caloriesLibre, setCaloriesLibre] = useState("");
  const [proteinesLibre, setProteinesLibre] = useState("");
  const [glucidesLibre, setGlucidesLibre] = useState("");
  const [lipidesLibre, setLipidesLibre] = useState("");

  async function onScanChef2Box(qrCode: string) {
    const { data, error } = await supabase
      .from("application_plats")
      .select("*")
      .eq("qr_code", qrCode)
      .eq("actif", true)
      .maybeSingle();

    if (error || !data) {
      setMessageErreur("Ce code n'est reconnu dans aucun plat Chef2Box.");
      setEtape("erreur");
      return;
    }

    setTrouve({
      nom: data.nom,
      calories: data.calories,
      proteines: data.proteines,
      glucides: data.glucides,
      lipides: data.lipides,
      source: "chef2box",
      plat_id: data.id,
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  async function onScanBarcode(code: string) {
    setEtape("recherche_code");
    let produit = null;
    try {
      produit = await chercherProduitParCodeBarres(code);
    } catch {
      setMessageErreur("Impossible de joindre la base produits. Vérifiez votre connexion et réessayez.");
      setEtape("erreur");
      return;
    }
    if (!produit || produit.calories === 0) {
      setMessageErreur(
        `Produit ${code} introuvable ou sans valeurs nutritionnelles. Recherchez-le par son nom dans la saisie manuelle.`
      );
      setEtape("erreur");
      return;
    }

    choisirPour100g(produit.nom, produit, "code_barres");
  }

  function choisirAlimentPopulaire(nom: string, cal: number, prot: number, gluc: number, lip: number) {
    setTrouve({
      nom,
      calories: cal,
      proteines: prot,
      glucides: gluc,
      lipides: lip,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function validerSaisieLibre() {
    if (!nomLibre || !caloriesLibre) return;
    setTrouve({
      nom: nomLibre,
      calories: Number(caloriesLibre) || 0,
      proteines: Number(proteinesLibre) || 0,
      glucides: Number(glucidesLibre) || 0,
      lipides: Number(lipidesLibre) || 0,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function surChangementPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPhoto(fichier);
    setPreviewPhoto(URL.createObjectURL(fichier));
  }

  async function enregistrerRepas() {
    if (!trouve) return;
    setEnregistrement(true);

    let photoUrl: string | null = null;
    if (photo) {
      const chemin = `${clientId}/${Date.now()}-${photo.name}`;
      const { data, error } = await supabase.storage.from("application-repas-photos").upload(chemin, photo);
      if (!error && data) {
        photoUrl = supabase.storage.from("application-repas-photos").getPublicUrl(data.path).data.publicUrl;
      }
    }

    const quantiteFinale = trouve.paGrammes ? grammes / 100 : quantite;

    const { error } = await supabase.from("application_repas_journal").insert({
      client_id: clientId,
      repas_type: repasType,
      source: trouve.source,
      nom: trouve.nom,
      quantite: quantiteFinale,
      calories: trouve.calories,
      proteines: trouve.proteines,
      glucides: trouve.glucides,
      lipides: trouve.lipides,
      photo_url: photoUrl,
      plat_id: trouve.plat_id ?? null,
      commande_id: commandeId ?? null,
      cree_par: "client",
    });

    setEnregistrement(false);
    if (!error) {
      onAjoute();
      onClose();
    } else {
      setMessageErreur("Erreur lors de l'enregistrement, réessayez.");
      setEtape("erreur");
    }
  }

  const facteur = trouve ? (trouve.paGrammes ? grammes / 100 : quantite) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-end md:items-center justify-center">
      <div className="bg-c2b-cream w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-c2b-green/10 sticky top-0 bg-c2b-cream">
          <h2 className="font-medium text-c2b-green">Ajouter un repas</h2>
          <button onClick={onClose} className="text-c2b-green/60">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {etape === "choix" && (
            <div className="space-y-3">
              <button
                onClick={() => setEtape("scan_chef2box")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-gold/40 p-4 text-left"
              >
                <QrCode className="text-c2b-gold" />
                <div>
                  <p className="font-medium text-c2b-green">Scanner une étiquette Chef2Box</p>
                  <p className="text-xs text-c2b-green/60">Macros exactes, ajout instantané</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("scan_barcode")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-green/10 p-4 text-left"
              >
                <Barcode className="text-c2b-green" />
                <div>
                  <p className="font-medium text-c2b-green">Scanner un code-barres</p>
                  <p className="text-xs text-c2b-green/60">Produit du commerce</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("manuel")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-green/10 p-4 text-left"
              >
                <PenLine className="text-c2b-green" />
                <div>
                  <p className="font-medium text-c2b-green">Saisie manuelle</p>
                  <p className="text-xs text-c2b-green/60">Recherche parmi des milliers d'aliments</p>
                </div>
              </button>
            </div>
          )}

          {etape === "scan_chef2box" && (
            <Scanner mode="qr" onResult={onScanChef2Box} onClose={() => setEtape("choix")} />
          )}
          {etape === "scan_barcode" && (
            <Scanner mode="code_barres" onResult={onScanBarcode} onClose={() => setEtape("choix")} />
          )}

          {etape === "recherche_code" && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-c2b-green/70">
              <Loader2 className="animate-spin" />
              Recherche du produit...
            </div>
          )}

          {etape === "erreur" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-700">{messageErreur}</p>
              <button
                onClick={() => setEtape("manuel")}
                className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2 text-sm"
              >
                Chercher par nom
              </button>
              <button
                onClick={() => setEtape("choix")}
                className="w-full rounded-lg border border-c2b-green/20 py-2 text-sm text-c2b-green"
              >
                Retour
              </button>
            </div>
          )}

          {etape === "manuel" && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-c2b-green/40" />
                <input
                  value={rechercheManuelle}
                  onChange={(e) => setRechercheManuelle(e.target.value)}
                  placeholder="Ex : compote 45g, riz 150g, poulet rôti..."
                  autoFocus
                  className="w-full rounded-lg border border-c2b-green/20 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              {grammesSaisis !== null ? (
                <p className="text-xs text-c2b-green/70 -mt-2">
                  Quantité détectée : <span className="font-medium text-c2b-green">{grammesSaisis} g</span>
                </p>
              ) : (
                <p className="text-[11px] text-c2b-green/50 -mt-2">
                  Astuce : ajoutez le poids à la recherche (« compote 45g ») pour le pré-remplir.
                </p>
              )}

              {!rechercheActive && (
                <>
                  <p className="text-xs uppercase tracking-wide text-c2b-green/50">Ajout rapide</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALIMENTS_POPULAIRES.map((a) => (
                      <button
                        key={a.nom}
                        onClick={() => choisirAlimentPopulaire(a.nom, a.calories, a.proteines, a.glucides, a.lipides)}
                        className="bg-white rounded-lg border border-c2b-green/10 p-2.5 text-left"
                      >
                        <p className="text-sm font-medium text-c2b-green">{a.nom}</p>
                        <p className="text-[11px] text-c2b-green/50">
                          {a.portion} · {a.calories} kcal
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {rechercheActive && (
                <div className="space-y-2">
                  {rechercheEnCours ? (
                    <div className="flex justify-center py-4 text-c2b-green/50">
                      <Loader2 className="animate-spin" size={20} />
                    </div>
                  ) : resultatsAliments.length === 0 ? (
                    <p className="text-sm text-c2b-green/50 italic text-center py-2">
                      Aucun aliment générique trouvé.
                    </p>
                  ) : (
                    <ul className="bg-white rounded-lg border border-c2b-green/10 divide-y divide-c2b-green/10">
                      {resultatsAliments.map((a) => (
                        <li key={a.id}>
                          <button
                            onClick={() => choisirPour100g(a.nom, a, "manuel", grammesSaisis)}
                            className="w-full text-left px-3 py-2.5"
                          >
                            <p className="text-sm text-c2b-green">{a.nom}</p>
                            <p className="text-[11px] text-c2b-green/50">
                              100 g · {Math.round(a.calories)} kcal · {a.proteines}g P · {a.glucides}g G ·{" "}
                              {a.lipides}g L
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {resultatsMarques === null ? (
                    <button
                      onClick={chercherMarques}
                      disabled={rechercheMarquesEnCours}
                      className="w-full rounded-lg border border-c2b-green/20 py-2 text-sm text-c2b-green flex items-center justify-center gap-2"
                    >
                      {rechercheMarquesEnCours && <Loader2 className="animate-spin" size={16} />}
                      Chercher aussi dans les produits de marque
                    </button>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-c2b-green/50 pt-2">Produits de marque</p>
                      {resultatsMarques.length === 0 ? (
                        <p className="text-sm text-c2b-green/50 italic text-center py-2">Aucun produit trouvé.</p>
                      ) : (
                        <ul className="bg-white rounded-lg border border-c2b-green/10 divide-y divide-c2b-green/10">
                          {resultatsMarques.map((p, i) => (
                            <li key={`${p.nom}-${i}`}>
                              <button
                                onClick={() =>
                                  choisirPour100g(p.marque ? `${p.nom} (${p.marque})` : p.nom, p, "manuel", grammesSaisis)
                                }
                                className="w-full text-left px-3 py-2.5"
                              >
                                <p className="text-sm text-c2b-green">
                                  {p.nom}
                                  {p.marque && <span className="text-c2b-green/50"> · {p.marque}</span>}
                                </p>
                                <p className="text-[11px] text-c2b-green/50">
                                  100 g · {p.calories} kcal · {p.proteines}g P · {p.glucides}g G · {p.lipides}g L
                                </p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              <details className="bg-white rounded-lg border border-c2b-green/10 p-3">
                <summary className="text-sm font-medium text-c2b-green cursor-pointer">
                  Aliment introuvable ? Saisir manuellement
                </summary>
                <div className="mt-3 space-y-2">
                  <input
                    value={nomLibre}
                    onChange={(e) => setNomLibre(e.target.value)}
                    placeholder="Nom de l'aliment"
                    className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      value={caloriesLibre}
                      onChange={(e) => setCaloriesLibre(e.target.value)}
                      placeholder="kcal"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={proteinesLibre}
                      onChange={(e) => setProteinesLibre(e.target.value)}
                      placeholder="P (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={glucidesLibre}
                      onChange={(e) => setGlucidesLibre(e.target.value)}
                      placeholder="G (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={lipidesLibre}
                      onChange={(e) => setLipidesLibre(e.target.value)}
                      placeholder="L (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                  </div>
                  <button
                    onClick={validerSaisieLibre}
                    className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2 text-sm"
                  >
                    Continuer
                  </button>
                </div>
              </details>
            </div>
          )}

          {etape === "confirmation" && trouve && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-c2b-green/10 p-3">
                <p className="font-medium text-c2b-green">{trouve.nom}</p>
                <p className="text-xs text-c2b-green/60">
                  {trouve.calories} kcal · {trouve.proteines}g P · {trouve.glucides}g G · {trouve.lipides}g L
                  {trouve.paGrammes ? " (pour 100g)" : " (par portion)"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">Repas</label>
                <select
                  value={repasType}
                  onChange={(e) => setRepasType(e.target.value as RepasType)}
                  className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                >
                  {Object.entries(REPAS_TYPE_LABELS).map(([valeur, label]) => (
                    <option key={valeur} value={valeur}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">
                  {trouve.paGrammes ? "Quantité (grammes)" : "Quantité (portions)"}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={trouve.paGrammes ? 1 : 0.5}
                  onFocus={(e) => e.target.select()}
                  value={trouve.paGrammes ? grammes : quantite}
                  onChange={(e) =>
                    trouve.paGrammes
                      ? setGrammes(Number(e.target.value))
                      : setQuantite(Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                />
                {trouve.paGrammes && (
                  <div className="flex gap-1.5 mt-2">
                    {GRAMMES_RAPIDES.map((g) => (
                      <button
                        key={g}
                        onClick={() => setGrammes(g)}
                        className={`flex-1 rounded-md py-1 text-xs ${
                          grammes === g ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                        }`}
                      >
                        {g} g
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-c2b-green mt-2 font-medium">
                  = {Math.round(trouve.calories * facteur)} kcal · {Math.round(trouve.proteines * facteur)}g P ·{" "}
                  {Math.round(trouve.glucides * facteur)}g G · {Math.round(trouve.lipides * facteur)}g L
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">
                  Photo du repas (optionnel)
                </label>
                <label className="flex items-center gap-2 justify-center border border-dashed border-c2b-green/30 rounded-lg py-3 cursor-pointer text-sm text-c2b-green/70">
                  <Camera size={18} />
                  {previewPhoto ? "Changer la photo" : "Prendre une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={surChangementPhoto}
                  />
                </label>
                {previewPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewPhoto} alt="Aperçu" className="mt-2 w-full h-32 object-cover rounded-lg" />
                )}
              </div>

              <button
                onClick={enregistrerRepas}
                disabled={enregistrement}
                className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2.5 font-medium disabled:opacity-60"
              >
                {enregistrement ? "Enregistrement..." : "Ajouter au journal"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
