"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, EyeOff, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormulaireProfil, depuisProfil, versProfil, type ProfilSaisi } from "@/components/FormulaireProfil";
import { RappelSoir } from "@/components/RappelSoir";
import { calculerObjectifs, profilComplet } from "@/lib/objectifs";
import type { Client } from "@/lib/types";

type Macros = { calories: string; proteines: string; glucides: string; lipides: string };

const BORNES = {
  calories: [1200, 5000],
  proteines: [30, 350],
  glucides: [30, 700],
  lipides: [20, 250],
} as const;

export function ProfilClient({ client, email }: { client: Client; email: string }) {
  const router = useRouter();
  const supabase = createClient();

  // Objectifs : recalculés depuis le profil, ou ajustés à la main.
  const [profil, setProfil] = useState<ProfilSaisi>(depuisProfil(client.profil));
  const [manuel, setManuel] = useState(false);
  const [macros, setMacros] = useState<Macros>({
    calories: String(client.objectif_calories),
    proteines: String(client.objectif_proteines),
    glucides: String(client.objectif_glucides),
    lipides: String(client.objectif_lipides),
  });
  const [ouvert, setOuvert] = useState(false);
  const [msgObjectifs, setMsgObjectifs] = useState("");
  const [enCours, setEnCours] = useState(false);

  const [nom, setNom] = useState(client.nom);
  const [msgNom, setMsgNom] = useState("");
  const [nouvelEmail, setNouvelEmail] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [mdp, setMdp] = useState({ nouveau: "", confirmation: "", visible: false });
  const [msgMdp, setMsgMdp] = useState("");
  const [msgSuppression, setMsgSuppression] = useState("");
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  const profilCalcule = versProfil(profil);
  const calcul = profilComplet(profilCalcule) ? calculerObjectifs(profilCalcule) : null;

  function changerProfil(modif: Partial<ProfilSaisi>) {
    const suivant = { ...profil, ...modif };
    setProfil(suivant);
    const p = versProfil(suivant);
    if (!manuel && profilComplet(p)) {
      const o = calculerObjectifs(p);
      setMacros({
        calories: String(o.calories),
        proteines: String(o.proteines),
        glucides: String(o.glucides),
        lipides: String(o.lipides),
      });
    }
  }

  // seulNom : on garde les objectifs et le profil actuels, seul le nom change.
  async function enregistrerObjectifs(nomAEnregistrer: string, seulNom = false) {
    const p = versProfil(profil);
    const auto = !seulNom && !manuel && profilComplet(p) ? calculerObjectifs(p) : null;
    const valeurs = seulNom
      ? {
          calories: client.objectif_calories,
          proteines: client.objectif_proteines,
          glucides: client.objectif_glucides,
          lipides: client.objectif_lipides,
        }
      : auto
        ? { calories: auto.calories, proteines: auto.proteines, glucides: auto.glucides, lipides: auto.lipides }
        : {
            calories: parseInt(macros.calories, 10),
            proteines: parseInt(macros.proteines, 10),
            glucides: parseInt(macros.glucides, 10),
            lipides: parseInt(macros.lipides, 10),
          };
    for (const [cle, [min, max]] of Object.entries(BORNES)) {
      const v = valeurs[cle as keyof typeof valeurs];
      if (!(v >= min && v <= max)) {
        return `Valeur hors limites : ${cle} entre ${min} et ${max}.`;
      }
    }
    setEnCours(true);
    const { error } = await supabase.rpc("application_maj_mon_profil", {
      p_nom: nomAEnregistrer,
      p_profil: !seulNom && profilComplet(p) ? p : null,
      p_calories: valeurs.calories,
      p_proteines: valeurs.proteines,
      p_glucides: valeurs.glucides,
      p_lipides: valeurs.lipides,
      // Le palier de box suit le calcul ; un ajustement manuel ne le change pas.
      p_palier: auto ? auto.palier : null,
    });
    setEnCours(false);
    if (error) return "Enregistrement impossible, vérifiez les valeurs.";
    router.refresh();
    return null;
  }

  async function validerObjectifs() {
    const erreur = await enregistrerObjectifs(nom.trim() || client.nom);
    setMsgObjectifs(erreur ?? "Objectifs mis à jour ✓ Chef2Box est prévenu du changement.");
    if (!erreur) setOuvert(false);
  }

  async function validerNom() {
    if (!nom.trim()) return setMsgNom("Indiquez votre nom.");
    const erreur = await enregistrerObjectifs(nom.trim(), true);
    setMsgNom(erreur ?? "Nom enregistré ✓");
  }

  async function changerEmail() {
    const valeur = nouvelEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)) return setMsgEmail("Adresse email invalide.");
    setEnCours(true);
    const { error } = await supabase.auth.updateUser(
      { email: valeur },
      { emailRedirectTo: `${window.location.origin}/profil` }
    );
    setEnCours(false);
    setMsgEmail(
      error
        ? /already|registered|exists/i.test(error.message)
          ? "Cette adresse est déjà utilisée."
          : "Changement impossible, réessayez plus tard."
        : `Un lien de confirmation a été envoyé à ${valeur}. Le changement se fait après le clic sur ce lien.`
    );
  }

  async function changerMotDePasse() {
    if (mdp.nouveau.length < 8) return setMsgMdp("8 caractères minimum.");
    if (mdp.nouveau !== mdp.confirmation) return setMsgMdp("Les deux mots de passe ne sont pas identiques.");
    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: mdp.nouveau });
    setEnCours(false);
    if (error) {
      return setMsgMdp(
        /same|different/i.test(error.message)
          ? "Choisissez un mot de passe différent de l'actuel."
          : /weak|pwned|leaked/i.test(error.message)
            ? "Mot de passe trop facile à deviner, choisissez-en un autre."
            : "Changement impossible, réessayez."
      );
    }
    setMdp({ nouveau: "", confirmation: "", visible: false });
    setMsgMdp("Mot de passe changé ✓");
  }

  async function demanderSuppression() {
    const { error } = await supabase.from("application_messages").insert({
      client_id: client.id,
      expediteur: "client",
      contenu: "🗑️ Je souhaite supprimer mon compte et toutes mes données.",
    });
    setConfirmerSuppression(false);
    setMsgSuppression(
      error ? "Envoi impossible, réessayez." : "Demande envoyée à Chef2Box. Vous recevrez une confirmation dans Messages."
    );
  }

  async function deconnexion() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
      <div>
        <span className="lbl mb-2">Mon compte</span>
        <h1 className="titre text-[34px]">
          Mon <em>profil</em>
        </h1>
        <p className="text-sm text-c2b-muted mt-1">{email}</p>
      </div>

      <section className="carte p-5">
        <h2 className="font-serif text-xl text-c2b-green">Mes objectifs du jour</h2>
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Valeur valeur={client.objectif_calories} unite="kcal" />
          <Valeur valeur={client.objectif_proteines} unite="g prot." />
          <Valeur valeur={client.objectif_glucides} unite="g gluc." />
          <Valeur valeur={client.objectif_lipides} unite="g lip." />
        </div>
        {client.palier && <p className="text-xs text-c2b-muted mt-2">Palier de box : {client.palier}</p>}

        {!ouvert ? (
          <button onClick={() => setOuvert(true)} className="btn-secondary w-full py-3 mt-4 text-sm">
            Mettre à jour mon profil ou mes kcal
          </button>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-c2b-muted">
              Votre poids ou votre activité ont changé ? Modifiez-les : les objectifs sont recalculés comme dans le bilan
              Chef2Box.
            </p>
            <FormulaireProfil profil={profil} onChange={changerProfil} />

            <div className="rounded-2xl bg-c2b-cream p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted">Nouveaux objectifs</p>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-c2b-green">
                  <input
                    type="checkbox"
                    checked={manuel}
                    onChange={(e) => {
                      setManuel(e.target.checked);
                      if (!e.target.checked && calcul) {
                        setMacros({
                          calories: String(calcul.calories),
                          proteines: String(calcul.proteines),
                          glucides: String(calcul.glucides),
                          lipides: String(calcul.lipides),
                        });
                      }
                    }}
                    className="h-4 w-4 accent-c2b-green"
                  />
                  Ajuster moi-même
                </label>
              </div>
              {manuel ? (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {(
                    [
                      ["calories", "kcal"],
                      ["proteines", "P (g)"],
                      ["glucides", "G (g)"],
                      ["lipides", "L (g)"],
                    ] as const
                  ).map(([cle, label]) => (
                    <label key={cle} className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-c2b-muted mb-1">{label}</span>
                      <input
                        inputMode="numeric"
                        value={macros[cle]}
                        onChange={(e) => setMacros({ ...macros, [cle]: e.target.value.replace(/\D/g, "") })}
                        className="champ px-2.5"
                      />
                    </label>
                  ))}
                </div>
              ) : calcul ? (
                <p className="text-sm text-c2b-green mt-2">
                  <span className="text-xl font-semibold">{calcul.calories} kcal</span> · {calcul.proteines} g P ·{" "}
                  {calcul.glucides} g G · {calcul.lipides} g L · palier {calcul.palier}
                </p>
              ) : (
                <p className="text-sm text-c2b-muted mt-2">Complétez le profil ci-dessus pour recalculer.</p>
              )}
              {manuel && (
                <p className="text-[11px] text-c2b-muted mt-2">
                  Conseil : gardez l&apos;avis de Chef2Box avant de changer fortement vos kcal.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={validerObjectifs}
                disabled={enCours || (!manuel && !calcul)}
                className="btn-primary flex-1 py-3.5"
              >
                {enCours ? "Enregistrement..." : "Enregistrer mes objectifs"}
              </button>
              <button onClick={() => setOuvert(false)} className="btn-secondary px-4 py-3.5 text-sm">
                Annuler
              </button>
            </div>
          </div>
        )}
        {msgObjectifs && <p className="text-sm font-semibold text-c2b-green mt-3">{msgObjectifs}</p>}
        <Link href="/history" className="mt-3 flex items-center justify-between text-sm font-semibold text-c2b-green">
          🎯 Mon objectif de poids <ChevronRight size={16} className="text-c2b-muted" />
        </Link>
      </section>

      <section className="carte p-5 space-y-5">
        <h2 className="font-serif text-xl text-c2b-green">Mes informations</h2>

        <div>
          <Etiquette>Nom</Etiquette>
          <div className="flex gap-2">
            <input value={nom} onChange={(e) => setNom(e.target.value)} className="champ" maxLength={80} />
            <button onClick={validerNom} disabled={enCours || nom.trim() === client.nom} className="btn-primary px-4 text-sm">
              OK
            </button>
          </div>
          {msgNom && <p className="text-xs font-semibold text-c2b-green mt-1.5">{msgNom}</p>}
        </div>

        <div>
          <Etiquette>Email</Etiquette>
          <div className="flex gap-2">
            <input
              type="email"
              value={nouvelEmail}
              onChange={(e) => setNouvelEmail(e.target.value)}
              placeholder={email || "nouvelle@adresse.com"}
              autoComplete="email"
              className="champ"
            />
            <button onClick={changerEmail} disabled={enCours || !nouvelEmail} className="btn-primary px-4 text-sm">
              Changer
            </button>
          </div>
          {msgEmail && <p className="text-xs font-semibold text-c2b-green mt-1.5">{msgEmail}</p>}
        </div>

        <div>
          <Etiquette>Nouveau mot de passe</Etiquette>
          <div className="space-y-2">
            <div className="relative">
              <input
                type={mdp.visible ? "text" : "password"}
                autoComplete="new-password"
                value={mdp.nouveau}
                onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })}
                placeholder="8 caractères minimum"
                className="champ pr-12"
              />
              <button
                type="button"
                onClick={() => setMdp({ ...mdp, visible: !mdp.visible })}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-c2b-muted"
                aria-label={mdp.visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {mdp.visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <input
              type={mdp.visible ? "text" : "password"}
              autoComplete="new-password"
              value={mdp.confirmation}
              onChange={(e) => setMdp({ ...mdp, confirmation: e.target.value })}
              placeholder="Confirmer"
              className="champ"
            />
            <button
              onClick={changerMotDePasse}
              disabled={enCours || !mdp.nouveau}
              className="btn-secondary w-full py-3 text-sm"
            >
              Changer le mot de passe
            </button>
          </div>
          {msgMdp && <p className="text-xs font-semibold text-c2b-green mt-1.5">{msgMdp}</p>}
        </div>
      </section>

      <RappelSoir clientId={client.id} />

      <section className="carte overflow-hidden divide-y divide-black/5">
        <LienListe href="/confidentialite">Politique de confidentialité</LienListe>
        <LienListe href="/conditions">Conditions d&apos;utilisation</LienListe>
        <LienListe href="https://wa.me/212660831640" externe>
          Nous écrire sur WhatsApp
        </LienListe>
        <LienListe href="mailto:hello@chef2box.com" externe>
          hello@chef2box.com
        </LienListe>
      </section>

      <button onClick={deconnexion} className="btn-secondary w-full py-3.5">
        <LogOut size={17} /> Se déconnecter
      </button>

      <div className="text-center pb-4">
        {confirmerSuppression ? (
          <div className="carte p-4 text-sm text-c2b-green space-y-3">
            <p>Supprimer votre compte effacera votre journal, vos pesées et vos points. Envoyer la demande à Chef2Box ?</p>
            <div className="flex justify-center gap-2">
              <button onClick={demanderSuppression} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white">
                Oui, envoyer la demande
              </button>
              <button onClick={() => setConfirmerSuppression(false)} className="btn-secondary px-4 py-2 text-sm">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmerSuppression(true)} className="text-xs font-semibold text-red-600/70">
            Supprimer mon compte
          </button>
        )}
        {msgSuppression && <p className="text-xs font-semibold text-c2b-green mt-2">{msgSuppression}</p>}
      </div>
    </main>
  );
}

function Valeur({ valeur, unite }: { valeur: number; unite: string }) {
  return (
    <div className="rounded-2xl bg-c2b-cream py-2.5">
      <p className="text-lg font-semibold text-c2b-text leading-none">{valeur}</p>
      <p className="text-[10px] text-c2b-muted mt-1">{unite}</p>
    </div>
  );
}

function Etiquette({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">{children}</p>;
}

function LienListe({ href, externe, children }: { href: string; externe?: boolean; children: React.ReactNode }) {
  const classe = "flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-c2b-green hover:bg-c2b-cream/60";
  return externe ? (
    <a href={href} target="_blank" rel="noreferrer" className={classe}>
      {children} <ChevronRight size={16} className="text-c2b-muted" />
    </a>
  ) : (
    <Link href={href} className={classe}>
      {children} <ChevronRight size={16} className="text-c2b-muted" />
    </Link>
  );
}
