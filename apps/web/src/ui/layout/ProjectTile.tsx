import { cn } from '../cn';
import { labelColor } from '../LabelChip';

/** Palette hue 1–9 for a project's tile, stable per key (projects have no colour of their own yet). */
export function projectHue(projectKey: string): number {
  let hash = 0;
  for (const char of projectKey.toUpperCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 9) + 1;
}

export interface ProjectTileProps {
  projectKey: string;
  /** The letter on the tile; defaults to the name's first letter, else the key's. */
  name?: string;
  /** 18 (sidebar, crumbs) or 14 (rows). */
  size?: 18 | 14;
  className?: string;
}

/** The project's square tile (margin.css .tile): first letter in --tile-ink on the project's hue. */
export function ProjectTile({ projectKey, name, size = 18, className }: ProjectTileProps) {
  const letter = (name?.trim().charAt(0) || projectKey.charAt(0)).toUpperCase();
  return (
    <span
      aria-hidden
      data-hue={projectHue(projectKey)}
      className={cn(
        'grid shrink-0 place-items-center font-bold text-tile-ink',
        size === 18 ? 'size-4.5 rounded-sm' : 'size-3.5 rounded-sm',
        className,
      )}
      // The letter follows the tile, not the type scale (margin.css .tile: 10px on 18, 8px on 14), like Avatar.
      style={{
        background: labelColor(projectHue(projectKey)),
        fontSize: size === 18 ? 10 : 8,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
}
