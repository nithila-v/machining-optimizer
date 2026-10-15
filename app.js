'use strict';
let model = null;
const $ = (id) => document.getElementById(id);
const form = $('optimizerForm');
const button = $('optimizeButton');
const error = $('errorMessage');

async function loadModel() {
  try {
    const response = await fetch('./model.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Could not load model file.');
    model = await response.json();
    button.disabled = false;
    $('connectionStatus').textContent = navigator.onLine ? 'Model ready' : 'Ready offline';
    $('connectionStatus').classList.toggle('offline', !navigator.onLine);
  } catch (e) {
    $('connectionStatus').textContent = 'Model unavailable';
    error.hidden = false;
    error.textContent = 'The prediction model could not load. Connect to the internet once and refresh the app.';
  }
}

function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }
function solveLowerTriangular(L, b) {
  const x = new Array(b.length).fill(0);
  for (let i = 0; i < b.length; i++) {
    let v = b[i];
    for (let j = 0; j < i; j++) v -= L[i][j] * x[j];
    x[i] = v / L[i][i];
  }
  return x;
}
function predictPower(features) {
  const scaled = features.map((v, i) => (v - model.scaler_mean[i]) / model.scaler_scale[i]);
  const n = model.X_train_scaled.length;
  const cross = new Array(n);
  const ls = model.kernel_length_scales;
  for (let i = 0; i < n; i++) {
    let d2 = 0;
    for (let j = 0; j < scaled.length; j++) {
      const d = (scaled[j] - model.X_train_scaled[i][j]) / ls[j];
      d2 += d * d;
    }
    cross[i] = model.kernel_constant * Math.exp(-0.5 * d2);
  }
  const mean = dot(cross, model.alpha) * model.y_train_std + model.y_train_mean[0];
  const v = solveLowerTriangular(model.cholesky_L, cross);
  let variance = model.kernel_constant + model.kernel_white_noise - dot(v, v);
  variance = Math.max(variance, 0);
  return Math.max(mean, 0);
}
function optimize(totalDepth, toolDiameter, cutLength) {
  const rows = [];
  for (const doc of model.doc_candidates_mm) {
    let passes = Math.ceil(totalDepth / doc);
    let finalDoc = totalDepth - doc * (passes - 1);
    if (finalDoc <= 1e-8) { passes -= 1; finalDoc = doc; }
    finalDoc = Number(finalDoc.toFixed(8));
    if (finalDoc <= 0 || finalDoc > doc + 1e-7) continue;
    const passDepths = Array(Math.max(passes - 1, 0)).fill(doc).concat([finalDoc]);
    for (const pair of model.setting_pairs) {
      const speed = Number(pair[0]);
      const feedPerRev = Number(pair[1]);
      const rpm = 1000 * speed / (Math.PI * toolDiameter);
      const feedMin = feedPerRev * rpm;
      const passPowers = passDepths.map(passDoc => predictPower([speed, feedPerRev, passDoc, model.Kc * passDoc * feedPerRev]));
      const avgPower = passPowers.reduce((a, b) => a + b, 0) / passPowers.length;
      const energy = cutLength == null ? null : passPowers.reduce((a, b) => a + b, 0) * (cutLength / feedMin) / 60;
      rows.push({doc, passes, finalDoc, rpm, feedMin, avgPower, energy});
    }
  }
  rows.sort((a,b) => cutLength == null ? a.avgPower-b.avgPower : a.energy-b.energy);
  return rows.slice(0, 5);
}
function fmt(value, digits=2) { return Number(value).toLocaleString(undefined, {minimumFractionDigits: digits, maximumFractionDigits: digits}); }
function metric(label, value, unit='') {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}${unit ? ` <small>${unit}</small>` : ''}</div></div>`;
}
function render(rows, cutLength) {
  const list = $('resultsList'); list.innerHTML = '';
  rows.forEach((r, i) => {
    const card = document.createElement('article');
    card.className = `result-card${i === 0 ? ' best' : ''}`;
    card.innerHTML = `<div class="card-top"><div><div class="option-label">OPTION ${String(i+1).padStart(2,'0')} · DOC ${fmt(r.doc)} mm</div><div class="option-title">${r.passes} ${r.passes === 1 ? 'pass' : 'passes'}</div></div>${i === 0 ? '<span class="best-chip">LOWEST ESTIMATE</span>' : ''}</div><div class="metrics">${metric('Final pass DOC',fmt(r.finalDoc),'mm')}${metric('Spindle speed',fmt(r.rpm,0),'RPM')}${metric('Feed rate',fmt(r.feedMin,1),'mm/min')}${metric('Average predicted power',fmt(r.avgPower,3),'kW')}${cutLength == null ? '' : metric('Total predicted energy',fmt(r.energy,5),'kWh')}${metric('Target depth',fmt(Number($('totalDepth').value)),'mm')}</div>`;
    list.appendChild(card);
  });
  $('resultCount').textContent = `TOP ${rows.length} OPTIONS`;
  $('rankingNote').textContent = cutLength == null
    ? 'Ranked by average predicted cutting power. Power is a rate, not a quantity to sum across passes. Add cutting path length to estimate total energy.'
    : 'Ranked by estimated total energy, using predicted power × cutting time. Assumes the entered path length and selected feed apply to every pass.';
  $('resultsSection').hidden = false;
}
form.addEventListener('submit', event => {
  event.preventDefault(); error.hidden = true;
  const depth = Number($('totalDepth').value);
  const diameter = Number($('toolDiameter').value);
  const lengthText = $('cutLength').value.trim();
  const length = lengthText === '' ? null : Number(lengthText);
  if (!model) { error.textContent = 'Model is still loading. Try again shortly.'; error.hidden = false; return; }
  if (!Number.isFinite(depth) || depth <= 0 || !Number.isFinite(diameter) || diameter <= 0 || (length !== null && (!Number.isFinite(length) || length <= 0))) {
    error.textContent = 'Enter positive numbers for target depth and tool diameter. Cutting length must also be positive when supplied.'; error.hidden = false; return;
  }
  try { const rows = optimize(depth, diameter, length); if (!rows.length) throw new Error('No valid candidate settings were found.'); render(rows, length); $('resultsSection').scrollIntoView({behavior:'smooth',block:'start'}); }
  catch (e) { error.textContent = `Could not calculate recommendations: ${e.message}`; error.hidden = false; }
});
window.addEventListener('online', () => { if (model) { $('connectionStatus').textContent='Model ready'; $('connectionStatus').classList.remove('offline'); } });
window.addEventListener('offline', () => { if (model) { $('connectionStatus').textContent='Ready offline'; $('connectionStatus').classList.add('offline'); } });

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('installPanel').hidden = false; $('installButton').hidden = false; $('installHelp').hidden = true; });
$('installButton').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('installButton').hidden = true;
});
window.addEventListener('appinstalled', () => { $('installPanel').hidden = true; $('installHelp').hidden = true; });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(() => {
    $('installPanel').hidden = false;
    if (!deferredInstallPrompt && /Android/i.test(navigator.userAgent)) $('installHelp').hidden = false;
  }).catch(() => {}));
}
loadModel();
