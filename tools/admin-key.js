// Prépare le déblocage administrateur au moment de la compilation (GitHub Actions).
// Entrées : ADMIN_PW (secret TCO_ADMIN_PASSWORD) et le fichier de la clé privée déchiffrée (argument 1).
// Sortie : admin.js (argument 2), contenant la clé privée chiffrée par le mot de passe administrateur.
// Le mot de passe lui-même n'est jamais écrit dans l'application.
const fs = require('fs');
const crypto = require('crypto');
const [, , keyFile, outFile] = process.argv;
const pw = process.env.ADMIN_PW || '';
if (!pw) { fs.writeFileSync(outFile, 'window.TCO_ADMIN = null;\n'); console.log('Pas de mot de passe administrateur.'); process.exit(0); }
const der = crypto.createPrivateKey(fs.readFileSync(keyFile)).export({ type: 'pkcs8', format: 'der' });
const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), iter = 300000;
const k = crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), salt, iter, 32, 'sha256');
const c = crypto.createCipheriv('aes-256-gcm', k, iv);
const ct = Buffer.concat([c.update(der), c.final(), c.getAuthTag()]);
const o = { salt: salt.toString('base64'), iv: iv.toString('base64'), iter, key: ct.toString('base64') };
fs.writeFileSync(outFile, `window.TCO_ADMIN = ${JSON.stringify(o)};\n`);
console.log('Déblocage administrateur prêt.');
