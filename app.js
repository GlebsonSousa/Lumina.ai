// =============================================================================
// app.js — Lumina AI · HDR Fusion Engine (VERSÃO CORRIGIDA)
// =============================================================================

// ── Referências DOM ───────────────────────────────────────────────────────────
const uploadZone      = document.getElementById('uploadZone');
const fileInput       = document.getElementById('fileInput');
const uploadName      = document.getElementById('uploadName');
const expSlider       = document.getElementById('exposureBoost');
const maskSlider      = document.getElementById('maskHard');
const expVal          = document.getElementById('expVal');
const maskVal         = document.getElementById('maskVal');
const btnProcDefault  = document.getElementById('btnProcDefault');
const btnProc         = document.getElementById('btnProc');
const btnDl           = document.getElementById('btnDl');
const placeholder     = document.getElementById('placeholder');
const sliderWrap      = document.getElementById('sliderWrap');
const imgBefore       = document.getElementById('imgBefore');
const imgAfter        = document.getElementById('imgAfter');
const slDiv           = document.getElementById('slDiv');
const slAfter         = document.getElementById('slAfter');
const loadOverlay     = document.getElementById('loadOverlay');
const loadMsg         = document.getElementById('loadMsg');
const toast           = document.getElementById('toast');

const canvas = document.getElementById('workCanvas');
const ctx    = canvas.getContext('2d');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

let selectedFile = null;
let resultBlob   = null;
let toastTimer   = null;

// ── Upload & Eventos ──────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('over');
  handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return showToast('Formato inválido.');
  selectedFile = file;
  uploadName.textContent = '✓ ' + file.name;
  btnProcDefault.disabled = false;
  btnProc.disabled = false;
  step1.classList.add('done');
  step2.classList.add('done');
}

expSlider.addEventListener('input', () => { expVal.textContent = parseFloat(expSlider.value).toFixed(1) + '×'; });
maskSlider.addEventListener('input', () => { maskVal.textContent = maskSlider.value; });

// ── Comparador Antes/Depois ──────────────────────────────────────────────────
const slDragArea = document.getElementById('slDragArea');
let isDragging = false;

function moveSlider(clientX) {
  const rect = sliderWrap.getBoundingClientRect();
  let pct = (clientX - rect.left) / rect.width;
  pct = Math.min(Math.max(pct, 0), 1);
  const v = pct * 100;
  slAfter.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  slDiv.style.left = v + '%';
}

slDragArea.addEventListener('mousedown', (e) => { isDragging = true; moveSlider(e.clientX); });
window.addEventListener('mousemove', (e) => { if (isDragging) moveSlider(e.clientX); });
window.addEventListener('mouseup', () => { isDragging = false; });

btnDl.addEventListener('click', (e) => {
  e.preventDefault();
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lumina_' + selectedFile.name.split('.')[0] + '.png';
  link.click();
});

btnProcDefault.addEventListener('click', async () => {
  if (!selectedFile) return;
  await runProcessing(selectedFile, 2.5, 12.0, btnProcDefault);
});

btnProc.addEventListener('click', async () => {
  if (!selectedFile) return;
  await runProcessing(selectedFile, parseFloat(expSlider.value), parseFloat(maskSlider.value), btnProc);
});

// ── Orquestrador ─────────────────────────────────────────────────────────────
async function runProcessing(file, exposureBoost, maskHardening, btn) {
  btn.disabled = true;
  loadOverlay.classList.add('on');
  btnDl.style.display = 'none';

  try {
    setMsg('Processando imagem...');
    const bitmap = await createImageBitmap(file);
    const blob = await processHDR(bitmap, exposureBoost, maskHardening);
    resultBlob = blob;

    imgBefore.src = URL.createObjectURL(file);
    imgAfter.src = URL.createObjectURL(blob);

    placeholder.style.display = 'none';
    sliderWrap.style.display  = 'block';
    slAfter.style.clipPath = 'inset(0 50% 0 0)';
    slDiv.style.left = '50%';
    btnDl.style.display = 'block';
    step3.classList.add('done');
  } catch (err) {
    showToast('Erro: ' + err.message);
  } finally {
    loadOverlay.classList.remove('on');
    btn.disabled = false;
  }
}

// ── HDR FUSION ENGINE (FIXED) ────────────────────────────────────────────────
async function processHDR(bitmap, exposureBoost, maskHardening) {
  const W = bitmap.width;
  const H = bitmap.height;
  const N = W * H;

  canvas.width = W;
  canvas.height = H;
  ctx.drawImage(bitmap, 0, 0);
  const src = ctx.getImageData(0, 0, W, H).data;

  const R = new Float32Array(N);
  const G = new Float32Array(N);
  const B = new Float32Array(N);
  const lumOrig = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    R[i] = src[i * 4] / 255;
    G[i] = src[i * 4 + 1] / 255;
    B[i] = src[i * 4 + 2] / 255;
    lumOrig[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
  }

  const gamma = 1.0 / (exposureBoost * 0.6);
  const hR = new Float32Array(N);
  const hG = new Float32Array(N);
  const hB = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    // FIX 1: Preservar a saturação calculando a proporção de cor antes do clareamento
    const l = Math.max(lumOrig[i], 1e-8);
    const ratioR = R[i] / l;
    const ratioG = G[i] / l;
    const ratioB = B[i] / l;

    // Aplica o boost na luminância
    const newLum = Math.pow(l, gamma);
    
    // Reconstrói o RGB mantendo a proporção (evita ficar cinza)
    // O multiplicador 1.1 ajuda a dar um "punch" extra na cor
    hR[i] = Math.min(newLum * ratioR * 1.1, 1.0);
    hG[i] = Math.min(newLum * ratioG * 1.1, 1.0);
    hB[i] = Math.min(newLum * ratioB * 1.1, 1.0);
  }

  // Máscara e Filtro Guia
  const mask = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mask[i] = 1.0 / (1.0 + Math.exp(-(lumOrig[i] - 0.5) * maskHardening));
  }
  const maskF = guidedFilter(lumOrig, mask, W, H, 8, 1e-4);

  // Fusão Final
  const out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const m = maskF[i];
    const im = 1.0 - m;
    
    let resR = (R[i] * m + hR[i] * im);
    let resG = (G[i] * m + hG[i] * im);
    let resB = (B[i] * m + hB[i] * im);

    // FIX 2: Curva de Contraste S-Curve simples para remover o aspecto "lavado"
    const contrast = 1.05; 
    resR = (resR - 0.5) * contrast + 0.5;
    resG = (resG - 0.5) * contrast + 0.5;
    resB = (resB - 0.5) * contrast + 0.5;

    out[i * 4]     = Math.round(Math.min(Math.max(resR, 0), 1) * 255);
    out[i * 4 + 1] = Math.round(Math.min(Math.max(resG, 0), 1) * 255);
    out[i * 4 + 2] = Math.round(Math.min(Math.max(resB, 0), 1) * 255);
    out[i * 4 + 3] = 255;
  }

  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}

// ── Guided Filter (Otimizado) ───────────────────────────────────────────────
function guidedFilter(guide, src, W, H, r, eps) {
  const N = W * H;
  function boxBlur(arr) {
    const sat = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) {
      for (let x = 1; x <= W; x++) {
        sat[y * (W + 1) + x] = arr[(y - 1) * W + (x - 1)] + sat[(y - 1) * (W + 1) + x] + sat[y * (W + 1) + (x - 1)] - sat[(y - 1) * (W + 1) + (x - 1)];
      }
    }
    const out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(y - r, 0), y1 = Math.min(y + r, H - 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(x - r, 0), x1 = Math.min(x + r, W - 1);
        out[y * W + x] = (sat[(y1 + 1) * (W + 1) + (x1 + 1)] - sat[y0 * (W + 1) + (x1 + 1)] - sat[(y1 + 1) * (W + 1) + x0] + sat[y0 * (W + 1) + x0]) / ((y1 - y0 + 1) * (x1 - x0 + 1));
      }
    }
    return out;
  }

  const mean_I = boxBlur(guide), mean_p = boxBlur(src);
  const mean_Ip = boxBlur(guide.map((g, i) => g * src[i]));
  const mean_II = boxBlur(guide.map(g => g * g));

  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const varI = mean_II[i] - mean_I[i] * mean_I[i];
    const cov = mean_Ip[i] - mean_I[i] * mean_p[i];
    a[i] = cov / (varI + eps);
    b[i] = mean_p[i] - a[i] * mean_I[i];
  }

  const ma = boxBlur(a), mb = boxBlur(b);
  return new Float32Array(N).map((_, i) => Math.min(Math.max(ma[i] * guide[i] + mb[i], 0), 1));
}

function setMsg(m) { loadMsg.textContent = m; }
function showToast(m) { toast.textContent = m; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 3000); }
