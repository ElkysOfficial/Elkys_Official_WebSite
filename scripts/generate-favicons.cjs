// Gera o conjunto completo de favicons a partir do PNG fonte do logo Elkys.
// Roda uma vez via `node scripts/generate-favicons.cjs` — nao entra no build.
const sharp = require("sharp");
const pngToIco = require("png-to-ico").default;
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "public", "imgs", "icons", "favicon.png");
const OUT = path.resolve(__dirname, "..", "public");

async function main() {
  const sizes = [16, 32, 48, 180, 192, 512];
  const buffers = {};

  for (const size of sizes) {
    buffers[size] = await sharp(SRC).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }

  fs.writeFileSync(path.join(OUT, "favicon-16.png"), buffers[16]);
  fs.writeFileSync(path.join(OUT, "favicon-32.png"), buffers[32]);
  fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), buffers[180]);
  fs.writeFileSync(path.join(OUT, "icon-192.png"), buffers[192]);
  fs.writeFileSync(path.join(OUT, "icon-512.png"), buffers[512]);

  const icoBuffer = await pngToIco([buffers[16], buffers[32], buffers[48]]);
  fs.writeFileSync(path.join(OUT, "favicon.ico"), icoBuffer);

  console.log("Favicons gerados em public/:");
  console.log("  favicon.ico (16+32+48 multi-res)");
  console.log("  favicon-16.png, favicon-32.png");
  console.log("  apple-touch-icon.png (180)");
  console.log("  icon-192.png, icon-512.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
