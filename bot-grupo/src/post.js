// Uma postagem e encerra (roda no GitHub Actions a cada ~2h — nada fica ligado em computador nenhum).
// DRY_RUN=1: monta o post e mostra no terminal, sem conectar no WhatsApp.
const pino = require('pino');
const { ROTA, LICOES, offerCaption, bastidores, convite } = require('./mensagens');
const { getKV, setKV } = require('./db-auth');

const SITE = (process.env.SITE || 'https://garimpo-ads.vercel.app').replace(/\/$/, '');
const DRY = process.env.DRY_RUN === '1';
const cardUrl = (q) => `${SITE}/api/card?${new URLSearchParams(q)}&v=${Date.now() % 1e6}`;

async function api(path) { const r = await fetch(SITE + path); if (!r.ok) throw new Error(path + ' -> ' + r.status); return r.json(); }

async function build(st) {
  const kind = ROTA[st.seq % ROTA.length];
  const skip = encodeURIComponent((st.recent || []).slice(-200).join(','));
  const pages = encodeURIComponent((st.pages || []).slice(-30).join('|'));
  const pulse = await api('/api/public?a=pulse');
  const offer = async (extra) => {
    let a;
    try { a = await api(`/api/public?a=teaser&skip=${skip}&pages=${pages}${extra}`); } catch { a = await api(`/api/public?a=teaser&skip=${skip}&pages=${pages}`); }
    st.recent = [...(st.recent || []), a.id].slice(-300); st.pages = [...(st.pages || []), a.page].slice(-40);
    return a;
  };
  if (kind === 'relatorio') { const a = await offer('&lang=pt'); return { kind, image: cardUrl({ id: a.id }), caption: offerCaption(a, kind, SITE) }; }
  if (kind === 'gringa') { const a = await offer('&abroad=1'); return { kind, image: cardUrl({ id: a.id }), caption: offerCaption(a, kind, SITE) }; }
  if (kind === 'cloaker') {
    const a = await offer('&funnel=1');
    return { kind, image: cardUrl({ id: a.id }), caption: offerCaption(a, a.funnel?.finalUrl ? 'cloaker' : 'relatorio', SITE) };
  }
  if (kind === 'licao') { const l = LICOES[(st.licao = ((st.licao || 0) + 1)) % LICOES.length]; return { kind, image: cardUrl({ t: 'promo', h: l.h, s: l.s, k: 'INTELIGÊNCIA DE OFERTAS' }), caption: l.t(pulse) }; }
  if (kind === 'bastidores') { const b = bastidores(pulse, SITE); return { kind, image: cardUrl({ t: 'promo', ...b.card }), caption: b.text }; }
  const c = convite(SITE); return { kind, image: cardUrl({ t: 'promo', ...c.card }), caption: c.text };
}

async function connect() {
  const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
  const { useDbAuthState } = require('./db-auth');
  const { state, saveCreds } = await useDbAuthState();
  if (!state.creds.registered) throw new Error('WhatsApp ainda não pareado — use o painel do dono › Grupo de WhatsApp');
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false });
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

(async () => {
  const st = await getKV('state', { seq: 0 });
  const cfg = await getKV('config', {});
  if (DRY && process.env.SEQ) st.seq = +process.env.SEQ;
  if (!DRY && cfg.paused) return console.log('Bot pausado no painel.');
  const post = await build(st);
  console.log(`[${post.kind}] ${post.image}\n\n${post.caption}\n`);
  if (DRY) { st.seq++; return; }
  const sock = await connect();
  try {
    const ids = await groups(sock, cfg);
    if (!ids.length) throw new Error('Nenhum grupo configurado/encontrado (veja no painel a lista de grupos do número).');
    for (const g of ids) { await sock.sendMessage(g, { image: { url: post.image }, caption: post.caption }); await new Promise((r) => setTimeout(r, 3000)); }
    st.seq++; st.last = new Date().toISOString(); st.lastKind = post.kind;
    await setKV('state', st);
    await setKV('status', { ok: true, at: st.last, kind: post.kind, groups: ids.length });
    console.log('✅ postado em', ids.length, 'grupo(s)');
  } catch (e) {
    await setKV('status', { ok: false, at: new Date().toISOString(), error: e.message });
    throw e;
  } finally {
    await new Promise((r) => setTimeout(r, 4000));
    sock.end(undefined);
  }
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
