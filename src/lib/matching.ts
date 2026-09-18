/**
 * Matching engine - porovnává demands s capacities
 * Scoring algoritmus: 0-100%
 */

import type { demand, capacity } from "./schema";

type Demand = typeof demand.$inferSelect;
type Capacity = typeof capacity.$inferSelect;

interface MatchScore {
  overall: number;
  roleMatch: number;
  locationMatch: number;
  skillsMatch: number;
  details: {
    exactRoleMatch: boolean;
    similarRoles: string[];
    matchedSkills: string[];
    missingSkills: string[];
  };
}

/**
 * Levenshtein distance - měří podobnost 2 stringů
 * Používá se pro matchování rolí
 */
export function levenshteinDistance(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().trim();
  a = normalize(a);
  b = normalize(b);

  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Jaccard similarity - porovnává sets
 * (počet shodných / počet jedinečných) * 100
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 100;
  if (a.length === 0 || b.length === 0) return 0;

  const aSet = new Set(a.map((s) => s.toLowerCase()));
  const bSet = new Set(b.map((s) => s.toLowerCase()));

  const intersection = new Set([...aSet].filter((x) => bSet.has(x)));
  const union = new Set([...aSet, ...bSet]);

  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Vrací similarity mezi 0-1 na základě Levenshtein distance
 */
export function stringSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Matchuje roli demands s rolí capacity
 * Vrací score 0-100
 */
export function roleMatch(demand: string, capacity: string): {
  score: number;
  exactMatch: boolean;
} {
  const normalize = (s: string) => s.toLowerCase().trim();
  const d = normalize(demand);
  const c = normalize(capacity);

  // Exact match
  if (d === c) return { score: 100, exactMatch: true };

  // Keyword match (role měsíc = software developer)
  const keywords = {
    dev: ["developer", "programmer", "engineer"],
    qa: ["qa", "tester", "quality"],
    pm: ["product manager", "pm"],
    sales: ["sales", "business development", "bd"],
    data: ["data scientist", "data engineer", "analyst"],
    devops: ["devops", "infrastructure", "sre"],
  };

  for (const [, words] of Object.entries(keywords)) {
    const demandMatches = words.some((w) => d.includes(w));
    const capacityMatches = words.some((w) => c.includes(w));
    if (demandMatches && capacityMatches) {
      return { score: 85, exactMatch: false };
    }
  }

  // Levenshtein-based similarity
  const similarity = stringSimilarity(d, c);
  return { score: Math.round(similarity * 70), exactMatch: false };
}

/**
 * Matchuje location
 * Vrací score 0-100
 */
export function locationMatch(demand: string | null, capacity: string | null): number {
  if (!demand || !capacity) return 50; // Neutral pokud není zadáno

  const normalize = (s: string) => s.toLowerCase().trim();
  const d = normalize(demand);
  const c = normalize(capacity);

  if (d === c) return 100; // Exact match
  if (d.includes("remote") || c.includes("remote")) return 80; // Remote je flexible
  if (d.includes(c) || c.includes(d)) return 60; // Partial match
  
  return 0; // Mismatch
}

/**
 * Matchuje skills/technologies
 * Vrací score 0-100
 */
export function skillsMatch(demand: string[], capacity: string[]): {
  score: number;
  matched: string[];
  missing: string[];
} {
  if (demand.length === 0 && capacity.length === 0) {
    return { score: 100, matched: [], missing: [] };
  }

  if (demand.length === 0) {
    return { score: 50, matched: [], missing: [] };
  }

  if (capacity.length === 0) {
    return { score: 0, matched: [], missing: demand };
  }

  const normalize = (s: string) => s.toLowerCase().trim();
  const demandSet = new Set(demand.map(normalize));
  const capacitySet = new Set(capacity.map(normalize));

  const matched = [...demandSet].filter((s) => capacitySet.has(s));
  const missing = [...demandSet].filter((s) => !capacitySet.has(s));

  const score = Math.round((matched.length / demandSet.size) * 100);

  return {
    score,
    matched,
    missing,
  };
}

/**
 * Hlavní matching funkce
 * Vrací detailní matchovací score
 */
export function matchDemandToCapacity(
  demand: Demand,
  capacity: Capacity
): MatchScore {
  const role = roleMatch(demand.role || "", capacity.role);
  const location = locationMatch(demand.location, capacity.location);
  const skills = skillsMatch(demand.technologies || [], capacity.skills || []);

  // Weighted average
  // 40% role, 25% location, 35% skills
  const overall = Math.round(role.score * 0.4 + location * 0.25 + skills.score * 0.35);

  return {
    overall: Math.min(100, overall),
    roleMatch: role.score,
    locationMatch: location,
    skillsMatch: skills.score,
    details: {
      exactRoleMatch: role.exactMatch,
      similarRoles: [],
      matchedSkills: skills.matched,
      missingSkills: skills.missing,
    },
  };
}

/**
 * Matchuje jednu demand s množinou capacities
 * Vrací nejlépe matchované capacity s score
 */
export function findBestMatch(
  demand: Demand,
  capacities: Capacity[]
): { capacity: Capacity; score: MatchScore } | null {
  if (capacities.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const capacity of capacities) {
    const match = matchDemandToCapacity(demand, capacity);
    if (match.overall > bestScore) {
      bestScore = match.overall;
      bestMatch = { capacity, score: match };
    }
  }

  return bestMatch && bestScore > 30 ? bestMatch : null; // Minimum 30% threshold
}

/**
 * Matchuje demands s capacities
 * Vrací seřazený seznam matchů
 */
export function matchDemandsToCapacities(
  demands: Demand[],
  capacities: Capacity[]
): Array<{
  demand: Demand;
  matches: Array<{
    capacity: Capacity;
    score: MatchScore;
  }>;
}> {
  return demands
    .map((demand) => ({
      demand,
      matches: capacities
        .map((capacity) => ({
          capacity,
          score: matchDemandToCapacity(demand, capacity),
        }))
        .filter((m) => m.score.overall > 30) // Threshold
        .sort((a, b) => b.score.overall - a.score.overall),
    }))
    .filter((result) => result.matches.length > 0);
}
