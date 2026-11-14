// Messages WhatsApp de Chef2Box (Envoi du menu et fiche d'une personne) :
// les mêmes modèles partout, modifiables dans « Envoi du menu ».
import type { Palier } from "@/lib/types";

// Quatre messages selon l'étape : client (1er message, puis relance du
// nouveau menu) et prospect (1er message avec le bilan, puis une seule
// relance ; ensuite plus d'envoi automatique, l'admin écrit lui-même).
export type Public = "client1" | "client2" | "prospect1" | "prospect2";
export const LIBELLES: Record<Public, string> = {
  client1: "Client · 1er message",
  client2: "Client · relance",
  prospect1: "Prospect · 1er message",
  prospect2: "Prospect · relance",
};
export const MODELES_DEFAUT: Record<Public, string> = {
  client1: `Bonjour {prenom} 👋

Voici ton lien personnel Chef2Box pour commander tes repas :
👉 {lien}

1. Coche ☀️ midi et/ou 🌙 soir pour les jours que tu veux.
2. Vérifie ton quartier : le prix s'affiche en bas.
3. Touche « Valider ma commande ».

Garde ce lien : chaque semaine le nouveau menu y est, et tu peux modifier jusqu'à la veille 20 h. Une question ? Réponds à ce message 🙂`,
  client2: `Bonjour {prenom} 👋

Le menu de la semaine du {semaine} est en ligne 🍽️ Tu le retrouves directement sur ton lien perso, avec les plats du midi et du soir.

Pour commander, c'est toujours au même endroit :
👉 {lien}

Coche tes repas, valide, et c'est réglé. Tu peux modifier jusqu'à la veille 20 h. Bonne semaine ! 💪`,
  prospect1: `Bonjour {prenom} 👋

Ici l'équipe Chef2Box : tu as fait ton bilan nutrition sur chef2box.com, merci !

📊 {bilan}

Ton espace personnel est prêt : ton bilan complet, le menu de la semaine du {semaine} et la commande en 1 minute.
👉 {lien}

🔒 C'est ta page à toi : pas de compte à créer, rien à payer en ligne (paiement à la livraison ou par virement), aucun engagement tant que tu ne valides pas une commande.

Une question ? Réponds simplement à ce message 🙂`,
  prospect2: `Bonjour {prenom} 👋

Le nouveau menu Chef2Box de la semaine du {semaine} est en ligne 🍽️

Ton espace t'attend (ton bilan est toujours dedans) :
👉 {lien}

Coche les repas qui te font envie, le prix s'affiche, sans engagement. Une question ? Réponds à ce message 🙂`,
};

export const KCAL_REPAS = { P1: "800 kcal", P2: "680-700 kcal", P3: "550-600 kcal" };
// « Ton besoin : 2 736 kcal/jour → ton repas Chef2Box : Palier 1 (800 kcal) »
export const apercuBilan = (b: { calories: number; palier: Palier | null } | null | undefined) =>
  b
    ? `Ton besoin : ${b.calories.toLocaleString("fr-FR")} kcal/jour${b.palier ? ` → ton repas Chef2Box : Palier ${b.palier.slice(1)} (${KCAL_REPAS[b.palier]})` : ""}`
    : "";

export const lire = (cle: string) => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
export const ecrire = (cle: string, valeur: string) => {
  try {
    localStorage.setItem(cle, valeur);
  } catch {}
};

// Modèles en place sur ce téléphone (modifiés dans « Envoi du menu »).
export function lireModeles(): Record<Public, string> {
  return {
    client1: lire("c2b-envoi-modele-client1") ?? MODELES_DEFAUT.client1,
    client2: lire("c2b-envoi-modele-client2") ?? MODELES_DEFAUT.client2,
    prospect1: lire("c2b-envoi-modele-prospect1") ?? MODELES_DEFAUT.prospect1,
    prospect2: lire("c2b-envoi-modele-prospect2") ?? MODELES_DEFAUT.prospect2,
  };
}

// Un prospect reçoit 2 messages au plus (1er + relance), ensuite c'est à l'admin d'écrire.
export const MESSAGES_PROSPECT = 2;

// Message prêt à envoyer : prénom, bilan (ligne retirée s'il n'y en a pas), semaine, menu, lien.
export function composerMessage(
  modele: string,
  v: { prenom: string; bilan?: { calories: number; palier: Palier | null } | null; semaine: string; menu: string; lien: string }
) {
  return modele
    .replace(/^.*\{bilan\}.*\n?\n?/m, (ligne) => (v.bilan ? ligne.replace("{bilan}", apercuBilan(v.bilan)) : ""))
    .replaceAll("{prenom}", v.prenom)
    .replaceAll("{semaine}", v.semaine)
    .replaceAll("{menu}", v.menu || "(menu bientôt en ligne)")
    .replaceAll("{lien}", v.lien);
}
