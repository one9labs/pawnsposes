# Reusable UI Components

## New primitives introduced

- `src/components/ui/EmptyState.tsx`
  - Consistent icon/title/description/action pattern.
  - Used for no-data scenarios to prevent blank screens.

- `src/components/ui/Skeleton.tsx`
  - Shared shimmer skeleton style for content placeholders.
  - Respects `prefers-reduced-motion`.

## Refined primitives

- `src/components/ui/Button.tsx`
  - Premium elevation, smoother hover/focus transitions, stronger variants.
  - Better visual hierarchy between primary and supporting actions.

- `src/components/ui/Card.tsx`
  - Unified radii, border, and elevation.
  - Better typography defaults for high-density card content.

## Utility classes added in `src/index.css`

- `surface-card` and `surface-subtle` for consistent surfaces.
- `section-shell` for global width and horizontal spacing.
- `metric-value` and `muted-kicker` typography helpers.
- `skeleton-shimmer` animation utility.
