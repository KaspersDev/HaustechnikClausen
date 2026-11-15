/** Art einer Leistung. Wird auf Rechnungen getrennt ausgewiesen (§ 35a EStG). */
export const POSITIONSTYPEN = ['Arbeit', 'Material', 'Anfahrt'] as const;
export type PositionsTyp = (typeof POSITIONSTYPEN)[number];
