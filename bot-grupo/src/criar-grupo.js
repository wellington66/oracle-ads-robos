// Cria e configura o grupo gratuito: nome, foto, descrição com regras, só admins postam,
// dono como admin, boas-vindas fixada e link de convite salvo no painel.
const pino = require('pino');
const { useDbAuthState, getKV, setKV } = require('./db-auth');

const SITE = (process.env.SITE || 'https://oracle-ads.vercel.app').replace(/\/$/, '');
const NOME = (process.env.GROUP_NAME || 'ORACLE ADS · Ofertas Escaladas').slice(0, 100);
const ADMIN = String(process.env.ADMIN_PHONE || '').replace(/\D/g, '');

const DESCRICAO = `ORACLE ADS · OFERTAS ESCALADAS
Radar gratuito das ofertas que estão dando dinheiro agora: low ticket, cloaker quebrado e funis de resposta direta em 40 países.

O QUE VOCÊ RECEBE AQUI
• Relatórios de ofertas escaladas com Índice de Lucro
• Página real atrás do cloaker, checkout e ticket
• Ofertas gringas antes de chegarem ao Brasil
• Lições curtas para ler escala, ROAS e funil

REGRAS — quem descumprir é removido sem aviso
1. Grupo somente leitura: só a administração publica.
2. Proibido chamar membros no privado para vender, recrutar ou oferecer serviço.
3. Proibido divulgar links, grupos, cursos, produtos ou "parcerias".
4. Proibido golpe, pirâmide, aposta, conteúdo enganoso ou ofensivo.
5. As ofertas são para estudo e modelagem. Não copie marca, nome, depoimento ou criativo de ninguém.
6. A administração nunca pede senha, código ou pagamento por mensagem. Desconfie de quem pedir.
7. Suporte e acesso somente pelo site oficial.

Radar completo ao vivo: ${SITE}
Teste grátis: ${SITE}/app/?teste=1`;

const BOAS_VINDAS = `*BEM-VINDO AO RADAR DE OFERTAS DO ORACLE ADS*

Aqui você recebe, todos os dias, as ofertas que estão *escalando de verdade* — não anúncio bonito, anúncio que dá lucro.

Cada relatório traz:
▸ quantos anúncios o anunciante tem ativos
▸ quantas vezes o criativo foi duplicado
▸ há quantos dias está no ar
▸ o *Índice de Lucro* e o porquê dele
▸ a página real atrás do cloaker, quando houver

*Regras em uma linha:* só a administração publica, ninguém chama ninguém no privado e ninguém divulga nada. Quem descumprir sai sem aviso.

Ative as notificações deste grupo. A próxima oferta pode ser a sua.

${SITE}`;

(async () => {
  const { default: makeWASocket, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const { state, saveCreds } = await useDbAuthState();
  if (!state.creds.registered) throw new Error('WhatsApp do bot ainda não pareado.');
  const sock = makeWASocket({ version, auth: state, browser: Browsers.ubuntu('Chrome'), logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false, connectTimeoutMs: 60000 });
  sock.ev.on('creds.update', saveCreds);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ao conectar')), 60000);
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') { clearTimeout(t); res(); }
      if (connection === 'close') { clearTimeout(t); rej(new Error('conexão fechada: ' + (lastDisconnect?.error?.message || ''))); }
    });
  });
  const step = async (nome, fn) => { try { await fn(); console.log('✓', nome); } catch (e) { console.log('✗', nome, '-', e.message); } };
  try {
    const membros = ADMIN.length >= 12 ? [ADMIN + '@s.whatsapp.net'] : [];
    const g = await sock.groupCreate(NOME, membros);
    const jid = g.id;
    console.log('Grupo criado:', jid);
    await step('descrição', () => sock.groupUpdateDescription(jid, DESCRICAO));
    await step('só admins enviam', () => sock.groupSettingUpdate(jid, 'announcement'));
    await step('só admins editam', () => sock.groupSettingUpdate(jid, 'locked'));
    await step('foto', async () => { const r = await fetch(SITE + '/assets/logo-800.png'); await sock.updateProfilePicture(jid, Buffer.from(await r.arrayBuffer())); });
    if (membros.length) await step('dono como admin', () => sock.groupParticipantsUpdate(jid, membros, 'promote'));
    let msg;
    await step('boas-vindas', async () => { msg = await sock.sendMessage(jid, { image: { url: `${SITE}/api/card?t=promo&k=BEM-VINDO&h=${encodeURIComponent('As ofertas que já dão dinheiro, todo dia aqui')}&s=${encodeURIComponent('Relatórios com Índice de Lucro, escala real e a página atrás do cloaker.')}` }, caption: BOAS_VINDAS }); });
    if (msg) await step('fixar boas-vindas', () => sock.sendMessage(jid, { pin: msg.key, type: 1, time: 2592000 }));
    let link = null;
    await step('link de convite', async () => { link = 'https://chat.whatsapp.com/' + (await sock.groupInviteCode(jid)); });
    const cfg = await getKV('config', {});
    await setKV('config', { ...cfg, groupIds: [jid], groupName: NOME, paused: false });
    await setKV('group', { id: jid, name: NOME, link, createdAt: new Date().toISOString() });
    await setKV('status', { ok: true, at: new Date().toISOString(), kind: 'grupo criado', groups: 1 });
    console.log('✅ Pronto:', link);
  } catch (e) {
    await setKV('status', { ok: false, at: new Date().toISOString(), error: 'Criar grupo: ' + e.message });
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await new Promise((r) => setTimeout(r, 4000));
    sock.end(undefined);
    setTimeout(() => process.exit(process.exitCode || 0), 1500);
  }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
