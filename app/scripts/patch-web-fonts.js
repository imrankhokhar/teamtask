/**
 * After `npx expo export --platform web`, ensure icon fonts work on servers/nginx:
 * - keep a flat /fonts/Ionicons.ttf (no @ in URL)
 * - inject @font-face preload into index.html
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const srcFont = path.join(__dirname, '..', 'assets', 'fonts', 'Ionicons.ttf');
const publicFont = path.join(__dirname, '..', 'public', 'fonts', 'Ionicons.ttf');
const distFonts = path.join(dist, 'fonts');
const distFont = path.join(distFonts, 'Ionicons.ttf');
const indexHtml = path.join(dist, 'index.html');

function main() {
  if (!fs.existsSync(dist) || !fs.existsSync(indexHtml)) {
    console.error('dist/index.html missing — run expo export first');
    process.exit(1);
  }
  const fontSrc = fs.existsSync(srcFont) ? srcFont : publicFont;
  if (!fs.existsSync(fontSrc)) {
    console.error('Ionicons.ttf missing in assets/fonts or public/fonts');
    process.exit(1);
  }
  fs.mkdirSync(distFonts, { recursive: true });
  fs.copyFileSync(fontSrc, distFont);

  let html = fs.readFileSync(indexHtml, 'utf8');
  if (!html.includes('/fonts/Ionicons.ttf')) {
    const inject = [
      '<link rel="preload" href="/fonts/Ionicons.ttf" as="font" type="font/ttf" crossorigin />',
      '<style>',
      "@font-face { font-family: 'Ionicons'; src: url('/fonts/Ionicons.ttf') format('truetype'); font-display: block; }",
      '</style>',
    ].join('');
    html = html.replace('</head>', `${inject}</head>`);
  }
  if (!html.includes('viewport-fit=cover')) {
    html = html.replace(
      'width=device-width, initial-scale=1, shrink-to-fit=no',
      'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover'
    );
  }
  if (!html.includes('overflow-x:hidden')) {
    html = html.replace(
      '</head>',
      '<style>html,body,#root{max-width:100%;overflow-x:hidden;box-sizing:border-box}</style></head>'
    );
  }
  if (!html.includes('rel="manifest"')) {
    const pwa = [
      '<link rel="manifest" href="/manifest.json" />',
      '<meta name="mobile-web-app-capable" content="yes" />',
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
      '<meta name="apple-mobile-web-app-title" content="TeamTask" />',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    ].join('');
    html = html.replace('</head>', `${pwa}</head>`);
  }
  if (!html.includes('pwa-register.js')) {
    html = html.replace('</body>', '<script src="/pwa-register.js" defer></script></body>');
  }
  const build = String(Date.now());
  const distSw = path.join(dist, 'sw.js');
  const distReg = path.join(dist, 'pwa-register.js');
  if (fs.existsSync(distReg)) {
    let reg = fs.readFileSync(distReg, 'utf8');
    reg = reg.replace(/__BUILD__/g, build);
    fs.writeFileSync(distReg, reg);
  }
  if (fs.existsSync(distSw)) {
    let sw = fs.readFileSync(distSw, 'utf8');
    if (!sw.includes(build)) {
      sw = `/* build ${build} */\n` + sw;
      fs.writeFileSync(distSw, sw);
    }
  }

  fs.writeFileSync(indexHtml, html);
  console.log('Patched web fonts + PWA ->', distFont);
}

main();
