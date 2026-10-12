// Pareamento do número do bot: mostra no painel do dono um QR code (escaneie pelo celular do bot)
// e um código de 8 letras (WhatsApp › Aparelhos conectados › Conectar com número de telefone).
const pino = require('pino');
const QRCode = require('qrcode');
const { useDbAuthState, setKV } = require('./db-auth');

const PHONE = String(process.env.PHONE || '').replace(/\D/g, '');
const LIMITE = 8 * 60000;

(async () => {
  const { default: makeWASocket, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  console.log('Versão do WhatsApp Web:', version ? version.join('.') : 'padrão');
  const old = await useDbAuthState(); await old.wipe();
  const auth = await useDbAuthState();
  let done = false, code = null, requested = false, tries = 0;
  const save = (extra) => setKV('pairing', { phone: PHONE, code, done, at: new Date().toISOString(), ...extra });

  const start = () => {
    tries++;
    const sock = makeWASocket({ version, auth: auth.state, logger: pino({ level: 'silent' }), printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'), connectTimeoutMs: 60000, keepAliveIntervalMs: 15000, syncFullHistory: false, markOnlineOnConnect: false });
    sock.ev.on('creds.update', auth.saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr && !done) {
        const png = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
        if (PHONE.length >= 12 && !requested) {
          requested = true;
          try { code = (await sock.requestPairingCode(PHONE)).match(/.{1,4}/g).join('-'); console.log('CÓDIGO:', code); }
          catch (e) { console.log('código indisponível:', e.message); }
        }
        await save({ qr: png });
        console.log('QR atualizado');
      }
      if (connection === 'open') {
        done = true;
        await setKV('status', { ok: true, paired: true, at: new Date().toISOString() });
        await save({ qr: null, code: null });
        console.log('✅ Pareado');
        setTimeout(() => process.exit(0), 6000);
      }
      if (connection === 'close' && !done) {
        const st = lastDisconnect?.error?.output?.statusCode;
        console.log('conexão fechada', st);
        if (tries > 12) return;
        // 515 = reinício pedido logo após parear: reconecta com as credenciais novas
        if (st !== 515 && !auth.state.creds.registered) requested = false;
        setTimeout(start, st === 515 ? 500 : 2500);
      }
    });
  };
  start();
  setTimeout(async () => { if (!done) { await save({ qr: null, expired: true }); console.error('Tempo esgotado sem pareamento'); process.exit(1); } }, LIMITE);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
