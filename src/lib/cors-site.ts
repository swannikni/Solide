// Routes publiques appelées depuis le site vitrine (chef2box.com) : seules ces
// origines reçoivent l'autorisation CORS.
const ORIGINES = ["https://chef2box.com", "https://www.chef2box.com", "https://chef2box-questionnaire.netlify.app"];

export function entetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && ORIGINES.includes(origine) ? origine : ORIGINES[0];
  return {
    "Access-Control-Allow-Origin": autorisee,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
