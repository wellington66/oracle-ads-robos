// Dispara N posts seguidos no grupo (para conferir a sequência). Uso: QTD=5 node src/rodada-teste.js
const { connect, postOnce } = require('./post');
(async () => {
  const n = Math.min(12, +process.env.QTD || 5);
  const sock = await connect();
  for (let i = 0; i < n; i++) { const p = await postOnce(sock); console.log(i + 1, p && p.kind); await new Promise((r) => setTimeout(r, 20000)); }
  await new Promise((r) => setTimeout(r, 4000)); sock.end(undefined); process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
