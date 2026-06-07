/**
 * Round-robin scheduling (circle method) — fonction pure.
 *
 * Génère toutes les rencontres "chacun contre chacun" au sein d'un groupe.
 * Si nombre impair → ajout d'un BYE (null) automatiquement filtré.
 */

export interface Pairing {
  teamAId: string | null; // null = BYE
  teamBId: string | null;
  round: number; // 1-indexed
}

/**
 * Round-robin (méthode du cercle).
 * Retourne (n-1) journées pour n équipes paires, n journées pour n impair.
 * Les paires contenant un BYE sont exclues du résultat.
 */
export function generateRoundRobin(teamIds: string[]): Pairing[] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(null); // BYE

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const pairings: Pairing[] = [];

  // Fixed: teams[0] ; on tourne les autres
  const rotating = teams.slice(1);

  for (let r = 0; r < rounds; r++) {
    const roundTeams = [teams[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a !== null && b !== null) {
        // Alterne home/away pour équilibre
        const home = r % 2 === 0 ? a : b;
        const away = r % 2 === 0 ? b : a;
        pairings.push({ teamAId: home, teamBId: away, round: r + 1 });
      }
    }
    // Rotation
    rotating.unshift(rotating.pop()!);
  }

  return pairings;
}

/**
 * Round-robin aller-retour : chaque équipe joue 2 fois contre chaque autre
 * (1 fois à domicile, 1 fois à l'extérieur). Les rondes de la 2e passe
 * continuent la numérotation et inversent home/away.
 */
export function generateDoubleRoundRobin(teamIds: string[]): Pairing[] {
  const first = generateRoundRobin(teamIds);
  if (first.length === 0) return first;
  const maxRound = Math.max(...first.map((p) => p.round));
  const second: Pairing[] = first.map((p) => ({
    teamAId: p.teamBId,
    teamBId: p.teamAId,
    round: p.round + maxRound,
  }));
  return [...first, ...second];
}


/**
 * Distribue des équipes (avec seeds optionnels) dans N groupes équilibrés
 * via "snake draft" pour répartir les têtes de série.
 */
export function distributeIntoGroups(
  teams: Array<{ id: string; seed?: number | null }>,
  numGroups: number,
): string[][] {
  if (numGroups < 1) return [];
  const sorted = [...teams].sort((a, b) => {
    const sa = a.seed ?? 9999;
    const sb = b.seed ?? 9999;
    return sa - sb;
  });
  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  sorted.forEach((team, idx) => {
    const cycle = Math.floor(idx / numGroups);
    const pos = idx % numGroups;
    const groupIdx = cycle % 2 === 0 ? pos : numGroups - 1 - pos;
    groups[groupIdx].push(team.id);
  });
  return groups;
}
