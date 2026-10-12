// Atendimento do privado: quem chama o bot (vindo do anúncio "Leads WhatsApp") recebe na hora o link do grupo grátis.
// Responde uma vez por contato (de novo só depois de RESPONDE_DE_NOVO_H), registra o lead em g_wa_dm.
const { getKV, setKV, sql } = require('./db-auth');

const RESPONDE_DE_NOVO_H = 12;
const MAX_ATRASO_H = 48; // mensagem recebida com o bot fora do ar: ainda responde se tiver até 48h
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

let pronto;
const schema = () => (pronto ??= sql`CREATE TABLE IF NOT EXISTS g_wa_dm (jid TEXT PRIMARY KEY, nome TEXT, primeira TEXT, n INT NOT NULL DEFAULT 1,
  respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ NOT NULL DEFAULT now())`);

const texto = (m) => {
  const x = m.message || {};
  const msg = x.ephemeralMessage?.message || x.viewOnceMessageV2?.message || x;
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
};

const resposta = (nome, link) => `Olá${nome ? ', ' + nome.split(' ')[0] : ''}! 👋

Aqui está o acesso ao *grupo gratuito do Oracle Ads* — todo dia o robô posta ofertas que estão *escaladas de verdade* (dias no ar, criativo duplicado, nº de anúncios ativos), do Brasil e da gringa:

👉 ${link}

É só tocar no link e entrar. O grupo é só de leitura, sem spam. 🔥`;

async function linkDoGrupo() {
  const g = await getKV('group', null);
  return g?.link || null;
}

/** liga o atendimento automático no socket já conectado */
function atender(sock) {
  const fila = new Set();
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      const jid = m.key?.remoteJid || '';
      if (m.key.fromMe || !m.message || !/@(s\.whatsapp\.net|lid)$/.test(jid)) continue; // só conversa privada de outra pessoa
      if (m.message.protocolMessage || m.message.reactionMessage) continue;
      const ts = Number(m.messageTimestamp || 0) * 1000;
      if (ts && Date.now() - ts > MAX_ATRASO_H * 3600e3) continue;
      if (fila.has(jid)) continue;
      fila.add(jid);
      try {
        await schema();
        const nome = (m.pushName || '').trim();
        const [r] = await sql`INSERT INTO g_wa_dm (jid, nome, primeira) VALUES (${jid}, ${nome}, ${texto(m).slice(0, 300)})
          ON CONFLICT (jid) DO UPDATE SET n = g_wa_dm.n + 1, nome = COALESCE(NULLIF(EXCLUDED.nome, ''), g_wa_dm.nome)
          RETURNING respondido_em`;
        if (r.respondido_em && Date.now() - new Date(r.respondido_em) < RESPONDE_DE_NOVO_H * 3600e3) continue;
        const link = await linkDoGrupo();
        if (!link) { console.error('❌ atendimento: grupo sem link de convite'); continue; }
        await sock.readMessages([m.key]).catch(() => {});
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        await dorme(2500 + Math.random() * 2500); // parece gente digitando
        await sock.sendMessage(jid, { text: resposta(nome, link) });
        await sql`UPDATE g_wa_dm SET respondido_em = now() WHERE jid = ${jid}`;
        console.log('💬 respondeu', nome || jid);
      } catch (e) { console.error('❌ atendimento:', e.message); }
      finally { fila.delete(jid); }
    }
  });
}

/** fila manual (KV 'dm_fila': lista de números): manda o link do grupo para quem não foi respondido sozinho */
async function processarFila(sock) {
  const fila = await getKV('dm_fila', []);
  if (!fila.length) return;
  await setKV('dm_fila', []);
  const link = await linkDoGrupo();
  for (const num of fila) {
    try {
      const [r] = await sock.onWhatsApp(String(num).replace(/\D/g, ''));
      if (!r?.exists) { console.error('❌ fila: sem WhatsApp', num); continue; }
      await schema();
      const [c] = await sql`SELECT nome FROM g_wa_dm WHERE jid = ${r.jid}`;
      await sock.sendMessage(r.jid, { text: resposta(c?.nome || '', link) });
      await sql`INSERT INTO g_wa_dm (jid, respondido_em) VALUES (${r.jid}, now()) ON CONFLICT (jid) DO UPDATE SET respondido_em = now()`;
      console.log('💬 fila: enviado para', r.jid);
      await dorme(3000);
    } catch (e) { console.error('❌ fila:', num, e.message); }
  }
}

module.exports = { atender, processarFila };
