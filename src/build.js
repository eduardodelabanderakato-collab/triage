/* build.js — concatenates src/ into a single self-contained index.html at the repo root. */
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Triage — adaptive study scheduler</title>
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
${read('style.css')}</style>
</head>
<body>
<header id="top"><span class="brand">Triage</span><span class="sub">45 · 1600 · PEAKSCORE</span></header>
<main id="view"></main>
<nav id="tabs">
<button data-tab="today" class="active">Today</button>
<button data-tab="log">Log</button>
<button data-tab="subjects">Subjects</button>
</nav>
<script type="application/json" id="app-state"></script>
<script>
${read('seed.js')}
${read('engine.js')}
${read('app.js')}</script>
</body>
</html>
`;
const out = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(out, html);
console.log('built ' + out + ' (' + (html.length / 1024).toFixed(1) + ' kB)');
