// Deixa tudo profissional de uma vez: perfil do WhatsApp do bot, grupo (foto, descrição, regras,
// só admins publicam, edição travada), boas-vindas fixada, link de convite e a primeira oferta.
const { getKV, setKV } = require('./db-auth');

const SITE = (process.env.SITE || 'https://oracle-ads.vercel.app').replace(/\/$/, '');
const NOME = 'ORACLE ADS · Ofertas Escaladas';

const DESCRICAO = `ORACLE ADS · OFERTAS ESCALADAS
Radar gratuito de anúncios que estão vendendo agora — Brasil e gringa — com índice de lucro, escala real e a página atrás do cloaker.

O QUE VOCÊ RECEBE
• Ofertas brasileiras e gringas várias vezes ao dia
• Quantos anúncios estão ativos, há quantos dias rodam e quantas vezes o criativo foi duplicado
• Página real, checkout e ticket quando disponíveis
• Lições curtas para ler escala, ROAS e funil

REGRAS — tolerância zero, remoção imediata e sem aviso
1. Somente a administração publica. O grupo é de leitura.
2. Proibido palavrão, ofensa, discussão, política ou qualquer tipo de confusão.
3. Proibido pornografia, conteúdo adulto ou impróprio — remoção e denúncia.
4. Proibido chamar membros no privado para vender, recrutar ou oferecer serviço.
5. Proibido divulgar links, grupos, cursos, produtos ou "parcerias".
6. Proibido golpe, pirâmide, aposta ou promessa enganosa.
7. As ofertas são para estudo e modelagem: não copie marca, nome ou criativo de ninguém.
8. A administração nunca pede senha, código ou pagamento por mensagem.

Radar completo: ${SITE}
Teste grátis: ${SITE}/app/?teste=1`;

const BOAS_VINDAS = `*BEM-VINDO AO RADAR DE OFERTAS DO ORACLE ADS*

Aqui você recebe, várias vezes por dia, anúncios que estão *vendendo agora* — do Brasil e de fora.

Cada relatório mostra:
▸ quantos anúncios o anunciante tem ativos
▸ quantas vezes o criativo foi duplicado
▸ há quantos dias está no ar
▸ o *Índice de Lucro* e o porquê dele
▸ a página real atrás do cloaker, quando houver

*Regras:* só a administração publica. Palavrão, confusão, pornografia, divulgação ou chamar membro no privado = remoção imediata.

Ative as notificações. A próxima oferta pode ser a sua.

${SITE}`;

const logo = async () => Buffer.from(await (await fetch(SITE + '/assets/logo-800.png')).arrayBuffer());
const step = async (nome, fn) => { try { const r = await fn(); console.log('✓', nome); return r; } catch (e) { console.log('✗', nome, '-', e.message); return null; } };

async function perfil(sock) {
  const me = sock.user?.id;
  await step('foto do perfil', async () => sock.updateProfilePicture(me, await logo()));
  await step('nome do perfil', () => sock.updateProfileName('Oracle Ads'));
  await step('recado do perfil', () => sock.updateProfileStatus('Radar de ofertas escaladas · Brasil e gringa · oracle-ads.vercel.app'));
}

async function criarGrupo(sock, admin) {
  const existente = await getKV('group', null);
  if (existente?.id) { console.log('Grupo já existe:', existente.link); return existente; }
  const membros = admin && admin.length >= 12 ? [admin + '@s.whatsapp.net'] : [];
  let g = await step('criar grupo', () => sock.groupCreate(NOME, membros));
  if (!g && !membros.length) throw new Error('O WhatsApp pediu ao menos 1 participante — informe seu WhatsApp pessoal no painel e tente "Criar grupo agora".');
  const jid = g.id;
  await step('descrição e regras', () => sock.groupUpdateDescription(jid, DESCRICAO));
  await step('só admins publicam', () => sock.groupSettingUpdate(jid, 'announcement'));
  await step('só admins editam', () => sock.groupSettingUpdate(jid, 'locked'));
  await step('foto do grupo', async () => sock.updateProfilePicture(jid, await logo()));
  if (membros.length) await step('você como admin', () => sock.groupParticipantsUpdate(jid, membros, 'promote'));
  const msg = await step('boas-vindas', () => sock.sendMessage(jid, { image: { url: `${SITE}/api/card?t=promo&k=BEM-VINDO&h=${encodeURIComponent('Ofertas que estão vendendo agora, todos os dias aqui')}&s=${encodeURIComponent('Brasil e gringa · Índice de Lucro · escala real · página atrás do cloaker.')}` }, caption: BOAS_VINDAS }));
  if (msg) await step('fixar boas-vindas', () => sock.sendMessage(jid, { pin: msg.key, type: 1, time: 2592000 }));
  const code = await step('link de convite', () => sock.groupInviteCode(jid));
  const link = code ? 'https://chat.whatsapp.com/' + code : null;
  const cfg = await getKV('config', {});
  await setKV('config', { ...cfg, groupIds: [jid], groupName: NOME, paused: false });
  const out = { id: jid, name: NOME, link, createdAt: new Date().toISOString() };
  await setKV('group', out);
  console.log('✅ Grupo pronto:', link);
  return out;
}

module.exports = { perfil, criarGrupo, NOME, DESCRICAO };
