import { GLYPH_BLUE } from '../ui/board-theme';

/** Simple pawn silhouette, like the blue pawns drawn on the start houses. */
export function PawnGlyph({ color = GLYPH_BLUE }: { color?: string }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M12 2a4 4 0 0 0-3 6.6c-1.2.7-2 2-2 3.4h10c0-1.4-.8-2.7-2-3.4A4 4 0 0 0 12 2zM6 14l-1.5 6h15L18 14H6z"
      />
    </svg>
  );
}

/** Crown medallion at the center finish house. */
export function CrownGlyph({ color = GLYPH_BLUE }: { color?: string }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path fill={color} d="M3 8l3.5 3L12 5l5.5 6L21 8l-1.5 11h-15L3 8z" />
    </svg>
  );
}
