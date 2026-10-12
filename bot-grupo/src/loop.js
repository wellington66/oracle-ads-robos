// Plantão do bot: fica ~5h45 de pé checando o relógio a cada minuto e posta no horário certo (o cron do GitHub
// atrasa/pula execuções). Antes de acabar, dispara a próxima execução sozinho — a corrente nunca para.
const { postOnce, connect } = require('./post');
const { getKV, setKV } = require('./db-auth');

const DURA = (+process.env.LOOP_MIN || 345) * 60000;
const INICIO = Date.now();
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const horaBR = () => +new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });

async function devePostar() {
  const bs = await getKV('bot_settings', {}), st = await getKV('state', {}), cfg = await getKV('config', {});
  if (cfg.paused) return false;
  const h = horaBR();
  if (h < (bs.startH ?? 8) || h >= (bs.endH ?? 22)) return false;
  return !st.last || Date.now() - new Date(st.last) >= (bs.gapMin ?? 55) * 60000;
}

async function proxima() {
  const repo = process.env.GITHUB_REPOSITORY, tk = process.env.GH_TOKEN;
  if (!repo || !tk) return console.log('sem GH_TOKEN: a próxima fica com o agendamento');
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/grupo.yml/dispatches`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ ref: 'main', inputs: { modo: 'plantao' } }),
  });
  console.log('próximo plantão disparado:', r.status);
}

(async () => {
  console.log('plantão iniciado');
  await setKV('plantao', { at: new Date().toISOString() });
  while (Date.now() - INICIO < DURA) {
    try {
      if (await devePostar()) {
        const sock = await connect();
        try { await postOnce(sock); }
        catch (e) { await setKV('status', { ok: false, at: new Date().toISOString(), error: e.message }); console.error('❌', e.message); }
        finally { await dorme(5000); sock.end(undefined); }
      }
    } catch (e) { console.error('❌', e.message); }
    await dorme(60000);
  }
  await proxima();
  process.exit(0);
})();
