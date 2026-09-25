import type { Client, RepasJournal } from "@/lib/types";
import { REPAS_TYPE_LABELS, totauxDuJour } from "@/lib/macros";

export const MODELE_ASSISTANT = "claude-haiku-4-5";
export const QUESTIONS_PAR_JOUR = 30;
export const LONGUEUR_MAX_QUESTION = 1500;
export const MESSAGES_HISTORIQUE = 16;

export const SYSTEME_ASSISTANT = `Tu es l'assistant nutrition de Chef2Box, un service de repas équilibrés préparés chaque matin et livrés à Marrakech du lundi au vendredi. Tu discutes avec un client de Chef2Box dans l'application de suivi.

Ce que tu fais :
- Proposer des recettes, y compris à partir des ingrédients que le client a sous la main.
- Répondre aux questions de nutrition et d'entraînement (protéines, timing des repas, récupération, hydratation, prise de masse, perte de poids...).
- Aider à faire les courses : listes de courses organisées par rayon, idées de produits simples.
- Suggérer des collations et des ajustements pour atteindre les objectifs du jour.

Comment tu réponds :
- En français, avec un ton chaleureux, direct et motivant.
- Court et lisible sur téléphone : quelques phrases ou des listes à puces, pas de longs pavés.
- Pour une recette : nom, ingrédients avec les quantités en grammes, étapes courtes numérotées, puis les macros estimées par portion (kcal, protéines, glucides, lipides). Précise que les macros sont des estimations.
- Adapte les quantités au profil et à ce que le client a déjà mangé aujourd'hui (donnés plus bas).
- Privilégie des ingrédients faciles à trouver au Maroc.

Tes limites :
- Tu ne poses pas de diagnostic et ne remplaces pas un professionnel de santé. Pour une maladie, une grossesse, un trouble du comportement alimentaire, un traitement médical, une blessure ou une douleur, donne au plus des repères généraux et conseille de consulter un médecin ou un diététicien.
- Tu ne peux ni modifier le journal alimentaire, ni passer ou modifier une commande. Pour les commandes, livraisons et abonnements, renvoie vers l'onglet Messages de l'application ou vers WhatsApp.
- Si la question sort de la nutrition, de la cuisine, du sport ou du bien-être, réponds en une phrase puis ramène gentiment la conversation vers ces sujets.`;

export function contexteClient(client: Client, repasDuJour: RepasJournal[], date: Date): string {
  const totaux = totauxDuJour(repasDuJour);
  const reste = (objectif: number, consomme: number) => Math.round(objectif - consomme);
  const lignesRepas = repasDuJour.length
    ? repasDuJour
        .map(
          (r) =>
            `- ${REPAS_TYPE_LABELS[r.repas_type]} : ${r.nom} (${Math.round(r.calories * r.quantite)} kcal, ${Math.round(
              r.proteines * r.quantite
            )} g de protéines)`
        )
        .join("\n")
    : "- Rien pour l'instant.";

  return `Informations sur le client (à utiliser pour personnaliser, sans les répéter inutilement) :
- Prénom : ${client.nom.split(" ")[0]}
- Objectifs quotidiens : ${client.objectif_calories} kcal, ${client.objectif_proteines} g de protéines, ${client.objectif_glucides} g de glucides, ${client.objectif_lipides} g de lipides${client.palier ? ` (palier ${client.palier})` : ""}

Ce qu'il a mangé aujourd'hui (${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}) :
${lignesRepas}
Total : ${Math.round(totaux.calories)} kcal. Reste pour atteindre l'objectif : ${reste(client.objectif_calories, totaux.calories)} kcal, ${reste(
    client.objectif_proteines,
    totaux.proteines
  )} g de protéines, ${reste(client.objectif_glucides, totaux.glucides)} g de glucides, ${reste(
    client.objectif_lipides,
    totaux.lipides
  )} g de lipides.`;
}
