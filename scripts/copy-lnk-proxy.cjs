const fs = require('fs');
const path = require('path');

// Copia o proxy do encurtador (lnk.elkys.com.br) para dist/lnk/ apos o build.
//
// Necessario porque o deploy FTP roda com dangerous-clean-slate: o public_html
// e apagado e re-subido a cada push. Se o proxy nao fizer parte de dist/, a
// pasta public_html/lnk e perdida em todo deploy e o encurtador volta a 404.
//
// Origem:  docs/lnk-proxy/  (index.php + .htaccess)
// Destino: dist/lnk/        (vira public_html/lnk/ na Hostinger)

const sourceDir = path.join(__dirname, '..', 'docs', 'lnk-proxy');
const destDir = path.join(__dirname, '..', 'dist', 'lnk');
const files = ['index.php', '.htaccess'];

try {
  if (!fs.existsSync(sourceDir)) {
    console.error('❌ Pasta docs/lnk-proxy/ não encontrada');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(__dirname, '..', 'dist'))) {
    console.error('❌ Pasta dist/ não encontrada. Execute o build primeiro.');
    process.exit(1);
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (const file of files) {
    const source = path.join(sourceDir, file);
    if (!fs.existsSync(source)) {
      console.error(`❌ Arquivo ${file} não encontrado em docs/lnk-proxy/`);
      process.exit(1);
    }
    fs.copyFileSync(source, path.join(destDir, file));
  }

  console.log('✅ Proxy do encurtador copiado para dist/lnk/ com sucesso!');
  console.log('📁 lnk.elkys.com.br sobrevive ao clean-slate do deploy');
} catch (error) {
  console.error('❌ Erro ao copiar o proxy do encurtador:', error.message);
  process.exit(1);
}
