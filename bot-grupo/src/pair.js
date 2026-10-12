// Pareamento do número do bot por CÓDIGO (sem QR): o código aparece no painel do dono.
// No celular: WhatsApp › Aparelhos conectados › Conectar aparelho › "Conectar com número de telefone" › digite o código.
const pino = require('pino');
const { useDbAuthState, setKV } = require('./db-auth');

const PHONE = String(process.env.PHONE || '').replace(/\D/g, '');
if (PHONE.length < 12) { console.error('Informe PHONE com DDI+DDD, ex.: 5554999990000'); process.exit(1); }

(async () => {
  const { default: makeWASocket } = require('@whiskeysockets/baileys');
  const auth = await useDbAuthState();
  await auth.wipe();
  const fresh = await useDbAuthState();
  let done = false;
  const start = () => {
    const sock = makeWASocket({ auth: fresh.state, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Oracle Ads', 'Chrome', '120.0'] });
    sock.ev.on('creds.update', fresh.saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') { done = true; await setKV('status', { ok: true, paired: true, at: new Date().toISOString() }); await setKV('pairing', { code: null, phone: PHONE, done: true }); console.log('✅ Pareado'); setTimeout(() => process.exit(0), 5000); }
      if (connection === 'close' && !done) { const c = lastDisconnect?.error?.output?.statusCode; console.log('fechou', c); if (c === 515 || c === 503 || c === 408) setTimeout(start, 1500); }
    });
    if (!fresh.state.creds.registered) setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE);
        const pretty = code.match(/.{1,4}/g).join('-');
        console.log('CÓDIGO DE PAREAMENTO:', pretty);
        await setKV('pairing', { code: pretty, phone: PHONE, at: new Date().toISOString(), done: false });
      } catch (e) { console.error('erro ao pedir código', e.message); }
    }, 3000);
  };
  start();
  setTimeout(() => { if (!done) { console.error('Tempo esgotado sem pareamento'); process.exit(1); } }, 6 * 60000);
})();
