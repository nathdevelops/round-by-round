// node generate.js [stsPer10cm] [rowsPer10cm] [size]
// Writes mushroom-pattern.md next to this script.
const fs = require('fs');
const path = require('path');
const A = require('./engine.js');
const M = require('./mushroom.js');

const [sts = 20, rows = 22, size = 1] = process.argv.slice(2).map(Number);
const gauge = A.gaugeFromSwatch(sts, rows);
const { list, dims } = M.pieces(size);

const out = [];
out.push('# Little Red Mushroom', '');
out.push(`Gauge: ${sts} sc × ${rows} rounds = 10 cm (worsted yarn, about a 3.5 mm hook, worked tight).`);
out.push(`Finished size: about ${((dims.capH + dims.stemH) / 10).toFixed(1)} cm tall, cap ${(dims.capR * 2 / 10).toFixed(1)} cm across.`, '');
out.push('Work in continuous rounds; move a stitch marker up each round.', '');
for (const piece of list) {
  const p = A.buildPiece(piece, gauge);
  out.push('```', A.formatPiece(p), '```', '');
}
out.push('## Assembly', '', ...M.assembly.map((a) => `- ${a}`), '');
const file = path.join(__dirname, 'mushroom-pattern.md');
fs.writeFileSync(file, out.join('\n'));
console.log(out.join('\n'));
