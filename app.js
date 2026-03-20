// =============================================================================
// app.js — Lumina AI · HDR Fusion Engine
//
// Tradução fiel do Solucao_anti_estouro.py para JavaScript puro.
// Roda 100% no navegador via Canvas API — zero servidores.
//
// DOIS MODOS:
//   Padrão      → exposure_boost=2.5, mask_hardening=12.0  (valores originais)
//   Personalizado → parâmetros definidos pelos sliders
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
const slRange         = document.getElementById('slRange');
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

// Estado global
let selectedFile = null;
let resultBlob   = null; // Blob do resultado — usado para download confiável
let toastTimer   = null;

// ── Upload ────────────────────────────────────────────────────────────────────

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
  if (!allowed.includes(file.type)) return showToast('Formato inválido. Use PNG, JPG ou WEBP.');
  if (file.size > 20 * 1024 * 1024) return showToast('Arquivo muito grande. Máximo: 20MB.');

  selectedFile = file;
  uploadName.textContent = '✓ ' + file.name;
  btnProcDefault.disabled = false;
  btnProc.disabled = false;
  step1.classList.add('done');
  step2.classList.add('done');
}

// ── Sliders de parâmetros ─────────────────────────────────────────────────────

expSlider.addEventListener('input', () => {
  expVal.textContent = parseFloat(expSlider.value).toFixed(1) + '×';
});
maskSlider.addEventListener('input', () => {
  maskVal.textContent = maskSlider.value;
});

// ── Comparador antes/depois ───────────────────────────────────────────────────
// Usa eventos de mouse e touch diretamente — o input[range] nativo não funciona
// bem como hotspot de área inteira em todos os browsers.

const slDragArea = document.getElementById('slDragArea');
let isDragging = false;

function moveSlider(clientX) {
  const rect = sliderWrap.getBoundingClientRect();
  let pct = (clientX - rect.left) / rect.width;
  pct = Math.min(Math.max(pct, 0), 1); // clamp 0–1
  const v = pct * 100;
  slAfter.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  slDiv.style.left = v + '%';
}

// Mouse
slDragArea.addEventListener('mousedown', (e) => {
  isDragging = true;
  moveSlider(e.clientX);
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (isDragging) moveSlider(e.clientX);
});
window.addEventListener('mouseup', () => { isDragging = false; });

// Touch
slDragArea.addEventListener('touchstart', (e) => {
  isDragging = true;
  moveSlider(e.touches[0].clientX);
  e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => {
  if (isDragging) moveSlider(e.touches[0].clientX);
}, { passive: true });
window.addEventListener('touchend', () => { isDragging = false; });

// ── Download ──────────────────────────────────────────────────────────────────
// Cria um link temporário com o Blob — garante que o arquivo PNG correto é baixado.

btnDl.addEventListener('click', (e) => {
  e.preventDefault();
  if (!resultBlob) return showToast('Nenhuma imagem processada ainda.');

  const url  = URL.createObjectURL(resultBlob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'lumina_' + (selectedFile ? selectedFile.name.replace(/\.[^.]+$/, '') + '.png' : 'resultado.png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Libera a URL temporária após o download iniciar
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// ── Botão: Modo Padrão ────────────────────────────────────────────────────────
// Idêntico ao Python: engine.process(img, exposure_boost=2.5, mask_hardening=12.0)

btnProcDefault.addEventListener('click', async () => {
  if (!selectedFile) return;
  await runProcessing(selectedFile, 2.5, 12.0, btnProcDefault);
});

// ── Botão: Modo Personalizado ─────────────────────────────────────────────────

btnProc.addEventListener('click', async () => {
  if (!selectedFile) return;
  await runProcessing(
    selectedFile,
    parseFloat(expSlider.value),
    parseFloat(maskSlider.value),
    btnProc
  );
});

// ── Orquestrador de processamento ─────────────────────────────────────────────

async function runProcessing(file, exposureBoost, maskHardening, btn) {
  btn.disabled = true;
  btn.classList.add('loading');
  loadOverlay.classList.add('on');
  btnDl.style.display = 'none';

  await sleep(30); // Deixa o browser renderizar o overlay

  try {
    setMsg('Decodificando imagem...');
    const bitmap = await createImageBitmap(file);

    setMsg('Calculando luminância...');
    await sleep(10);

    setMsg('Aplicando gamma boost...');
    await sleep(10);

    // Processa — retorna Blob PNG
    const blob = await processHDR(bitmap, exposureBoost, maskHardening);
    resultBlob = blob; // Salva para o download

    setMsg('Montando comparação...');

    // Cria URLs de objeto para exibição nas tags <img>
    const beforeUrl = URL.createObjectURL(file);
    const afterUrl  = URL.createObjectURL(blob);

    // Aguarda as duas imagens carregarem antes de mostrar o comparador
    await Promise.all([
      loadImg(imgBefore, beforeUrl),
      loadImg(imgAfter,  afterUrl),
    ]);

    // Exibe o comparador
    placeholder.style.display = 'none';
    sliderWrap.style.display  = 'block';

    // Começa o traço no meio
    const rect = sliderWrap.getBoundingClientRect();
    // Se o card ainda não tem dimensões (display:none antes), força 50%
    slAfter.style.clipPath = 'inset(0 50% 0 0)';
    slDiv.style.left = '50%';

    btnDl.style.display = 'block';
    step3.classList.add('done');

  } catch (err) {
    showToast('Erro ao processar: ' + err.message);
    console.error(err);
  } finally {
    loadOverlay.classList.remove('on');
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// Carrega src em imgEl e resolve quando a imagem estiver pronta
function loadImg(imgEl, src) {
  return new Promise((resolve, reject) => {
    imgEl.onload  = resolve;
    imgEl.onerror = reject;
    imgEl.src     = src;
  });
}

// =============================================================================
// HDR FUSION ENGINE
// Tradução linha a linha do Solucao_anti_estouro.py
//
// Retorna um Blob PNG (via canvas.toBlob) em vez de dataURL.
// Isso garante que o arquivo de download está 100% correto.
// =============================================================================

async function processHDR(bitmap, exposureBoost, maskHardening) {
  const W = bitmap.width;
  const H = bitmap.height;
  const N = W * H;

  // Desenha a imagem no canvas de trabalho para extrair os pixels
  canvas.width  = W;
  canvas.height = H;
  ctx.drawImage(bitmap, 0, 0);
  const src = ctx.getImageData(0, 0, W, H).data;

  // ── 1. Normalizar para Float32 [0, 1] ──────────────────────────────────────
  // Python: img_t = TF.to_tensor(img_pil)  →  valores em [0, 1]
  const R = new Float32Array(N);
  const G = new Float32Array(N);
  const B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    R[i] = src[i * 4    ] / 255;
    G[i] = src[i * 4 + 1] / 255;
    B[i] = src[i * 4 + 2] / 255;
  }

  // ── 2. Luminância original ─────────────────────────────────────────────────
  // Python: lum_original = 0.2126*R + 0.7152*G + 0.0722*B
  const lumOrig = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lumOrig[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
  }

  // ── 3. Versão "flash" via gamma inverso ────────────────────────────────────
  // Python: gamma_factor = 1.0 / (exposure_boost * 0.6)
  //         high_exposure = torch.pow(img_t, gamma_factor)
  const gamma = 1.0 / (exposureBoost * 0.6);
  const hR = new Float32Array(N);
  const hG = new Float32Array(N);
  const hB = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Math.max(x, 1e-8): evita pow(0, negativo) → Infinity
    hR[i] = Math.pow(Math.max(R[i], 1e-8), gamma);
    hG[i] = Math.pow(Math.max(G[i], 1e-8), gamma);
    hB[i] = Math.pow(Math.max(B[i], 1e-8), gamma);
  }

  // ── 4. Boost de saturação nas sombras ─────────────────────────────────────
  // Python: lum_high = _get_luminance(high_exposure)
  //         high_exposure = high_exposure * (1 + 0.3 * (1 - lum_high))
  //         high_exposure = torch.clamp(high_exposure, 0, 1)
  const lumHigh = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lumHigh[i] = 0.2126 * hR[i] + 0.7152 * hG[i] + 0.0722 * hB[i];
  }
  for (let i = 0; i < N; i++) {
    const boost = 1 + 0.3 * (1 - lumHigh[i]);
    hR[i] = Math.min(hR[i] * boost, 1.0);
    hG[i] = Math.min(hG[i] * boost, 1.0);
    hB[i] = Math.min(hB[i] * boost, 1.0);
  }

  // ── 5. Máscara sigmoid ─────────────────────────────────────────────────────
  // Python: mask = torch.sigmoid((lum_original - 0.5) * mask_hardening)
  // 1.0 = pixel claro (céu)  → mantém original
  // 0.0 = pixel escuro       → usa versão flash
  const mask = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mask[i] = 1.0 / (1.0 + Math.exp(-(lumOrig[i] - 0.5) * maskHardening));
  }

  // ── 6. Guided Filter na máscara ───────────────────────────────────────────
  // Python: mask = self._guided_filter(lum_original, mask, r=8, eps=1e-4)
  setMsg('Aplicando Guided Filter...');
  await sleep(10);
  const maskF = guidedFilter(lumOrig, mask, W, H, 8, 1e-4);

  // ── 7. Fusão final ─────────────────────────────────────────────────────────
  // Python: final_image = img_t * mask + high_exposure * (1.0 - mask)
  const out = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const m  = maskF[i];
    const im = 1.0 - m;
    out[i * 4    ] = Math.round((R[i] * m + hR[i] * im) * 255);
    out[i * 4 + 1] = Math.round((G[i] * m + hG[i] * im) * 255);
    out[i * 4 + 2] = Math.round((B[i] * m + hB[i] * im) * 255);
    out[i * 4 + 3] = 255;
  }

  // Escreve os pixels processados de volta no canvas
  ctx.putImageData(new ImageData(out, W, H), 0, 0);

  // Converte canvas → Blob PNG
  // Usamos toBlob em vez de toDataURL: mais confiável, sem limite de tamanho,
  // e o arquivo baixado é exatamente este blob.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob retornou nulo.'));
      },
      'image/png'
    );
  });
}

// =============================================================================
// GUIDED FILTER
// Port do _guided_filter() do Python.
// Usa Summed Area Table (SAT) — equivalente ao F.avg_pool2d do PyTorch,
// mas com complexidade O(1) por pixel.
// =============================================================================

function guidedFilter(guide, src, W, H, r, eps) {
  const N = W * H;

  // Box blur via SAT — equivalente ao F.avg_pool2d(x, kernel=2r+1, padding=r)
  function boxBlur(arr) {
    const sat = new Float64Array((W + 1) * (H + 1));
    for (let y = 1; y <= H; y++) {
      for (let x = 1; x <= W; x++) {
        sat[y * (W + 1) + x] =
            arr[(y - 1) * W + (x - 1)]
          + sat[(y - 1) * (W + 1) + x]
          + sat[y       * (W + 1) + (x - 1)]
          - sat[(y - 1) * (W + 1) + (x - 1)];
      }
    }
    const out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(y - r, 0);
      const y1 = Math.min(y + r, H - 1);
      for (let x = 0; x < W; x++) {
        const x0   = Math.max(x - r, 0);
        const x1   = Math.min(x + r, W - 1);
        const area = (y1 - y0 + 1) * (x1 - x0 + 1);
        const sum  =
            sat[(y1 + 1) * (W + 1) + (x1 + 1)]
          - sat[y0       * (W + 1) + (x1 + 1)]
          - sat[(y1 + 1) * (W + 1) + x0      ]
          + sat[y0       * (W + 1) + x0      ];
        out[y * W + x] = sum / area;
      }
    }
    return out;
  }

  const gp = new Float32Array(N);
  const gg = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    gp[i] = guide[i] * src[i];
    gg[i] = guide[i] * guide[i];
  }

  const mean_I  = boxBlur(guide);
  const mean_p  = boxBlur(src);
  const mean_Ip = boxBlur(gp);
  const mean_II = boxBlur(gg);

  const a = new Float32Array(N);
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cov  = mean_Ip[i] - mean_I[i] * mean_p[i]; // cov(I, p)
    const varI = mean_II[i] - mean_I[i] * mean_I[i]; // var(I)
    a[i] = cov / (varI + eps);
    b[i] = mean_p[i] - a[i] * mean_I[i];
  }

  const mean_a = boxBlur(a);
  const mean_b = boxBlur(b);

  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = Math.min(Math.max(mean_a[i] * guide[i] + mean_b[i], 0.0), 1.0);
  }
  return out;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMsg(msg) {
  loadMsg.textContent = msg;
}

function showToast(msg, duration = 4000) {
  toast.textContent = msg;
  toast.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('on'), duration);
}