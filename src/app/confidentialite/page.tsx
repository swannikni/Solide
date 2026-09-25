import type { Metadata } from "next";
import { PageLegale } from "@/components/PageLegale";

export const metadata: Metadata = { title: "Confidentialité · Chef2Box" };

export default function ConfidentialitePage() {
  return (
    <PageLegale titre="Politique de confidentialité" majLe="septembre 2026">
      <p>
        Chef2Box (Marrakech) édite l&apos;application de suivi nutritionnel réservée à ses clients. Cette page explique
        quelles données nous utilisons, pourquoi, et quels sont vos droits.
      </p>

      <section className="space-y-2">
        <h2>Données collectées</h2>
        <ul>
          <li>Identité et contact : nom, email, numéro de téléphone.</li>
          <li>Profil : sexe, âge, taille, poids, niveau d&apos;activité, objectifs et habitudes alimentaires.</li>
          <li>Suivi : repas notés, photos de repas que vous ajoutez, pesées, points et récompenses.</li>
          <li>Échanges : messages avec Chef2Box et questions posées à l&apos;assistant.</li>
          <li>Notifications : l&apos;identifiant technique de votre téléphone si vous activez le rappel du soir.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2>Pourquoi</h2>
        <ul>
          <li>Calculer vos objectifs et préparer des box adaptées à votre palier.</li>
          <li>Vous permettre de suivre vos repas, votre poids et vos progrès.</li>
          <li>Répondre à vos messages et vous envoyer les rappels que vous avez choisis.</li>
        </ul>
        <p>
          Vos données de santé (poids, alimentation) ne servent qu&apos;à votre suivi. Elles ne sont jamais vendues ni
          utilisées pour de la publicité.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Qui y a accès</h2>
        <p>
          Vous, et l&apos;équipe Chef2Box pour votre suivi. Nos prestataires techniques les traitent uniquement pour faire
          fonctionner l&apos;appli : Supabase (base de données et comptes), Netlify (hébergement de l&apos;appli) et
          Anthropic (réponses de l&apos;assistant, seulement pour les questions que vous lui posez).
        </p>
      </section>

      <section className="space-y-2">
        <h2>Durée de conservation</h2>
        <p>
          Tant que votre compte est actif. Sur simple demande, votre compte et vos données sont supprimés (bouton
          « Supprimer mon compte » dans Mon profil).
        </p>
      </section>

      <section className="space-y-2">
        <h2>Vos droits</h2>
        <p>
          Conformément à la loi marocaine n° 09-08 sur la protection des données personnelles, vous pouvez accéder à vos
          données, les faire corriger ou supprimer, et vous opposer à leur traitement. Écrivez-nous à{" "}
          <a href="mailto:hello@chef2box.com" className="font-semibold text-c2b-green underline">
            hello@chef2box.com
          </a>{" "}
          ou depuis l&apos;onglet Messages.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Sécurité</h2>
        <p>
          Connexion chiffrée (HTTPS), mot de passe personnel, et chaque client ne peut voir que ses propres données. Les
          photos de repas sont privées.
        </p>
      </section>
    </PageLegale>
  );
}
