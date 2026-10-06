"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { MESSAGE_PIRATE, motDePassePirate } from "@/lib/mot-de-passe";

// Inscription libre : prénom, e-mail, mot de passe. Le questionnaire de
// profil (objectifs) suit juste après, sur /bienvenue/profil.
export default function InscriptionPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ nom: "", email: "", telephone: "", motDePasse: "", site: "" });
  const [accepte, setAccepte] = useState(false);
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const maj = (champ: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [champ]: e.target.value });
    setErreur(null);
  };

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (form.nom.trim().length < 2) return setErreur("Indiquez votre prénom.");
    if (form.motDePasse.length < 8) return setErreur("Mot de passe : 8 caractères minimum.");
    if (!accepte) return setErreur("Acceptez les conditions pour continuer.");
    setEnCours(true);
    if (await motDePassePirate(form.motDePasse)) {
      setEnCours(false);
      return setErreur(MESSAGE_PIRATE);
    }
    const res = await fetch("/api/inscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, accepte }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setEnCours(false);
      return setErreur(data?.erreur ?? "Création du compte impossible, réessayez.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.motDePasse });
    if (error) {
      setEnCours(false);
      return setErreur("Compte créé : connectez-vous avec votre e-mail et votre mot de passe.");
    }
    router.replace("/bienvenue/profil");
    router.refresh();
  }

  const etiquette = "block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2";

  return (
    <div className="min-h-screen flex items-center justify-center bg-c2b-cream px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="h-20 w-auto mb-6" />
          <h1 className="titre text-[38px]">
            Créer <em className="block">mon compte</em>
          </h1>
          <p className="text-sm text-c2b-muted mt-3">Gratuit. Ensuite, 1 minute de questions pour calculer vos objectifs.</p>
        </div>

        <form onSubmit={creer} className="carte p-6 space-y-4">
          <div>
            <label htmlFor="nom" className={etiquette}>
              Prénom
            </label>
            <input id="nom" required autoComplete="given-name" value={form.nom} onChange={maj("nom")} maxLength={80} className="champ" />
          </div>
          <div>
            <label htmlFor="email" className={etiquette}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={maj("email")}
              className="champ"
              placeholder="vous@exemple.com"
            />
          </div>
          <div>
            <label htmlFor="mdp" className={etiquette}>
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="mdp"
                type={visible ? "text" : "password"}
                required
                autoComplete="new-password"
                value={form.motDePasse}
                onChange={maj("motDePasse")}
                className="champ pr-12"
                placeholder="8 caractères minimum"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-c2b-muted"
                aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="tel" className={etiquette}>
              Téléphone <span className="normal-case tracking-normal font-normal">(facultatif, pour WhatsApp)</span>
            </label>
            <input id="tel" type="tel" autoComplete="tel" value={form.telephone} onChange={maj("telephone")} className="champ" placeholder="06…" />
          </div>
          {/* Champ piège pour les robots, invisible pour les personnes. */}
          <input
            type="text"
            name="site"
            tabIndex={-1}
            autoComplete="off"
            value={form.site}
            onChange={maj("site")}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            aria-hidden="true"
          />
          <label className="flex items-start gap-2.5 text-[13px] text-c2b-muted">
            <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-0.5 h-4 w-4 accent-c2b-green" />
            <span>
              J&apos;accepte les{" "}
              <Link href="/conditions" className="font-semibold text-c2b-green underline">
                conditions
              </Link>{" "}
              et la{" "}
              <Link href="/confidentialite" className="font-semibold text-c2b-green underline">
                politique de confidentialité
              </Link>
              .
            </span>
          </label>

          {erreur && <p className="text-sm font-semibold text-red-700">{erreur}</p>}

          <button type="submit" disabled={enCours} className="btn-primary w-full py-4">
            {enCours ? "Création..." : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-[13px] text-c2b-muted mt-5">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-semibold text-c2b-green underline-offset-2 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
