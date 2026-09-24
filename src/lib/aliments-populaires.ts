export interface AlimentPopulaire {
  nom: string;
  portion: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
}

// Base d'aliments courants pour la saisie manuelle rapide, en portion usuelle
// (pas systématiquement 100g). L'utilisateur ajuste ensuite la quantité.
export const ALIMENTS_POPULAIRES: AlimentPopulaire[] = [
  { nom: "Blanc de poulet", portion: "150g", calories: 248, proteines: 46, glucides: 0, lipides: 5 },
  { nom: "Riz blanc cuit", portion: "150g", calories: 195, proteines: 4, glucides: 43, lipides: 0.5 },
  { nom: "Riz complet cuit", portion: "150g", calories: 165, proteines: 4, glucides: 34, lipides: 1.5 },
  { nom: "Œufs (2)", portion: "2 œufs", calories: 156, proteines: 13, glucides: 1, lipides: 11 },
  { nom: "Flocons d'avoine", portion: "60g", calories: 228, proteines: 8, glucides: 39, lipides: 4 },
  { nom: "Banane", portion: "1 pièce", calories: 105, proteines: 1, glucides: 27, lipides: 0.4 },
  { nom: "Pomme", portion: "1 pièce", calories: 95, proteines: 0.5, glucides: 25, lipides: 0.3 },
  { nom: "Yaourt grec nature", portion: "150g", calories: 130, proteines: 15, glucides: 6, lipides: 4 },
  { nom: "Amandes", portion: "30g", calories: 174, proteines: 6, glucides: 6, lipides: 15 },
  { nom: "Pain complet", portion: "2 tranches", calories: 140, proteines: 6, glucides: 24, lipides: 2 },
  { nom: "Avocat", portion: "1/2 pièce", calories: 120, proteines: 1.5, glucides: 6, lipides: 11 },
  { nom: "Saumon", portion: "150g", calories: 280, proteines: 34, glucides: 0, lipides: 15 },
  { nom: "Pâtes cuites", portion: "150g", calories: 220, proteines: 8, glucides: 43, lipides: 1.5 },
  { nom: "Fromage blanc 0%", portion: "150g", calories: 68, proteines: 12, glucides: 5, lipides: 0.3 },
  { nom: "Huile d'olive", portion: "1 c. à soupe", calories: 119, proteines: 0, glucides: 0, lipides: 13.5 },
];
