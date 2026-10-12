// Sessão do WhatsApp (Baileys) guardada no Postgres (Neon) — o bot roda em qualquer lugar sem perder o login.
const { neon } = require('@neondatabase/serverless');
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const sql = neon(process.env.DATABASE_URL);
let ready;
async function schema() {
  ready ??= Promise.all([
    sql`CREATE TABLE IF NOT EXISTS g_wa_keys (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS g_wa (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  ]);
  return ready;
}
const read = async (id) => { const [r] = await sql`SELECT value FROM g_wa_keys WHERE id = ${id}`; return r ? JSON.parse(r.value, BufferJSON.reviver) : null; };
const write = (id, v) => sql`INSERT INTO g_wa_keys (id, value, updated_at) VALUES (${id}, ${JSON.stringify(v, BufferJSON.replacer)}, now())
  ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
const del = (id) => sql`DELETE FROM g_wa_keys WHERE id = ${id}`.then(() => {});

async function useDbAuthState() {
  await schema();
  const creds = (await read('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }));
          return out;
        },
        set: async (data) => {
          const jobs = [];
          for (const cat in data) for (const id in data[cat]) { const v = data[cat][id]; jobs.push(v ? write(`${cat}-${id}`, v) : del(`${cat}-${id}`)); }
          await Promise.all(jobs);
        },
      },
    },
    // a consulta do Neon só executa quando aguardada — por isso o await (sem ele a sessão nunca era salva)
    saveCreds: async () => { try { await write('creds', creds); } catch (e) { console.error('falha ao salvar sessão:', e.message); } },
    wipe: () => sql`DELETE FROM g_wa_keys`,
  };
}
async function getKV(k, d = null) { await schema(); const [r] = await sql`SELECT v FROM g_wa WHERE k = ${k}`; return r ? r.v : d; }
async function setKV(k, v) { await schema(); await sql`INSERT INTO g_wa (k, v, updated_at) VALUES (${k}, ${JSON.stringify(v)}::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`; }

module.exports = { useDbAuthState, getKV, setKV, sql };
