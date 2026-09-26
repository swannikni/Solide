"use client";

import { Pastille } from "@/components/Pastille";
import { GRIGNOTAGE, METIERS, OBJECTIFS, PLAISIR, SEANCES, horsLimites, type Profil } from "@/lib/objectifs";

// Profil tel que saisi dans le formulaire (nombres en texte).
export type ProfilSaisi = {
  sexe: Profil["sexe"] | "";
  age: string;
  taille: string;
  poids: string;
  objectifs: string[];
  seances: Profil["seances"];
  job: Profil["job"];
  grignotage: Profil["grignotage"];
  plaisir: NonNullable<Profil["plaisir"]>;
};

export const PROFIL_VIDE: ProfilSaisi = {
  sexe: "",
  age: "",
  taille: "",
  poids: "",
  objectifs: [],
  seances: "0",
  job: "Principalement assis",
  grignotage: "—",
  plaisir: "—",
};

export function versProfil(p: ProfilSaisi): Partial<Profil> {
  return {
    sexe: p.sexe || undefined,
    age: parseInt(p.age, 10) || 0,
    taille: parseInt(p.taille, 10) || 0,
    poids: parseInt(p.poids, 10) || 0, // comme le site : kg entiers
    objectifs: p.objectifs,
    seances: p.seances,
    job: p.job,
    grignotage: p.grignotage,
    plaisir: p.plaisir,
  };
}

export function depuisProfil(p: Profil | null | undefined): ProfilSaisi {
  if (!p) return { ...PROFIL_VIDE };
  return {
    sexe: p.sexe,
    age: String(p.age),
    taille: String(p.taille),
    poids: String(p.poids),
    objectifs: p.objectifs ?? [],
    seances: p.seances,
    job: p.job,
    grignotage: p.grignotage ?? "—",
    plaisir: p.plaisir ?? "—",
  };
}

// Questions du questionnaire du site (sexe, âge, taille, poids, activité...).
// Utilisé par l'admin (fiche client) et par le client (Mon profil).
export function FormulaireProfil({
  profil,
  onChange,
}: {
  profil: ProfilSaisi;
  onChange: (modif: Partial<ProfilSaisi>) => void;
}) {
  const erreurs = horsLimites(versProfil(profil));

  function basculerObjectif(o: string) {
    onChange({
      objectifs: profil.objectifs.includes(o) ? profil.objectifs.filter((x) => x !== o) : [...profil.objectifs, o],
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["Homme", "Femme"] as const).map((sx) => (
          <Pastille key={sx} active={profil.sexe === sx} onClick={() => onChange({ sexe: sx })} large>
            {sx}
          </Pastille>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["age", "Âge"],
            ["taille", "Taille (cm)"],
            ["poids", "Poids (kg)"],
          ] as const
        ).map(([cle, label]) => (
          <Champ key={cle} label={label}>
            <input
              type="text"
              inputMode="decimal"
              value={profil[cle]}
              onChange={(e) => onChange({ [cle]: e.target.value.replace(/[^0-9.,]/g, "") })}
              className="champ px-3"
            />
          </Champ>
        ))}
      </div>
      {erreurs.length > 0 && <p className="text-xs font-semibold text-red-600">Vérifiez : {erreurs.join(", ")}.</p>}
      <div>
        <span className="block text-[11px] font-bold text-c2b-muted mb-1.5">
          Objectif (plusieurs possibles)
        </span>
        <div className="flex flex-wrap gap-1.5">
          {OBJECTIFS.map((o) => (
            <Pastille key={o} active={profil.objectifs.includes(o)} onClick={() => basculerObjectif(o)}>
              {o}
            </Pastille>
          ))}
        </div>
      </div>
      <div>
        <span className="block text-[11px] font-bold text-c2b-muted mb-1.5">
          Séances de sport par semaine
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {SEANCES.map((sc) => (
            <Pastille key={sc} active={profil.seances === sc} onClick={() => onChange({ seances: sc })}>
              {sc}
            </Pastille>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Champ label="Travail">
          <select
            value={profil.job}
            onChange={(e) => onChange({ job: e.target.value as Profil["job"] })}
            className="champ px-2 text-sm"
          >
            {METIERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Grignotage">
          <select
            value={profil.grignotage}
            onChange={(e) => onChange({ grignotage: e.target.value as Profil["grignotage"] })}
            className="champ px-2 text-sm"
          >
            {(["—", ...GRIGNOTAGE] as const).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <Champ label="Rapport à la nourriture">
        <select
          value={profil.plaisir}
          onChange={(e) => onChange({ plaisir: e.target.value as ProfilSaisi["plaisir"] })}
          className="champ px-2 text-sm"
        >
          {PLAISIR.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Champ>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-c2b-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
