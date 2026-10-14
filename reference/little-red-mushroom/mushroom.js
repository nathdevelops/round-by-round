// Mushroom model: a domed cap and a slightly tapered stem, plus sewn-on spots.
// All sizes in millimetres. `size` scales the whole toy.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mushroom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = {
    cap: { name: 'Red', hex: '#c8402f' },
    spot: { name: 'White', hex: '#f4efe6' },
    stem: { name: 'Cream', hex: '#e7d6b4' },
    gills: { name: 'Cream', hex: '#e7d6b4' },
  };

  function dims(size = 1) {
    return {
      capR: 45 * size,      // cap radius at the rim
      capH: 34 * size,      // dome height above the rim
      stemTopR: 15 * size,  // where the stem meets the cap
      stemBaseR: 22 * size, // a little wider at the base so it stands
      stemH: 50 * size,
      spotR: 7 * size,
    };
  }

  // Quarter ellipse from the pole down to the rim, then the flat underside
  // inward to the stem opening.
  function capProfile(d) {
    const pts = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * (Math.PI / 2);
      const r = d.capR * Math.sin(t);
      const z = d.capH * Math.cos(t);
      pts.push([r, z]);
    }
    // underside: flat, from the rim in to the stem
    const M = 10;
    for (let i = 1; i <= M; i++) {
      const r = d.capR - (d.capR - d.stemTopR) * (i / M);
      pts.push([r, 0]);
    }
    return pts;
  }

  function stemProfile(d) {
    const pts = [[0, 0], [d.stemBaseR, 0]];
    const N = 20;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      // gentle bulge, narrowing toward the top
      const r = d.stemBaseR + (d.stemTopR - d.stemBaseR) * t + 2 * Math.sin(Math.PI * t) * (d.stemBaseR / 21);
      pts.push([r, d.stemH * t]);
    }
    return pts;
  }

  function spotProfile(d) {
    return [[0, 0], [d.spotR, 0]];
  }

  function pieces(size = 1) {
    const d = dims(size);
    const cap = capProfile(d);
    // where along the cap the dome ends (switch to gill colour on the underside)
    let domeLen = 0;
    for (let i = 1; i <= 40; i++) domeLen += Math.hypot(cap[i][0] - cap[i - 1][0], cap[i][1] - cap[i - 1][1]);
    let total = domeLen + (d.capR - d.stemTopR);
    return {
      dims: d,
      list: [
        {
          key: 'cap', name: 'Cap', color: COLORS.cap, profile: cap,
          colorChanges: [{ at: (domeLen + 0.5) / total, color: COLORS.gills }],
          start: 'Start at the top of the cap with Red.',
          finish: 'Fasten off, leaving a long tail. Stuff the cap firmly so the dome holds its shape. Leave the centre open for the stem.',
        },
        {
          key: 'stem', name: 'Stem', color: COLORS.stem, profile: stemProfile(d),
          start: 'Start at the base with Cream.',
          finish: 'Fasten off, leaving a long tail. Stuff firmly, pushing stuffing into the base so the mushroom stands.',
        },
        {
          key: 'spot', name: 'Spots (make 5)', color: COLORS.spot, profile: spotProfile(d), count: 5,
          start: 'With White.',
          finish: 'Sl st to join. Fasten off and leave a tail for sewing.',
        },
      ],
    };
  }

  const assembly = [
    'Sew the open top of the stem into the opening on the underside of the cap, stuffing the joint as you close it.',
    'Pin the spots around the dome before sewing so they look scattered, not in a ring.',
    'Optional: embroider a few radial lines on the underside in a darker cream for gills.',
    'For safety eyes, place them on the stem between rounds 10 and 11, about 6 stitches apart.',
  ];

  return { COLORS, dims, pieces, assembly };
});
