import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MODELE_VISION, lireImage, nombre, rembourserIA, reserverIA } from "@/lib/ia";
import { nomSimple } from "@/lib/noms-aliments";
import type { Aliment } from "@/lib/types";

// Photo de l'assiette : l'IA reconnaît les aliments et estime les grammes.
// Les macros viennent de préférence de la table CIQUAL (valeurs officielles),
// l'estimation de l'IA ne sert que si aucun aliment proche n'est trouvé.

export const dynamic = "force-dynamic";

const erreur = (message: string, status: number) => NextResponse.json({ erreur: message }, { status });

const OUTIL: Anthropic.Tool = {
  name: "aliments_du_plat",
  description: "Aliments visibles dans l'assiette avec leur poids estimé.",
  input_schema: {
    type: "object",
    properties: {
      est_un_repas: { type: "boolean", description: "false si la photo ne montre pas de nourriture" },
      aliments: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            nom: { type: "string", description: "Nom court en français (« Riz blanc », « Blanc de poulet grillé »)" },
            recherche: {
              type: "string",
              description: "2 à 4 mots pour chercher l'aliment dans la table CIQUAL (« riz blanc cuit », « poulet filet grille »)",
            },
            grammes: { type: "number", description: "Poids estimé dans l'assiette (ml pour une boisson)" },
            liquide: { type: "boolean" },
            calories: { type: "number", description: "Estimation kcal pour 100 g" },
            proteines: { type: "number", description: "Estimation g pour 100 g" },
            glucides: { type: "number", description: "Estimation g pour 100 g" },
            lipides: { type: "number", description: "Estimation g pour 100 g" },
          },
          required: ["nom", "recherche", "grammes", "liquide", "calories", "proteines", "glucides", "lipides"],
        },
      },
      conseil: {
        type: "string",
        description: "Une phrase courte sur ce qui est difficile à estimer (huile, sauce cachée...), sinon chaîne vide",
      },
    },
    required: ["est_un_repas", "aliments", "conseil"],
  },
};

const CONSIGNES = `Tu analyses la photo d'un repas pour une application de suivi nutritionnel au Maroc.
- Liste chaque aliment visible séparément (féculent, viande, légumes, sauce, pain, boisson...). Plats marocains courants : tajine, couscous, harira, msemen, baghrir, etc.
- Estime le poids réel dans l'assiette en t'aidant de la taille de l'assiette, des couverts et des mains. Sois réaliste, ni généreux ni avare.
- Compte l'huile ou le beurre de cuisson visible (brillance, friture) comme un aliment à part si c'est significatif.
- Donne des valeurs pour 100 g de l'aliment tel qu'il est servi (cuit).
- Si la photo ne montre pas de nourriture, mets est_un_repas à false et une liste vide.
Réponds uniquement avec l'outil.`;

type AlimentIA = {
  nom: string;
  recherche: string;
  grammes: number;
  liquide: boolean;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return erreur("L'analyse photo n'est pas encore activée.", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreur("Connectez-vous.", 401);

  const corps = await request.json().catch(() => null);
  const image = lireImage(corps?.image);
  if (!image) return erreur("Photo invalide ou trop lourde.", 400);

  const reservation = await reserverIA(supabase, "plat");
  if (!reservation.ok) return erreur(reservation.message, reservation.status);

  let resultat: { est_un_repas?: boolean; aliments?: AlimentIA[]; conseil?: string };
  try {
    const reponse = await new Anthropic().messages.create({
      model: MODELE_VISION,
      max_tokens: 1200,
      system: CONSIGNES,
      tools: [OUTIL],
      tool_choice: { type: "tool", name: OUTIL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.type, data: image.donnees } },
            { type: "text", text: "Voici mon repas." },
          ],
        },
      ],
    });
    const bloc = reponse.content.find((b) => b.type === "tool_use");
    if (bloc?.type !== "tool_use") throw new Error("réponse sans outil");
    resultat = bloc.input as typeof resultat;
  } catch (e) {
    console.error("Photo du plat :", e);
    await rembourserIA(reservation.id);
    return erreur("L'analyse n'a pas marché, réessayez.", 502);
  }

  const detectes = (Array.isArray(resultat.aliments) ? resultat.aliments : []).slice(0, 10);
  if (resultat.est_un_repas === false || detectes.length === 0) {
    return NextResponse.json({ aliments: [], conseil: "", restant: reservation.restant });
  }

  // Chaque aliment reconnu est rapproché de la table CIQUAL. On garde la
  // valeur officielle si elle est cohérente avec l'estimation (sinon le mot
  // cherché a sans doute trouvé un autre aliment).
  const aliments = await Promise.all(
    detectes.map(async (a) => {
      const estimation = {
        calories: Math.round(nombre(a.calories, 950)),
        proteines: nombre(a.proteines, 100),
        glucides: nombre(a.glucides, 100),
        lipides: nombre(a.lipides, 100),
      };
      const recherche = typeof a.recherche === "string" ? a.recherche.slice(0, 60) : "";
      let base: Aliment | null = null;
      if (recherche.length >= 2) {
        const { data } = await supabase.rpc("application_rechercher_aliments", { q: recherche, limite: 5 });
        base =
          ((data as Aliment[] | null) ?? []).find((c) => {
            const kcal = Number(c.calories);
            return estimation.calories < 40 ? Math.abs(kcal - estimation.calories) <= 40 : kcal >= estimation.calories * 0.5 && kcal <= estimation.calories * 2;
          }) ?? null;
      }
      return {
        nom: (typeof a.nom === "string" && a.nom.trim() ? a.nom.trim() : recherche).slice(0, 80),
        grammes: Math.max(1, Math.round(nombre(a.grammes, 2000))),
        liquide: a.liquide === true,
        ...(base
          ? {
              calories: Math.round(Number(base.calories)),
              proteines: Number(base.proteines),
              glucides: Number(base.glucides),
              lipides: Number(base.lipides),
              reference: nomSimple(base.nom, base.groupe),
            }
          : { ...estimation, reference: null }),
      };
    })
  );

  return NextResponse.json({
    aliments,
    conseil: typeof resultat.conseil === "string" ? resultat.conseil.slice(0, 200) : "",
    restant: reservation.restant,
  });
}
