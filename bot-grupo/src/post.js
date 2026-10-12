// Uma postagem e encerra (GitHub Actions a cada hora, 8h às 21h — nada fica ligado em computador nenhum).
// DRY_RUN=1: monta o post e mostra no terminal, sem conectar no WhatsApp. SEQ=n força a posição na sequência.
const pino = require('pino');
const { ROTA, LICOES, offerCaption, bastidores, convite } = require('./mensagens');
const { getKV, setKV } = require('./db-auth');

const SITE = (process.env.SITE || 'https://oracle-ads.vercel.app').replace(/\/$/, '');
const DRY = process.env.DRY_RUN === '1';
const MAX_ADS = 30; // nada de anunciante gigante: até 30 anúncios ativos — oferta que dá para modelar
const cardUrl = (q) => `${SITE}/api/card?${new URLSearchParams(q)}&v=${Date.now() % 1e6}`;

async function api(path) { const r = await fetch(SITE + path); if (!r.ok) throw new Error(path + ' -> ' + r.status); return r.json(); }

async function build(st) {
  const kind = ROTA[st.seq % ROTA.length];
  const skip = encodeURIComponent((st.recent || []).slice(-300).join(','));
  const pages = encodeURIComponent((st.pages || []).slice(-40).join('|'));
  const pulse = await api('/api/public?a=pulse');
  // faixa sorteada: metade médias (até 29 anúncios), um terço boas (30-49), às vezes uma das mais escaladas (50+)
  const r = Math.random(), tier = r < 0.5 ? 'media' : r < 0.85 ? 'boa' : 'top';
  const ordem = { media: ['media', 'boa', 'top'], boa: ['boa', 'media', 'top'], top: ['top', 'boa', 'media'] }[tier];
  const offer = async (...tries) => {
    let a = null;
    for (const t of ordem) {
      for (const extra of [...tries, '']) { try { a = await api(`/api/public?a=teaser&focus=1&tier=${t}&skip=${skip}&pages=${pages}${extra}`); break; } catch {} }
      if (a) break;
    }
    if (!a) a = await api(`/api/public?a=teaser&max=${MAX_ADS}&skip=${skip}&pages=${pages}`).catch(() => api(`/api/public?a=teaser&skip=${skip}`));
    st.recent = [...(st.recent || []), a.id].slice(-400); st.pages = [...(st.pages || []), a.page].slice(-60);
    return a;
  };
  // ofertas: só uma foto pequena (o próprio criativo) e os dados escritos na legenda, com links
  const small = (a) => a.image || cardUrl({ id: a.id });
  if (kind === 'relatorio') { const a = await offer('&lang=pt&br=1', '&lang=pt'); return { kind, image: small(a), caption: offerCaption(a, kind, SITE, pulse) }; }
  if (kind === 'gringa') { const a = await offer('&abroad=1'); return { kind, image: small(a), caption: offerCaption(a, kind, SITE, pulse) }; }
  if (kind === 'cloaker') { const a = await offer('&funnel=1', '&lang=pt'); return { kind, image: small(a), caption: offerCaption(a, a.funnel?.finalUrl ? 'cloaker' : 'relatorio', SITE, pulse) }; }
  if (kind === 'licao') { const l = LICOES[(st.licao = (st.licao || 0) + 1) % LICOES.length]; return { kind, image: cardUrl({ t: 'promo', h: l.h, s: l.s, k: 'INTELIGÊNCIA DE OFERTAS' }), caption: l.t(pulse) }; }
  if (kind === 'bastidores') { const b = bastidores(pulse, SITE); return { kind, image: cardUrl({ t: 'promo', ...b.card }), caption: b.text }; }
  const c = convite(SITE); return { kind, image: cardUrl({ t: 'promo', ...c.card }), caption: c.text };
}

async function connect() {
  const { default: makeWASocket, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const { useDbAuthState } = require('./db-auth');
  const { state, saveCreds } = await useDbAuthState();
  if (!state.creds.me?.id) throw new Error('WhatsApp ainda não pareado — use o painel do dono › WhatsApp do bot'); // pelo QR o 'registered' fica falso: o que vale é ter a conta (me)
  const sock = makeWASocket({ version, auth: state, browser: Browsers.ubuntu('Chrome'), logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false, connectTimeoutMs: 60000 });
  sock.ev.on('creds.update', saveCreds);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ao conectar')), 60000);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') { clearTimeout(t); res(); }
      if (connection === 'close') { clearTimeout(t); rej(new Error('conexão fechada: ' + (lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message))); }
    });
  });
  return sock;
}

async function groups(sock, cfg) {
  if (cfg.groupIds?.length) return cfg.groupIds;
  const all = await sock.groupFetchAllParticipating();
  const name = String(cfg.groupName || process.env.GROUP_NAME || '').trim().toLowerCase();
  const list = Object.values(all);
  await setKV('groups', list.map((g) => ({ id: g.id, name: g.subject, size: g.participants?.length || 0 })));
  return list.filter((g) => name && g.subject.trim().toLowerCase() === name).map((g) => g.id);
}

/** posta o próximo item da sequência nos grupos configurados (usa um socket já conectado) */
async function postOnce(sock) {
  const st = await getKV('state', { seq: 0 });
  const cfg = await getKV('config', {});
  if (cfg.paused) { console.log('Bot pausado no painel.'); return null; }
  const post = await build(st);
  const ids = await groups(sock, cfg);
  if (!ids.length) throw new Error('Nenhum grupo configurado/encontrado.');
  for (const g of ids) { await sock.sendMessage(g, { image: { url: post.image }, caption: post.caption }); await new Promise((r) => setTimeout(r, 3000)); }
  st.seq++; st.last = new Date().toISOString(); st.lastKind = post.kind;
  await setKV('state', st);
  await setKV('status', { ok: true, at: st.last, kind: post.kind, groups: ids.length });
  console.log('✅ postado:', post.kind, 'em', ids.length, 'grupo(s)');
  return post;
}

async function main() {
  if (DRY) {
    const st = await getKV('state', { seq: 0 });
    if (process.env.SEQ) st.seq = +process.env.SEQ;
    const post = await build(st);
    return console.log(`[${post.kind}] ${post.image}\n\n${post.caption}\n`);
  }
  const sock = await connect();
  try { await postOnce(sock); }
  catch (e) { await setKV('status', { ok: false, at: new Date().toISOString(), error: e.message }); throw e; }
  finally { await new Promise((r) => setTimeout(r, 5000)); sock.end(undefined); }
}

module.exports = { postOnce, connect, build };
if (require.main === module) main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
