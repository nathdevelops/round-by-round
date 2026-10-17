# Round by Round

Build a toy from simple 3D shapes and get a crochetable amigurumi pattern back, with a stitch-by-stitch preview.

- Product requirements (v1): https://claude.ai/code/artifact/a4d0e012-a65a-4bdd-8a3d-6de65fac1c60
- Background design doc: https://claude.ai/code/artifact/042ad65a-7cb4-4d51-b0a4-109dbaf3f226

## Develop

```sh
npm install
npm test        # engine unit and property tests
npm run dev     # app at http://localhost:5173
npm run build   # static site in packages/app/dist
```

## Layout

- `packages/engine`: pure TypeScript pattern engine (no DOM, no three.js)
  - `fuse.ts`: one shell from several shapes, sliced into a profile
  - `sew.ts`: pieces, what each is sewn onto, safety eyes
  - `assembly.ts`: trims sewn pieces, places seams in host rounds, writes the whole pattern
  - `starters.ts`: Little Red Mushroom and Sitting Bear
- `packages/app`: Vite + React + React Three Fiber editor
  - `editor/`: 3D stage, shape meshes, gizmos
  - `panels/`: shelf, inspector, pattern, top bar
  - `state/`: project with undo/redo and autosave; the pattern plan
- Style sheet (approved look and feel): https://claude.ai/artifact/DgJV4Ht3CvfVbTwkCypNZr; tokens live in `packages/app/src/theme.css`
- `fixtures/`: golden patterns for the starters (`*.pattern.txt`; update with `npx vitest run -u` only when a change is meant), plus test-crochet results
- `reference/`: the two prototypes this was built from (read-only)
