import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MODELE_VISION, lireImage, nombre, rembourserIA, reserverIA } from "@/lib/ia";

// Lecture du tableau des valeurs nutritionnelles d'un produit introuvable :
// l'IA recopie les chiffres imprimés, le client vérifie avant d'enregistrer.

export const dynamic = "force-dynamic";

const erreur = (message: string, status: number) => NextResponse.json({ erreur: message }, { status });

const OUTIL: Anthropic.Tool = {
  name: "valeurs_nutritionnelles",
  description: "Valeurs nutritionnelles lues sur l'étiquette, ramenées à 100 g ou 100 ml.",
  input_schema: {
    type: "object",
    properties: {
      lisible: { type: "boolean", description: "false si aucun tableau nutritionnel lisible sur la photo" },
      nom: { type: "string", description: "Nom du produit s'il est visible, sinon chaîne vide" },
      marque: { type: "string", description: "Marque si visible, sinon chaîne vide" },
      liquide: { type: "boolean", description: "true si les valeurs sont pour 100 ml (boisson)" },
      calories: { type: "number", description: "kcal pour 100 g/ml" },
      proteines: { type: "number", description: "g pour 100 g/ml" },
      glucides: { type: "number", description: "g pour 100 g/ml (glucides totaux, pas « dont sucres »)" },
      lipides: { type: "number", description: "g pour 100 g/ml (matières grasses totales)" },
      portion_libelle: { type: "string", description: "Portion indiquée (« 1 pot », « 1 biscuit »), sinon chaîne vide" },
      portion_grammes: { type: "number", description: "Poids ou volume de cette portion, 0 si inconnu" },
    },
    required: ["lisible", "nom", "marque", "liquide", "calories", "proteines", "glucides", "lipides", "portion_libelle", "portion_grammes"],
  },
};

const CONSIGNES = `Tu lis la photo d'un emballage alimentaire et tu recopies son tableau des valeurs nutritionnelles.
- Donne les valeurs pour 100 g (ou 100 ml pour une boisson). Si le tableau n'indique que des valeurs par portion, ramène-les à 100 g grâce au poids de la portion.
- Énergie en kcal. Si seuls les kJ sont indiqués, divise par 4,184.
- Glucides totaux (pas « dont sucres »), matières grasses totales (pas « dont saturés »).
- Ne devine jamais un chiffre illisible : si le tableau n'est pas lisible, mets lisible à false et 0 partout.
- Étiquettes en français, arabe ou anglais possibles. Réponds uniquement avec l'outil.`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return erreur("La lecture d'étiquette n'est pas encore activée.", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreur("Connectez-vous.", 401);

  const corps = await request.json().catch(() => null);
  const image = lireImage(corps?.image);
  if (!image) return erreur("Photo invalide ou trop lourde.", 400);

  const reservation = await reserverIA(supabase, "etiquette");
  if (!reservation.ok) return erreur(reservation.message, reservation.status);

  try {
    const reponse = await new Anthropic().messages.create({
      model: MODELE_VISION,
      max_tokens: 400,
      system: CONSIGNES,
      tools: [OUTIL],
      tool_choice: { type: "tool", name: OUTIL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.type, data: image.donnees } },
            { type: "text", text: "Voici l'étiquette." },
          ],
        },
      ],
    });
    const bloc = reponse.content.find((b) => b.type === "tool_use");
    const v = (bloc?.type === "tool_use" ? bloc.input : null) as Record<string, unknown> | null;
    if (!v) throw new Error("réponse sans outil");

    const valeurs = {
      calories: Math.round(nombre(v.calories, 950)),
      proteines: nombre(v.proteines, 100),
      glucides: nombre(v.glucides, 100),
      lipides: nombre(v.lipides, 100),
    };
    const lisible = v.lisible === true && valeurs.calories + valeurs.proteines + valeurs.glucides + valeurs.lipides > 0;
    const portionGrammes = nombre(v.portion_grammes, 2000);

    return NextResponse.json({
      lisible,
      nom: typeof v.nom === "string" ? v.nom.slice(0, 120) : "",
      marque: typeof v.marque === "string" ? v.marque.slice(0, 80) : "",
      liquide: v.liquide === true,
      ...valeurs,
      portion:
        portionGrammes >= 1 && typeof v.portion_libelle === "string" && v.portion_libelle
          ? { libelle: v.portion_libelle.slice(0, 40), grammes: portionGrammes }
          : null,
      restant: reservation.restant,
    });
  } catch (e) {
    console.error("Étiquette :", e);
    await rembourserIA(reservation.id);
    return erreur("L'analyse n'a pas marché, réessayez ou tapez les valeurs.", 502);
  }
}
