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
- `packages/app`: Vite + React app
- `fixtures/`: starter projects and golden patterns, plus test-crochet results
- `reference/`: the two prototypes this was built from (read-only)
