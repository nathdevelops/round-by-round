# Round by Round

The v1 spec is the PRD: https://claude.ai/code/artifact/a4d0e012-a65a-4bdd-8a3d-6de65fac1c60. Work milestone by milestone (M1 to M7), opening one PR per milestone.

## Rules

- `packages/engine` stays pure TypeScript: no DOM, React or three.js imports. All geometry and stitch math lives here and is unit-tested.
- Every change to generated pattern text must update a golden test on purpose.
- Stitch-math invariants to keep: round 1 is 6 sc in a magic ring; each round makes `count` stitches and consumes exactly `prev`; counts never drop below 6 (except closing) and never more than double or halve.
- Gauge presets are placeholders until test crochets calibrate them (`TODO(calibrate)`).
- UI must follow the PRD's "Look and feel" section: warm, handmade and crafty, never generic. Theme values live in one place.

## Commands

- `npm test`: engine tests (Vitest + fast-check)
- `npx tsc -b`: typecheck everything
- `npm run build`: production build of the app

## Reference

`reference/` holds the two prototypes: `round-by-round/core.js` (stitch math, profile editor) and `little-red-mushroom/engine.js` (multi-piece pattern, BLO detection).
