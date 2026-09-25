// Répartition par défaut des macros à partir des calories :
// 30 % protéines, 40 % glucides, 30 % lipides (4 / 4 / 9 kcal par gramme).
export function repartirMacros(calories: number) {
  return {
    proteines: Math.round((calories * 0.3) / 4),
    glucides: Math.round((calories * 0.4) / 4),
    lipides: Math.round((calories * 0.3) / 9),
  };
}

export const PALIERS = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
