import type { Metadata } from "next";
import { PageLegale } from "@/components/PageLegale";

export const metadata: Metadata = { title: "Conditions d'utilisation · Chef2Box" };

export default function ConditionsPage() {
  return (
    <PageLegale titre="Conditions d'utilisation" majLe="septembre 2026">
      <section className="space-y-2">
        <h2>L&apos;application</h2>
        <p>
          L&apos;appli Chef2Box est réservée aux clients Chef2Box. Elle sert à suivre vos repas, vos objectifs et vos
          progrès, et à échanger avec l&apos;équipe. Votre compte est personnel : gardez votre mot de passe pour vous.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Pas un avis médical</h2>
        <p>
          Les objectifs, calculs et réponses de l&apos;assistant sont des repères nutritionnels généraux. Ils ne
          remplacent pas l&apos;avis d&apos;un médecin ou d&apos;un diététicien, en particulier en cas de grossesse, de
          maladie, de traitement ou de trouble du comportement alimentaire.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Valeurs nutritionnelles</h2>
        <p>
          Les valeurs des aliments viennent de bases publiques (table CIQUAL, Open Food Facts) et des enseignes pour les
          restaurants. Elles peuvent varier selon les recettes et les portions réelles.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Points et récompenses</h2>
        <p>
          Lorsque Chef2Box propose des points et des récompenses, ils récompensent votre régularité. Seules les
          journées réalistes comptent. Les points n&apos;ont pas de valeur en argent, ne sont ni échangeables ni
          remboursables, et Chef2Box peut adapter le catalogue des récompenses. Une récompense débloquée est remise avec
          une prochaine livraison. En cas d&apos;abus (repas fictifs pour gagner des points), Chef2Box peut annuler les
          points concernés.
        </p>
      </section>

      <section className="space-y-2">
        <h2>Contact</h2>
        <p>
          Une question ?{" "}
          <a href="mailto:hello@chef2box.com" className="font-semibold text-c2b-green underline">
            hello@chef2box.com
          </a>{" "}
          ou l&apos;onglet Messages de l&apos;appli.
        </p>
      </section>
    </PageLegale>
  );
}
