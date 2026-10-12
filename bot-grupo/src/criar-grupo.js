// Ajusta o perfil do bot, cria/configura o grupo e manda a primeira oferta (disparado pelo painel).
const { connect, postOnce } = require('./post');
const { perfil, criarGrupo } = require('./setup');
const { setKV } = require('./db-auth');

(async () => {
  const sock = await connect();
  try {
    await perfil(sock);
    await criarGrupo(sock, String(process.env.ADMIN_PHONE || '').replace(/\D/g, ''), process.env.NOVO === '1');
    await new Promise((r) => setTimeout(r, 4000));
    await postOnce(sock);
  } catch (e) {
    await setKV('status', { ok: false, at: new Date().toISOString(), error: 'Configuração: ' + e.message });
    console.error('❌', e.message); process.exitCode = 1;
  } finally {
    await new Promise((r) => setTimeout(r, 5000));
    sock.end(undefined);
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
