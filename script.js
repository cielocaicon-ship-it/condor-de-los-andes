'use strict';
/* ==========================================================================
   CÓNDOR DE LOS ANDES · Saga de Petunia
   Petunia roba una máquina del tiempo en 2030 para cambiar la historia de
   Colombia. Tú y Nucita la persiguen época por época. En cada época tu avión
   y los enemigos son de ese año.
   Secciones:
    1. Utilidades        2. Guardado          3. Sonido (Web Audio)
    4. Motor 3D y texturas                    5. Modelos (Nucita, pilotos, aviones, enemigos)
    6. Escenarios        7. Niveles           8. Entrada (teclado, táctil, giroscopio)
    9. Jugador          10. Armas y efectos  11. Enemigos y jefes
   12. Nucita           13. HUD y pantallas  14. Bucle principal
   ========================================================================== */

// =====================================================================
// 1. UTILIDADES
// =====================================================================
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const elegir = arr => arr[(Math.random() * arr.length) | 0];
const suave = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDif = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));
const ES_TACTIL = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const PI = Math.PI;
const TECHO = 320; // altura máxima de vuelo

// Números "aleatorios" repetibles para que los escenarios salgan siempre igual
let _semilla = 1;
function srand(s) { _semilla = s % 2147483647; if (_semilla <= 0) _semilla += 2147483646; }
function rnd() { _semilla = (_semilla * 16807) % 2147483647; return (_semilla - 1) / 2147483646; }
const rr = (a, b) => a + rnd() * (b - a);
const elegirR = arr => arr[(rnd() * arr.length) | 0];

// Ruido suave para montañas y colinas
function hash2(x, y, s) { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
function ruido(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), u), lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), u), v);
}
function fbm(x, y, s = 0) { let t = 0, a = 1, f = 1, n = 0; for (let i = 0; i < 4; i++) { t += ruido(x * f, y * f, s + i * 13) * a; n += a; a *= 0.5; f *= 2; } return t / n; }

// =====================================================================
// 2. GUARDADO (localStorage)
// =====================================================================
const Guardado = {
  get(k, d) { try { const v = localStorage.getItem('condorT_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('condorT_' + k, JSON.stringify(v)); } catch (e) { } }
};

// =====================================================================
// 3. SONIDO (todo generado con Web Audio, sin archivos)
// =====================================================================
const Sonido = {
  ctx: null, master: null, ruidoBuf: null, m1: null, m2: null, mFiltro: null, mGain: null,
  jFiltro: null, jGain: null, jet: false,
  iniciar() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ruidoBuf = buf;
    // Motor de hélice: dos osciladores graves con un filtro
    this.m1 = c.createOscillator(); this.m1.type = 'sawtooth'; this.m1.frequency.value = 60;
    this.m2 = c.createOscillator(); this.m2.type = 'square'; this.m2.frequency.value = 30;
    this.mFiltro = c.createBiquadFilter(); this.mFiltro.type = 'lowpass'; this.mFiltro.frequency.value = 380;
    this.mGain = c.createGain(); this.mGain.gain.value = 0;
    this.m1.connect(this.mFiltro); this.m2.connect(this.mFiltro); this.mFiltro.connect(this.mGain); this.mGain.connect(this.master);
    this.m1.start(); this.m2.start();
    // Turbina de los jets: ruido filtrado
    const r = c.createBufferSource(); r.buffer = buf; r.loop = true;
    this.jFiltro = c.createBiquadFilter(); this.jFiltro.type = 'bandpass'; this.jFiltro.frequency.value = 900; this.jFiltro.Q.value = 0.8;
    this.jGain = c.createGain(); this.jGain.gain.value = 0;
    r.connect(this.jFiltro); this.jFiltro.connect(this.jGain); this.jGain.connect(this.master); r.start();
  },
  motor(vel, encendido) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (this.jet) {
      const f = 90 + vel * 1.6;
      this.m1.frequency.setTargetAtTime(f, t, 0.2); this.m2.frequency.setTargetAtTime(f * 2.01, t, 0.2);
      this.mFiltro.frequency.setTargetAtTime(700 + vel * 8, t, 0.2);
      this.mGain.gain.setTargetAtTime(encendido ? 0.022 : 0, t, 0.25);
      this.jFiltro.frequency.setTargetAtTime(500 + vel * 14, t, 0.2);
      this.jGain.gain.setTargetAtTime(encendido ? 0.11 : 0, t, 0.25);
    } else {
      const f = 38 + vel * 0.9;
      this.m1.frequency.setTargetAtTime(f, t, 0.15); this.m2.frequency.setTargetAtTime(f * 0.5, t, 0.15);
      this.mFiltro.frequency.setTargetAtTime(250 + vel * 4, t, 0.2);
      this.mGain.gain.setTargetAtTime(encendido ? 0.08 : 0, t, 0.25);
      this.jGain.gain.setTargetAtTime(0, t, 0.2);
    }
  },
  ruido(dur, vol, frec, tipo = 'lowpass', frecFin = 0, retraso = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + retraso;
    const s = c.createBufferSource(); s.buffer = this.ruidoBuf;
    const f = c.createBiquadFilter(); f.type = tipo; f.frequency.setValueAtTime(frec, t);
    if (frecFin) f.frequency.exponentialRampToValueAtTime(frecFin, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
  },
  tono(f1, f2, dur, vol, tipo = 'square', retraso = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + retraso;
    const o = c.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  disparo(jet) { if (jet) { this.tono(900, 200, 0.06, 0.04, 'sawtooth'); this.ruido(0.05, 0.1, 3000, 'bandpass'); } else { this.ruido(0.06, 0.16, 2200, 'bandpass'); this.tono(160, 70, 0.05, 0.05); } },
  cohete() { this.ruido(0.7, 0.25, 600, 'bandpass', 2600); },
  explosion(grande) { this.ruido(grande ? 1.6 : 0.9, grande ? 0.9 : 0.55, 1200, 'lowpass', 60); this.tono(110, 30, grande ? 0.8 : 0.45, 0.3, 'sine'); },
  // Ladrido de Nucita: tono que baja rápido + un poquito de ruido
  ladrido(n = 2) {
    for (let i = 0; i < n; i++) {
      const r = i * 0.2;
      this.tono(760, 400, 0.12, 0.22, 'sawtooth', r);
      this.tono(1150, 620, 0.08, 0.06, 'square', r);
      this.ruido(0.07, 0.12, 1800, 'bandpass', 0, r);
    }
  },
  premio() { this.tono(660, 990, 0.12, 0.15, 'triangle'); this.tono(990, 1480, 0.14, 0.13, 'triangle', 0.1); },
  golpe() { this.ruido(0.18, 0.4, 500, 'lowpass', 100); },
  impacto() { this.tono(1700, 1100, 0.04, 0.05, 'square'); },
  escudo() { this.tono(2400, 1800, 0.05, 0.03, 'sine'); },
  balaEnemiga() { this.tono(520, 240, 0.07, 0.03, 'square'); },
  canonazo() { this.ruido(0.9, 0.45, 400, 'lowpass', 50); this.tono(90, 30, 0.5, 0.22, 'sine'); },
  laser() { this.tono(1400, 300, 0.12, 0.045, 'sawtooth'); },
  robot() { this.tono(300, 180, 0.15, 0.06, 'square'); this.tono(420, 260, 0.15, 0.05, 'square', 0.16); },
  portal() { this.tono(200, 1600, 1.4, 0.14, 'sine'); this.tono(300, 2400, 1.4, 0.08, 'triangle', 0.1); this.ruido(1.4, 0.25, 3000, 'highpass'); }
};

// =====================================================================
// 4. MOTOR 3D (Three.js) Y TEXTURAS
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: !ES_TACTIL, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ES_TACTIL ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
$('juego').appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.fog = new THREE.Fog(0xcfeaff, 350, 1500);
const camara = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2600);
const luzCielo = new THREE.HemisphereLight(0xffffff, 0x6b5a45, 0.8); escena.add(luzCielo);
const sol = new THREE.DirectionalLight(0xfff4dd, 0.8); sol.position.set(300, 500, 200); escena.add(sol);

// Cúpula del cielo con degradado (sigue a la cámara)
const cieloGeo = new THREE.SphereGeometry(2200, 16, 12);
cieloGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cieloGeo.attributes.position.count * 3), 3));
const cielo = new THREE.Mesh(cieloGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
cielo.renderOrder = -1; escena.add(cielo);
function pintarCielo(arriba, horizonte) {
  const p = cieloGeo.attributes.position, c = cieloGeo.attributes.color;
  const a = new THREE.Color(arriba), h = new THREE.Color(horizonte), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const k = clamp(p.getY(i) / 2200, 0, 1); t.copy(h).lerp(a, Math.pow(k, 0.6)); c.setXYZ(i, t.r, t.g, t.b); }
  c.needsUpdate = true;
}

// Materiales reutilizables (uno por color) → menos trabajo para la tarjeta gráfica
const _mats = new Map(), _matsB = new Map();
function mat(color) { let m = _mats.get(color); if (!m) { m = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 10 }); _mats.set(color, m); } return m; }
function matB(color) { let m = _matsB.get(color); if (!m) { m = new THREE.MeshBasicMaterial({ color }); _matsB.set(color, m); } return m; }
const brillo = (color, op = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

// Geometrías básicas compartidas (se escalan según la pieza)
const G = {
  caja: new THREE.BoxGeometry(1, 1, 1),
  esfera: new THREE.IcosahedronGeometry(1, 1),
  esferaS: new THREE.IcosahedronGeometry(1, 0),
  bola: new THREE.SphereGeometry(1, 10, 8),
  cil: new THREE.CylinderGeometry(1, 1, 1, 10),
  cil6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cono: new THREE.ConeGeometry(1, 1, 8),
  cono4: new THREE.ConeGeometry(1, 1, 4),
  piramide: (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(PI / 4); return g; })(),
  plano: new THREE.PlaneGeometry(1, 1)
};

// Crea una pieza: geometría, color (o material), posición, escala, padre y rotación
function parte(geo, color, pos, esc, padre, rot) {
  const m = new THREE.Mesh(geo, (typeof color === 'number') ? mat(color) : color);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (esc !== undefined && esc !== null) { if (typeof esc === 'number') m.scale.setScalar(esc); else m.scale.set(esc[0], esc[1], esc[2]); }
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (padre) padre.add(m);
  return m;
}
// Grupo vacío (para piezas que se mueven o para orientar)
function grupo(padre, pos, rot, nombre) {
  const g = new THREE.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  if (nombre) g.name = nombre; if (padre) padre.add(g); return g;
}

// ---- Fusión de mallas: junta muchas piezas del mismo material en una sola (rendimiento en celulares) ----
function fusionarMallas(lista, matrizDe) {
  let total = 0;
  const conUV = !!lista[0].material.map; // las piezas con textura (fachadas) conservan sus coordenadas UV
  const geos = lista.map(m => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(matrizDe(m)); total += g.attributes.position.count; return g; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = conUV ? new Float32Array(total * 2) : null; let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  bg.computeBoundingSphere();
  return new THREE.Mesh(bg, lista[0].material);
}
const fusionable = o => o.isMesh && !o.userData.noUnir && !o.userData.ojo && !o.material.transparent && !o.material.vertexColors;
function porMaterial(mallas) { const mp = new Map(); for (const m of mallas) { if (!mp.has(m.material)) mp.set(m.material, []); mp.get(m.material).push(m); } return mp; }
// Junta solo los hijos directos de un grupo (para modelos animados por partes)
function unirHijos(gr) {
  const hijos = gr.children.filter(fusionable);
  hijos.forEach(h => { h.updateMatrix(); gr.remove(h); });
  porMaterial(hijos).forEach(l => gr.add(fusionarMallas(l, m => m.matrix)));
  return gr;
}
// Junta todo lo estático de un escenario
// ---- Edificios sólidos: mapa de alturas de todo lo construido (casas, torres, iglesias, árboles...) ----
// Antes de juntar las piezas de un escenario, cada pieza "pinta" su techo en una cuadrícula de 4 m.
// Luego altura(x, z) usa esa cuadrícula, así el avión, las balas, los enemigos y la cámara chocan con los edificios.
const SOL_TAM = 2600, SOL_CEL = 4, SOL_N = SOL_TAM / SOL_CEL;
let alturaEnObra = () => 0;
const _sb = new THREE.Box3(), _sp = new THREE.Vector3();
function crearSolidos(lista, matrices) {
  const grid = new Float32Array(SOL_N * SOL_N).fill(-1e9);
  const idx = (x, z) => { const i = Math.floor((x + SOL_TAM / 2) / SOL_CEL), j = Math.floor((z + SOL_TAM / 2) / SOL_CEL); return (i < 0 || j < 0 || i >= SOL_N || j >= SOL_N) ? -1 : j * SOL_N + i; };
  const piezas = [];
  for (const m of lista) {
    if (m.userData.noChoque || m.material === matNube) continue;
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const M = matrices.get(m); _sb.copy(g.boundingBox).applyMatrix4(M);
    if (_sb.max.y - _sb.min.y < 1.5 && _sb.max.y < 3.5) continue;          // pisos y andenes planos
    piezas.push({ g, M, minY: _sb.min.y, cx: (_sb.min.x + _sb.max.x) / 2, cz: (_sb.min.z + _sb.max.z) / 2, sx: _sb.max.x - _sb.min.x, sz: _sb.max.z - _sb.min.z });
  }
  const pintar = p => { // recorre la planta de la pieza (en sus propias coordenadas) y marca la altura de su techo
    const b = p.g.boundingBox, ex = b.max.x - b.min.x, ez = b.max.z - b.min.z;
    _sp.set(1, 0, 0).transformDirection(p.M); const escX = new THREE.Vector3().setFromMatrixColumn(p.M, 0).length(), escZ = new THREE.Vector3().setFromMatrixColumn(p.M, 2).length();
    const nx = Math.max(1, Math.ceil(ex * escX / 2.5)), nz = Math.max(1, Math.ceil(ez * escZ / 2.5));
    for (let a = 0; a <= nx; a++) for (let c = 0; c <= nz; c++) {
      _sp.set(b.min.x + ex * a / nx, b.max.y, b.min.z + ez * c / nz).applyMatrix4(p.M);
      const k = idx(_sp.x, _sp.z); if (k >= 0 && _sp.y > grid[k]) grid[k] = _sp.y;
    }
  };
  const valor = (x, z) => { const k = idx(x, z); return k < 0 ? -1e9 : grid[k]; };
  // 1) lo que nace del suelo; 2) lo que va encima de algo ya marcado (techos, torres, cúpulas). Las nubes quedan por fuera.
  let pend = piezas.filter(p => { if (p.minY <= alturaEnObra(p.cx, p.cz) + 3) { pintar(p); return false; } return true; });
  for (let vuelta = 0; vuelta < 4 && pend.length; vuelta++) pend = pend.filter(p => { if (p.minY <= valor(p.cx, p.cz) + 1.5) { pintar(p); return false; } return true; });
  return valor;
}
function unirTodo(gr) {
  gr.updateMatrixWorld(true);
  const lista = []; gr.traverse(o => { if (fusionable(o)) lista.push(o); });
  const matrices = new Map(lista.map(m => [m, m.matrixWorld.clone()]));
  gr.userData.solidos = crearSolidos(lista, matrices);
  lista.forEach(m => m.parent.remove(m));
  porMaterial(lista).forEach(l => { const f = fusionarMallas(l, m => matrices.get(m)); f.userData.propio = true; f.matrixAutoUpdate = false; f.updateMatrix(); gr.add(f); });
  return gr;
}

// ---- Texturas dibujadas con código (sin imágenes externas) ----
function texturaCanvas(w, h, dibujar) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dibujar(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}
function florPetunia(x, cx, cy, r) {
  x.fillStyle = '#ff3fa4';
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 - PI / 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.43, cy + Math.sin(a) * r * 0.43, r * 0.33, r * 0.23, a, 0, 7); x.fill(); }
  x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(cx, cy, r * 0.23, 0, 7); x.fill();
}
// Símbolo de Petunia: flor magenta con centro amarillo
const texPetunia = texturaCanvas(64, 64, (x) => {
  x.fillStyle = '#1b1022'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  florPetunia(x, 32, 32, 30);
  x.strokeStyle = '#ff3fa4'; x.lineWidth = 3; x.beginPath(); x.arc(32, 32, 29, 0, 7); x.stroke();
});
const matPetunia = new THREE.MeshBasicMaterial({ map: texPetunia, transparent: true, side: THREE.DoubleSide });
// Baldosas rojas del patio (como en la foto de Nucita)
const texBaldosa = texturaCanvas(256, 256, (x, w, h) => {
  x.fillStyle = '#8d8a83'; x.fillRect(0, 0, w, h);
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = `hsl(${9 + Math.random() * 6},${52 + Math.random() * 12}%,${40 + Math.random() * 8}%)`;
    x.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
});
texBaldosa.wrapS = texBaldosa.wrapT = THREE.RepeatWrapping; texBaldosa.repeat.set(5, 7);
// Pared pintada del patio: naranja, verde y azul con líneas blancas (como en la foto)
const texPared = texturaCanvas(256, 128, (x, w, h) => {
  x.fillStyle = '#e2703f'; x.fillRect(0, 0, w, h);
  const tri = (pts, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 5; x.stroke(); };
  tri([60, h, 150, h, 150, 20], '#3f8f4f');
  tri([150, 0, w, 0, w, 90, 150, 20], '#3e8f8c');
  x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 30); x.lineTo(60, h); x.stroke();
});
texPared.wrapS = texPared.wrapT = THREE.RepeatWrapping; texPared.repeat.set(4, 1);

// ---- Fachadas: la pared se dibuja en blanco y el color de cada casa la "tiñe" ----
function ventana(x, px, py, w, h, reja) {
  x.fillStyle = '#f4f4f4'; x.fillRect(px - 2, py - 2, w + 4, h + 4);
  const g = x.createLinearGradient(px, py, px + w, py + h); g.addColorStop(0, '#5b8fb8'); g.addColorStop(1, '#1f3a57');
  x.fillStyle = g; x.fillRect(px, py, w, h);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(px + 2, py + 2, w * 0.3, h * 0.5);
  if (reja) { x.fillStyle = '#2a2a2a'; for (let i = 1; i < 4; i++) x.fillRect(px + i * w / 4 - 1, py, 2, h); x.fillRect(px, py + h / 2 - 1, w, 2); }
}
function manchitas(x, w, h, n, a) { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * a})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }
// Casa de barrio (Cúcuta): zócalo, puerta, ventanas con rejas y segundo piso
const texFachada = texturaCanvas(128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); manchitas(x, w, h, 260, 0.04);
  x.fillStyle = '#8f8f8f'; x.fillRect(0, h - 16, w, 16);
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 60, w, 4);
  x.fillStyle = '#5a3218'; x.fillRect(52, 78, 24, 50);
  x.fillStyle = '#7a4a2a'; x.fillRect(55, 81, 8, 44); x.fillRect(65, 81, 8, 44);
  x.fillStyle = '#e0b040'; x.fillRect(69, 104, 3, 3);
  ventana(x, 12, 82, 28, 26, true); ventana(x, 88, 82, 28, 26, true);
  ventana(x, 12, 20, 24, 28, false); ventana(x, 52, 20, 24, 28, false); ventana(x, 92, 20, 24, 28, false);
});
// Casa colonial (Cartagena, Barranquilla): portón con arco y ventanas altas de madera
const texColonial = texturaCanvas(128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); manchitas(x, w, h, 260, 0.05);
  x.fillStyle = '#9a9a9a'; x.fillRect(0, h - 12, w, 12);
  x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, w, 6);
  x.fillStyle = '#4a2a14'; x.beginPath(); x.moveTo(46, 128); x.lineTo(46, 88); x.arc(64, 88, 18, PI, 0); x.lineTo(82, 128); x.fill();
  x.fillStyle = '#6b3e22'; x.fillRect(50, 90, 12, 36); x.fillRect(66, 90, 12, 36);
  for (const px of [10, 94]) { x.fillStyle = '#5a3218'; x.fillRect(px, 78, 24, 36); x.fillStyle = '#3a1f0e'; for (let i = 0; i < 5; i++) x.fillRect(px + 2 + i * 5, 80, 2, 32); }
  for (const px of [12, 52, 92]) { x.fillStyle = '#5a3218'; x.fillRect(px - 2, 14, 28, 40); x.fillStyle = '#2d4a6b'; x.fillRect(px + 2, 18, 20, 32); x.fillStyle = '#5a3218'; x.fillRect(px + 11, 18, 2, 32); }
});
// Edificio moderno: cuadrícula de ventanas
const texEdificio = texturaCanvas(64, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 4; i++) {
    x.fillStyle = Math.random() < 0.18 ? '#ffe9a8' : (Math.random() < 0.5 ? '#3d6d96' : '#2b5478');
    x.fillRect(4 + i * 15, 4 + j * 10.5, 11, 7);
  }
});
// Edificio de ladrillo (Bogotá)
const texLadrillo = texturaCanvas(64, 128, (x, w, h) => {
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 32; j++) for (let i = -1; i < 9; i++) { x.fillStyle = `hsl(0,0%,${88 + Math.random() * 12}%)`; x.fillRect(i * 8 + (j % 2) * 4, j * 4, 7, 3); }
  for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) { x.fillStyle = '#f0f0f0'; x.fillRect(5 + i * 20, 6 + j * 20, 14, 12); x.fillStyle = Math.random() < 0.2 ? '#ffe9a8' : '#2f4a66'; x.fillRect(6 + i * 20, 7 + j * 20, 12, 10); }
});
// Globo aerostático pirata: franjas moradas y magenta con flores de Petunia
const texGlobo = texturaCanvas(256, 128, (x, w, h) => {
  for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#5a2b8c' : '#ff3fa4'; x.fillRect(i * w / 12, 0, w / 12 + 1, h); }
  for (let i = 0; i < 3; i++) { x.fillStyle = '#1b1022'; x.beginPath(); x.arc(42 + i * 85, 64, 20, 0, 7); x.fill(); florPetunia(x, 42 + i * 85, 64, 19); }
});
// Remolino del portal del tiempo
const texPortal = texturaCanvas(256, 256, (x, w, h) => {
  const g = x.createRadialGradient(128, 128, 6, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(170,100,255,.9)'); g.addColorStop(1, 'rgba(40,0,90,.5)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 7;
  for (let k = 0; k < 5; k++) { x.beginPath(); for (let t = 0; t < 6; t += 0.05) { const r = t * 21, a = t * 1.4 + k * 1.2566; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.stroke(); }
});
const _matsTex = new Map();
function matTex(color, tex) {
  const k = color + '_' + tex.id; let m = _matsTex.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, map: tex }); _matsTex.set(k, m); }
  return m;
}
// ---- Luces de las ventanas de noche: se generan leyendo los vidrios azules de cada fachada ----
const _luces = new Map();
function lucesDe(tex) {
  if (_luces.has(tex.id)) return _luces.get(tex.id);
  const src = tex.image, w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const d = src.getContext('2d').getImageData(0, 0, w, h), o = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, r = d.data[k], b = d.data[k + 2];
    const on = b > r + 25 && b > 50 && hash2(Math.floor(i / 12), Math.floor(j / 12), tex.id) < 0.65;
    o.data[k] = on ? 255 : 0; o.data[k + 1] = on ? 205 : 0; o.data[k + 2] = on ? 120 : 0; o.data[k + 3] = 255;
  }
  x.putImageData(o, 0, 0); const t = new THREE.CanvasTexture(c); _luces.set(tex.id, t); return t;
}
function encenderVentanas(noche) {
  _matsTex.forEach(m => {
    if (!!m.emissiveMap === noche) return;
    m.emissiveMap = noche ? lucesDe(m.map) : null; m.emissive.setHex(noche ? 0xffffff : 0x000000); m.needsUpdate = true;
  });
}
// ---- Pájaros que vuelan en círculos (gaviotas en la costa) ----
const matPajaro = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const bandada = [];
for (let i = 0; i < (ES_TACTIL ? 6 : 10); i++) {
  const p = new THREE.Group(); parte(G.caja, matPajaro, [0, 0, 0], [0.5, 0.35, 1.4], p);
  const alas = []; for (const s of [-1, 1]) { const al = grupo(p, [s * 0.25, 0.05, 0]); parte(G.caja, matPajaro, [s * 1.2, 0, 0], [2.4, 0.08, 0.8], al); alas.push(al); }
  escena.add(p); bandada.push({ p, alas, ang: rand(0, 6.28), r: rand(60, 220), h: rand(45, 110), v: rand(0.15, 0.3) * (Math.random() < 0.5 ? 1 : -1), f: rand(0, 6) });
}
function actualizarPajaros(dt) {
  for (const b of bandada) {
    b.ang += dt * b.v;
    const x = juego.centro.x + Math.cos(b.ang) * b.r, z = juego.centro.z + Math.sin(b.ang) * b.r;
    b.p.position.set(x, altura(x, z) + b.h + Math.sin(tiempo + b.f) * 4, z);
    b.p.rotation.y = b.v > 0 ? -b.ang : -b.ang + PI;
    b.alas.forEach((a, i) => a.rotation.z = (i ? 1 : -1) * Math.sin(tiempo * 7 + b.f) * 0.6);
  }
}
// Libera la memoria de un escenario que ya no se usa (importante en celulares)
function liberarEscenario(gr) {
  gr.traverse(o => { if (o.isMesh && o.userData.propio) o.geometry.dispose(); });
}


// =====================================================================
// 5. MODELOS
// =====================================================================
const matOjo = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
const matOjoAturdido = new THREE.MeshBasicMaterial({ color: 0xffe14a });
const matCupula = new THREE.MeshPhongMaterial({ color: 0xc58cff, transparent: true, opacity: 0.4, shininess: 90 });
const matVidrio = new THREE.MeshPhongMaterial({ color: 0xaee8ff, transparent: true, opacity: 0.32, shininess: 90 });
const matVidrioOsc = new THREE.MeshPhongMaterial({ color: 0x223344, transparent: true, opacity: 0.45, shininess: 100 });

/* ---------- NUCITA ----------
   Diseñada a partir de la foto: perrita blanca muy peludita, con dos moñitos
   rosados, pañoleta rosada con puntitos, arnés lila, ojitos negros y la
   lengüita afuera. Además lleva gafas de aviadora y una bufanda al viento. */
function crearNucita() {
  const n = new THREE.Group();
  // Pelo blanco con un poco de brillo propio para que se vea blanquito y no gris en la sombra
  const B = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x6a6660, flatShading: true, shininess: 5 });
  const C = new THREE.MeshPhongMaterial({ color: 0xf6ead6, emissive: 0x5e564a, flatShading: true, shininess: 5 });
  const ROSA = 0xff6fa8, ROSA2 = 0xffa9cb, LILA = 0x9f8ff0, NEGRO = 0x161214;
  srand(2024);
  const cuerpo = new THREE.Group(); n.add(cuerpo);
  parte(G.esfera, B, [0, 0.28, 0.04], [0.3, 0.3, 0.34], cuerpo);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * PI * 2;
    parte(G.esferaS, i % 4 === 0 ? C : B, [Math.cos(a) * 0.27, rr(0.1, 0.42), 0.06 + Math.sin(a) * 0.28], rr(0.1, 0.15), cuerpo, [rr(0, 3), rr(0, 3), rr(0, 3)]);
  }
  parte(G.esfera, B, [0, 0.38, -0.19], [0.21, 0.22, 0.15], cuerpo);
  for (const s of [-1, 1]) {
    parte(G.esfera, B, [s * 0.12, 0.12, -0.24], [0.085, 0.15, 0.09], cuerpo);
    parte(G.esferaS, C, [s * 0.12, 0.0, -0.29], [0.08, 0.05, 0.09], cuerpo);
    parte(G.esfera, B, [s * 0.22, 0.08, 0.12], [0.12, 0.1, 0.16], cuerpo);
  }
  // arnés lila (como el de la foto)
  parte(new THREE.TorusGeometry(0.315, 0.032, 5, 18), LILA, [0, 0.34, 0.05], null, cuerpo, [PI / 2, 0, 0]);
  parte(G.caja, LILA, [0, 0.5, 0.2], [0.11, 0.04, 0.3], cuerpo, [0.5, 0, 0]);
  parte(new THREE.TorusGeometry(0.045, 0.012, 4, 10), 0xd9d9e6, [0, 0.55, 0.32], null, cuerpo);
  // pañoleta rosada con puntitos blancos (la de la foto)
  parte(new THREE.TorusGeometry(0.17, 0.055, 5, 14), ROSA, [0, 0.56, -0.04], null, cuerpo, [PI / 2 + 0.25, 0, 0]);
  parte(new THREE.ConeGeometry(0.19, 0.27, 3), ROSA, [0, 0.44, -0.2], [1, 1, 0.3], cuerpo, [PI + 0.15, 0, 0]);
  for (const [x, y] of [[-0.06, 0.5], [0.06, 0.5], [0, 0.42], [-0.03, 0.36], [0.04, 0.46]]) parte(G.bola, 0xffffff, [x, y, -0.257], 0.018, cuerpo);
  // bufanda de aviadora que ondea con el viento
  const bufanda = []; let ancla = new THREE.Group(); ancla.position.set(0.13, 0.58, 0.08); cuerpo.add(ancla);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group(); seg.position.z = i === 0 ? 0 : 0.13; ancla.add(seg);
    parte(G.caja, i % 2 ? ROSA2 : ROSA, [0, 0, 0.065], [0.12 - i * 0.008, 0.025, 0.14], seg);
    bufanda.push(seg); ancla = seg;
  }
  // cabeza
  const cab = new THREE.Group(); cab.position.set(0, 0.72, -0.06); cuerpo.add(cab);
  parte(G.esfera, B, [0, 0, 0], [0.25, 0.23, 0.24], cab);
  for (let i = 0; i < 10; i++) {
    const a = -0.3 + i / 9 * (PI + 0.6);
    parte(G.esferaS, i % 3 === 0 ? C : B, [Math.cos(a) * 0.21, rr(-0.02, 0.14), Math.sin(a) * 0.17 + 0.03], rr(0.08, 0.12), cab, [rr(0, 3), rr(0, 3), 0]);
  }
  parte(G.esferaS, B, [0, 0.2, -0.02], 0.12, cab); parte(G.esferaS, C, [0.05, 0.24, 0.03], 0.08, cab);
  parte(G.esfera, B, [0, -0.07, -0.2], [0.135, 0.1, 0.13], cab);
  for (const s of [-1, 0, 1]) parte(G.esferaS, B, [s * 0.07, -0.15, -0.21], 0.07, cab);
  parte(G.bola, NEGRO, [0, -0.025, -0.325], [0.052, 0.04, 0.035], cab);
  parte(G.bola, 0x4a1622, [0, -0.11, -0.29], [0.05, 0.025, 0.03], cab);
  for (const s of [-1, 1]) {
    parte(G.bola, NEGRO, [s * 0.095, 0.045, -0.2], [0.044, 0.048, 0.032], cab);
    parte(G.bola, matB(0xffffff), [s * 0.095 + 0.016, 0.064, -0.228], 0.013, cab);
    parte(G.bola, 0xffc2d6, [s * 0.15, -0.06, -0.18], [0.04, 0.025, 0.02], cab);
  }
  const lengua = new THREE.Group(); lengua.position.set(0, -0.12, -0.29); cab.add(lengua);
  parte(G.esfera, 0xff5d8f, [0, -0.045, -0.01], [0.042, 0.065, 0.016], lengua, [0.35, 0, 0]);
  const orejas = [];
  for (const s of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(s * 0.21, 0.07, 0.01); cab.add(o);
    parte(G.esfera, B, [s * 0.03, -0.13, 0], [0.085, 0.18, 0.11], o);
    parte(G.esferaS, C, [s * 0.04, -0.27, 0.01], 0.075, o);
    parte(G.esferaS, B, [s * 0.02, -0.04, 0.04], 0.09, o);
    unirHijos(o); orejas.push(o);
    const m = new THREE.Group(); m.position.set(s * 0.17, 0.17, 0.0); m.rotation.z = s * -0.4; cab.add(m);
    parte(G.cono4, ROSA, [-0.045, 0, 0], [0.05, 0.08, 0.035], m, [0, 0, -PI / 2]);
    parte(G.cono4, ROSA, [0.045, 0, 0], [0.05, 0.08, 0.035], m, [0, 0, PI / 2]);
    parte(G.bola, ROSA2, [0, 0, 0], 0.026, m);
  }
  parte(new THREE.TorusGeometry(0.235, 0.02, 4, 20), 0x6b3f22, [0, 0.1, 0], null, cab, [PI / 2 + 0.3, 0, 0]);
  for (const s of [-1, 1]) {
    parte(G.cil, 0xd4a640, [s * 0.09, 0.19, -0.2], [0.068, 0.04, 0.068], cab, [-0.93, 0, 0]);
    parte(G.cil, 0x7fdcff, [s * 0.09, 0.203, -0.218], [0.052, 0.02, 0.052], cab, [-0.93, 0, 0]);
  }
  parte(G.caja, 0xd4a640, [0, 0.19, -0.215], [0.05, 0.02, 0.02], cab);
  const cola = new THREE.Group(); cola.position.set(0, 0.32, 0.33); cuerpo.add(cola);
  parte(G.esfera, B, [0, 0.1, 0.03], [0.075, 0.13, 0.075], cola, [-0.5, 0, 0]);
  parte(G.esferaS, B, [0, 0.2, 0.0], 0.1, cola); parte(G.esferaS, C, [0, 0.27, -0.05], 0.075, cola);
  unirHijos(cola); unirHijos(cuerpo); unirHijos(cab);
  n.userData = { cuerpo, cab, lengua, orejas, bufanda, cola };
  n.scale.setScalar(0.95);
  return n;
}

/* ---------- PILOTOS: María y Pedro ----------
   Chaqueta de cuero de aviador con cuello de lana, casco con orejeras y
   gafas sobre la frente, ojos grandes y una bufanda que ondea con el viento. */
function crearPiloto(tipo) {
  const p = new THREE.Group(), maria = tipo === 'nina';
  const PIEL = 0xf3c39e, PIEL2 = 0xe8a987, CUERO = 0x8a5a32, CUERO2 = 0x6b4224, LANA = 0xf6ead6;
  const CAMISA = maria ? 0xff6fa8 : 0x3f86e0, BUF = maria ? 0xffb3d6 : 0xffffff, PELO = maria ? 0x4a2614 : 0x2e1a0e, IRIS = maria ? 0x6b3f1e : 0x3f6b2f;
  // torso
  parte(G.esfera, CUERO, [0, 0.3, 0], [0.31, 0.32, 0.25], p);
  parte(G.caja, CAMISA, [0, 0.43, -0.2], [0.17, 0.22, 0.06], p);
  parte(G.cil6, 0x222222, [0, 0.3, -0.245], [0.01, 0.26, 0.01], p);
  parte(new THREE.TorusGeometry(0.17, 0.06, 6, 14), LANA, [0, 0.58, -0.02], null, p, [PI / 2, 0, 0]);
  parte(G.cil, AM, [0.15, 0.42, -0.23], [0.04, 0.01, 0.04], p, [PI / 2, 0, 0]);
  parte(G.cil, AZ, [0.15, 0.42, -0.236], [0.026, 0.01, 0.026], p, [PI / 2, 0, 0]);
  parte(G.cil, RO, [0.15, 0.42, -0.242], [0.013, 0.01, 0.013], p, [PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    parte(G.cil, CUERO, [s * 0.25, 0.38, -0.22], [0.085, 0.42, 0.085], p, [1.18, 0, 0]);
    parte(G.cil, LANA, [s * 0.215, 0.31, -0.39], [0.09, 0.05, 0.09], p, [1.18, 0, 0]);
    parte(G.esfera, 0x5a3a20, [s * 0.2, 0.29, -0.45], [0.085, 0.075, 0.095], p);
  }
  // bufanda que ondea
  const bufanda = []; let ancla = grupo(p, [-0.12, 0.6, 0.1]);
  for (let i = 0; i < 5; i++) { const seg = grupo(ancla, [0, 0, i === 0 ? 0 : 0.12]); parte(G.caja, BUF, [0, 0, 0.06], [0.11 - i * 0.008, 0.025, 0.13], seg); bufanda.push(seg); ancla = seg; }
  // cabeza
  const cab = grupo(p, [0, 0.86, 0]);
  parte(G.cil, PIEL, [0, -0.19, 0], [0.07, 0.1, 0.07], cab);
  parte(G.bola, PIEL, [0, 0, 0], [0.24, 0.25, 0.23], cab);
  for (const s of [-1, 1]) {
    parte(G.bola, matB(0xffffff), [s * 0.085, 0.0, -0.2], [0.056, 0.066, 0.03], cab);       // ojos grandes
    parte(G.bola, IRIS, [s * 0.085, -0.008, -0.224], [0.036, 0.044, 0.02], cab);
    parte(G.bola, 0x111111, [s * 0.085, -0.008, -0.235], [0.019, 0.023, 0.012], cab);
    parte(G.bola, matB(0xffffff), [s * 0.085 + 0.014, 0.012, -0.243], 0.009, cab);
    parte(G.caja, PELO, [s * 0.09, 0.083, -0.212], [0.07, 0.014, 0.02], cab, [0, 0, s * -0.15]); // cejas
    parte(G.bola, 0xff9db5, [s * 0.14, -0.07, -0.17], [0.042, 0.026, 0.02], cab);              // cachetes
    if (maria) for (const d of [0, 1]) parte(G.caja, 0x111111, [s * (0.125 + d * 0.012), 0.045 + d * 0.012, -0.212], [0.022, 0.007, 0.008], cab, [0, 0, s * 0.7]); // pestañas
    else for (const d of [0, 1, 2]) parte(G.bola, 0xc98a5e, [s * (0.11 + d * 0.025), -0.045 + (d % 2) * 0.02, -0.19], 0.008, cab); // pecas
    parte(G.caja, CUERO, [s * 0.225, -0.07, 0.01], [0.05, 0.17, 0.12], cab);                  // orejeras
    parte(G.caja, CUERO2, [s * 0.17, -0.19, -0.05], [0.07, 0.02, 0.025], cab, [0, 0, s * 0.5]); // correa
  }
  parte(G.bola, PIEL2, [0, -0.04, -0.232], [0.028, 0.03, 0.025], cab);
  parte(new THREE.TorusGeometry(0.045, 0.011, 4, 10, PI), 0xc0392b, [0, -0.105, -0.212], null, cab, [0, 0, PI]);
  // casco de cuero con costura y gafas sobre la frente
  parte(new THREE.SphereGeometry(0.255, 14, 9, 0, PI * 2, 0, PI * 0.5), CUERO, [0, 0.03, 0.01], null, cab, [0.25, 0, 0]);
  parte(new THREE.TorusGeometry(0.255, 0.012, 4, 20, PI), CUERO2, [0, 0.03, 0.01], null, cab, [0.25, PI / 2, 0]);
  parte(new THREE.TorusGeometry(0.245, 0.018, 4, 22), 0x3a2a1a, [0, 0.14, 0.0], null, cab, [PI / 2 + 0.25, 0, 0]);
  for (const s of [-1, 1]) {
    parte(G.cil, 0xc9a227, [s * 0.08, 0.17, -0.205], [0.068, 0.045, 0.068], cab, [-1.15, 0, 0]);
    parte(G.cil, 0x8fe3ff, [s * 0.08, 0.182, -0.223], [0.052, 0.02, 0.052], cab, [-1.15, 0, 0]);
  }
  if (maria) { // flequillo, pelo largo y dos trenzas con moñitos rosados
    for (const x of [-0.13, -0.065, 0, 0.065, 0.13]) parte(G.esferaS, PELO, [x, 0.1, -0.19], [0.06, 0.045, 0.04], cab);
    parte(G.esfera, PELO, [0, -0.06, 0.13], [0.23, 0.26, 0.15], cab);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) parte(G.esfera, PELO, [s * 0.2, -0.15 - k * 0.075, -0.03 - k * 0.025], 0.055 - k * 0.004, cab);
      parte(G.cono4, 0xff4f9a, [s * 0.2 - 0.04, -0.45, -0.12], [0.04, 0.07, 0.03], cab, [0, 0, -PI / 2]);
      parte(G.cono4, 0xff4f9a, [s * 0.2 + 0.04, -0.45, -0.12], [0.04, 0.07, 0.03], cab, [0, 0, PI / 2]);
      parte(G.bola, 0xff7fbf, [s * 0.2, -0.45, -0.12], 0.02, cab);
    }
  } else { // mechones que se salen del casco
    for (const x of [-0.11, -0.04, 0.03, 0.1]) parte(G.cono, PELO, [x, 0.11, -0.2], [0.04, 0.09, 0.035], cab, [-1.25, 0, x * 2]);
    for (const s of [-1, 1]) parte(G.esferaS, PELO, [s * 0.2, 0.06, -0.06], [0.04, 0.06, 0.05], cab);
  }
  unirHijos(cab); unirHijos(p);
  p.userData.cabeza = cab; p.userData.bufanda = bufanda;
  return p;
}
const NOMBRES = { nina: 'María', nino: 'Pedro' };
function nombrePiloto() { return NOMBRES[Guardado.get('avatar', 'nina')] || 'María'; }

/* ---------- AVIONES DEL JUGADOR (uno por época, nariz hacia -Z) ----------
   Todos comparten la misma cabina (tablero, palanca, colgandejo) en el mismo
   lugar, así Nucita, el piloto y la cámara de cabina sirven para todos. */
const AM = 0xffc933, AZ = 0x2a5bd7, RO = 0xe23a3a, GR = 0x4b5160, OSC = 0x2a2e36, BL = 0xf6f6f6;
function escarapela(a, x, y, z, r) { // círculo tricolor de Colombia
  parte(G.cil, AZ, [x, y, z], [r, 0.02, r], a);
  parte(G.cil, RO, [x, y + 0.012, z], [r * 0.55, 0.02, r * 0.55], a);
}
function crearHelice(a, u, z, y, palas, radio, colorPala, colorPunta, x = 0) {
  const h = grupo(a, [x, y, z]);
  for (let k = 0; k < palas; k++) {
    const pa = grupo(h, null, [0, 0, k * PI * 2 / palas]);
    parte(G.caja, colorPala, [0, radio / 2, 0], [0.22, radio, 0.06], pa, [0, 0.3, 0]);
    if (colorPunta) parte(G.caja, colorPunta, [0, radio - 0.1, 0], [0.23, 0.2, 0.07], pa, [0, 0.3, 0]);
  }
  const disco = new THREE.Mesh(new THREE.CircleGeometry(radio + 0.1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  disco.position.set(x, y, z - 0.05); a.add(disco);
  u.helices.push(h); u.discos.push(disco);
}
function superficie(a, pos, esc, color, nombre) { const g = grupo(a, pos); parte(G.caja, color, [0, 0, esc[2] / 2], esc, g); return g; }
function alaPlana(puntos, grosor) { // ala hecha con una figura 2D extruida (x = lado, y = adelante/atrás)
  const s = new THREE.Shape(); puntos.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false }); g.rotateX(PI / 2); return g;
}
function aletaVertical(puntos, grosor) { // aleta vertical: x = adelante/atrás, y = altura
  const s = new THREE.Shape(); puntos.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false }); g.rotateY(-PI / 2); g.translate(grosor / 2, 0, 0); return g;
}

// ---- 1955: avioneta de combate de hélice (la original) ----
function cuerpo1955(a, u) {
  parte(new THREE.CylinderGeometry(0.95, 0.5, 6.6, 12), AM, [0, 0, 0.4], null, a, [-PI / 2, 0, 0]);
  parte(G.cil, AZ, [0, 0, -1.6], [0.88, 0.3, 0.88], a, [PI / 2, 0, 0]);
  parte(G.cil, RO, [0, 0, 2.4], [0.62, 0.3, 0.62], a, [PI / 2, 0, 0]);
  parte(G.cil, RO, [0, 0, -3.15], [1.0, 0.55, 1.0], a, [PI / 2, 0, 0]);
  parte(G.cono, BL, [0, 0, -3.75], [0.35, 0.6, 0.35], a, [-PI / 2, 0, 0]);
  for (const s of [-1, 1]) parte(G.cil, GR, [s * 0.75, -0.35, -2.4], [0.09, 0.8, 0.09], a, [PI / 2, 0, 0]);
  crearHelice(a, u, -3.55, 0, 3, 1.6, OSC, AM);
  parte(G.caja, AM, [0, -0.35, -0.7], [9.6, 0.2, 1.9], a);
  for (const s of [-1, 1]) {
    parte(G.caja, RO, [s * 4.55, -0.35, -0.7], [0.6, 0.22, 1.92], a);
    parte(G.caja, AZ, [s * 2.7, -0.24, -0.7], [0.45, 0.03, 1.9], a);
    escarapela(a, s * 3.6, -0.235, -0.7, 0.6);
    parte(G.cil, GR, [s * 2.0, -0.42, -1.9], [0.08, 1.2, 0.08], a, [PI / 2, 0, 0]);
    parte(G.caja, GR, [s * 1.3, -0.95, -0.9], [0.1, 1.0, 0.1], a);
    parte(G.cil, OSC, [s * 1.3, -1.4, -0.9], [0.38, 0.2, 0.38], a, [0, 0, PI / 2]);
  }
  parte(G.caja, AM, [0, 0.1, 3.4], [3.6, 0.12, 1.0], a);
  parte(G.caja, AM, [0, 0.6, 3.55], [0.12, 0.6, 1.0], a);
  parte(G.caja, AZ, [0, 1.05, 3.55], [0.12, 0.3, 1.0], a);
  parte(G.caja, RO, [0, 1.35, 3.6], [0.12, 0.3, 0.9], a);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 3.3, -0.35, 0.25], [1.9, 0.12, 0.44], 0xe8b020));
  u.profundidad = superficie(a, [0, 0.1, 3.9], [3.4, 0.1, 0.4], 0xe8b020);
  u.direccion = superficie(a, [0, 0.95, 4.05], [0.1, 1.1, 0.34], RO);
  u.canones = [new THREE.Vector3(-2.0, -0.42, -2.6), new THREE.Vector3(2.0, -0.42, -2.6)];
  u.escapes = [new THREE.Vector3(-0.75, -0.35, -1.9), new THREE.Vector3(0.75, -0.35, -1.9)];
  u.puntas = [new THREE.Vector3(-4.8, -0.35, -0.2), new THREE.Vector3(4.8, -0.35, -0.2)];
}
// ---- 1919: biplano de lona con motor radial ----
function cuerpo1919(a, u) {
  const OL = 0x6f7f3a, LONA = 0xf0e2c0, MAD = 0x8a5a2a;
  parte(new THREE.CylinderGeometry(0.8, 0.35, 6.4, 6), OL, [0, 0.05, 0.3], null, a, [-PI / 2, 0, 0]);
  parte(G.cil, 0x55595f, [0, 0.05, -3.05], [0.95, 0.5, 0.95], a, [PI / 2, 0, 0]);
  for (let k = 0; k < 7; k++) { const an = k / 7 * PI * 2; parte(G.cil6, 0x3a3d42, [Math.cos(an) * 0.8, 0.05 + Math.sin(an) * 0.8, -3.15], [0.16, 0.35, 0.16], a, [0, 0, an + PI / 2]); }
  parte(G.cono, 0x3a3d42, [0, 0.05, -3.45], [0.3, 0.35, 0.3], a, [-PI / 2, 0, 0]);
  crearHelice(a, u, -3.6, 0.05, 2, 1.7, MAD, null);
  // alas: inferior y superior, con costillas
  parte(G.caja, LONA, [0, -0.55, -1.0], [9, 0.12, 1.6], a);
  parte(G.caja, LONA, [0, 1.75, -1.3], [10, 0.12, 1.7], a);
  for (let k = -4; k <= 4; k++) { if (k === 0) continue; parte(G.caja, 0xd9c79c, [k * 1.1, 1.82, -1.3], [0.06, 0.03, 1.7], a); parte(G.caja, 0xd9c79c, [k * 1.0, -0.48, -1.0], [0.06, 0.03, 1.6], a); }
  for (const s of [-1, 1]) {
    parte(G.caja, AM, [s * 4.75, 1.76, -1.3], [0.5, 0.13, 1.72], a); parte(G.caja, AZ, [s * 4.35, 1.76, -1.3], [0.3, 0.13, 1.72], a); parte(G.caja, RO, [s * 4.05, 1.76, -1.3], [0.3, 0.13, 1.72], a);
    escarapela(a, s * 3.0, 1.82, -1.3, 0.55);
    for (const x of [2.2, 4.0]) for (const z of [-0.6, -1.7]) parte(G.cil6, MAD, [s * x, 0.6, z - 0.15], [0.05, 2.3, 0.05], a);
    parte(G.cil6, 0x999999, [s * 3.1, 0.6, -1.0], [0.015, 2.9, 0.015], a, [0, 0, s * 0.68]);       // cables tensores
    parte(G.cil6, MAD, [s * 0.5, 1.2, -1.3], [0.05, 1.2, 0.05], a, [0, 0, s * 0.3]);               // soportes de la cabina
    parte(G.caja, 0x3a3d42, [s * 0.75, -0.8, -1.7], [0.08, 1.3, 0.08], a, [0, 0, s * 0.35]);       // tren
    parte(G.cil, 0x1d1d1d, [s * 1.0, -1.4, -1.8], [0.5, 0.15, 0.5], a, [0, 0, PI / 2]);
    parte(G.cil, 0xbbbbbb, [s * 1.0, -1.4, -1.8], [0.2, 0.17, 0.2], a, [0, 0, PI / 2]);
    parte(G.cil6, 0x2a2a2a, [s * 0.3, 0.95, -2.0], [0.07, 1.3, 0.07], a, [PI / 2, 0, 0]);       // ametralladoras
  }
  parte(G.caja, OL, [0, 0.1, 3.2], [3.2, 0.08, 0.9], a);
  parte(G.caja, OL, [0, 0.55, 3.4], [0.08, 0.9, 0.9], a);
  parte(G.caja, 0x3a3d42, [0, -0.35, 3.3], [0.06, 0.5, 0.06], a, [0.5, 0, 0]);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 3.6, 1.75, -0.45], [2.2, 0.1, 0.4], 0xe6d4ae));
  u.profundidad = superficie(a, [0, 0.1, 3.65], [3.0, 0.08, 0.4], OL);
  const d = grupo(a, [0, 0.55, 3.85]); u.direccion = d;
  parte(G.caja, AM, [0, 0.3, 0.2], [0.08, 0.3, 0.4], d); parte(G.caja, AZ, [0, 0.0, 0.2], [0.08, 0.3, 0.4], d); parte(G.caja, RO, [0, -0.3, 0.2], [0.08, 0.3, 0.4], d);
  u.canones = [new THREE.Vector3(-0.3, 0.95, -2.7), new THREE.Vector3(0.3, 0.95, -2.7)];
  u.escapes = [new THREE.Vector3(-0.85, -0.2, -2.6), new THREE.Vector3(0.85, -0.2, -2.6)];
  u.puntas = [new THREE.Vector3(-5, 1.75, -1.3), new THREE.Vector3(5, 1.75, -1.3)];
}
// ---- 1741: barco volador de madera con alas de lona y cañoncitos de bronce ----
function cuerpo1741(a, u) {
  const MAD = 0x7a4a24, MAD2 = 0x5e3518, ORO = 0xc9a227, LONA = 0xf2e6c8;
  parte(G.caja, MAD, [0, -0.1, 0.3], [1.9, 1.1, 6.0], a);
  parte(G.caja, MAD2, [0, -0.75, 0.3], [1.2, 0.5, 5.6], a);
  parte(G.cono4, MAD, [0, -0.15, -3.3], [1.34, 1.4, 0.75], a, [-PI / 2, PI / 4, 0]);
  for (const s of [-1, 1]) {
    for (const y of [-0.45, -0.1, 0.25]) parte(G.caja, MAD2, [s * 0.96, y, 0.3], [0.03, 0.05, 6.0], a);
    parte(G.caja, ORO, [s * 0.95, 0.48, 0.3], [0.1, 0.1, 6.0], a);
    parte(G.cil6, ORO, [s * 1.0, 0.15, -2.0], [0.15, 1.1, 0.15], a, [PI / 2, 0, 0]);               // cañoncitos
    parte(G.cil6, 0x222222, [s * 1.0, 0.15, -2.56], [0.09, 0.02, 0.09], a, [PI / 2, 0, 0]);
    // alas de lona con varillas de madera (como de murciélago)
    parte(G.caja, LONA, [s * 2.5, 0.35, -0.3], [3.3, 0.06, 2.2], a, [0, 0, s * 0.06]);
    parte(G.caja, LONA, [s * 5.0, 0.55, -0.1], [2.3, 0.06, 1.5], a, [0, 0, s * 0.12]);
    parte(G.cil6, MAD2, [s * 3.5, 0.42, -1.4], [0.07, 6.4, 0.07], a, [0, 0, PI / 2 - s * 0.08]);
    for (const x of [2.0, 3.6, 5.2]) parte(G.cil6, MAD2, [s * x, 0.42, -0.4], [0.04, 2.1, 0.04], a, [PI / 2, 0, 0]);
    parte(G.caja, RO, [s * 6.1, 0.66, -0.1], [0.3, 0.07, 1.5], a, [0, 0, s * 0.12]);
  }
  parte(G.caja, MAD, [0, 0.65, 2.75], [1.9, 0.7, 1.1], a);                          // castillo de popa
  parte(G.caja, ORO, [0, 1.02, 2.75], [2.0, 0.08, 1.2], a);
  parte(G.cil6, MAD2, [0.7, 1.4, 3.1], [0.04, 0.8, 0.04], a);
  parte(G.bola, matB(0xffd36a), [0.7, 1.85, 3.1], 0.13, a);                          // farol
  // mástil con velita y bandera con huellita de Nucita
  parte(G.cil6, MAD2, [0, 1.3, -2.9], [0.07, 2.8, 0.07], a);
  parte(G.caja, 0xff6fa8, [0.35, 2.5, -2.9], [0.7, 0.4, 0.03], a);
  parte(G.cil, 0xffffff, [0.35, 2.5, -2.93], [0.12, 0.01, 0.12], a, [PI / 2, 0, 0]);
  parte(G.cil, ORO, [0, -0.15, -3.75], [0.3, 0.2, 0.3], a, [PI / 2, 0, 0]);
  crearHelice(a, u, -3.9, -0.15, 4, 1.5, MAD2, ORO);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 3.6, 0.38, 0.8], [2.6, 0.06, 0.45], LONA));
  parte(G.caja, LONA, [0, 0.55, 3.55], [2.6, 0.05, 0.7], a);
  u.profundidad = superficie(a, [0, 0.55, 3.9], [2.6, 0.05, 0.35], 0xe6d4ae);
  u.direccion = superficie(a, [0, -0.3, 3.35], [0.1, 1.3, 0.6], MAD2);
  u.canones = [new THREE.Vector3(-1.0, 0.15, -2.6), new THREE.Vector3(1.0, 0.15, -2.6)];
  u.escapes = [];
  u.puntas = [new THREE.Vector3(-6.2, 0.6, -0.1), new THREE.Vector3(6.2, 0.6, -0.1)];
  u.colorFogonazo = 0xffa040;
}
// ---- 1990: jet supersónico de ala en delta ----
function cuerpo1990(a, u) {
  const GJ = 0x8a96a3, GJ2 = 0x6b7680;
  parte(new THREE.CylinderGeometry(0.8, 0.6, 8.6, 10), GJ, [0, 0, 0.3], null, a, [-PI / 2, 0, 0]);
  parte(G.cono, GJ, [0, 0, -5.25], [0.8, 2.6, 0.8], a, [-PI / 2, 0, 0]);
  parte(G.cono, 0x333a40, [0, 0, -6.4], [0.22, 0.5, 0.22], a, [-PI / 2, 0, 0]);
  parte(alaPlana([[0.6, -2.4], [5.0, 2.6], [0.6, 2.6]], 0.14), GJ, [0, 0.0, 0.3], null, a);
  parte(alaPlana([[-0.6, -2.4], [-0.6, 2.6], [-5.0, 2.6]], 0.14), GJ, [0, 0.0, 0.3], null, a);
  for (const s of [-1, 1]) {
    parte(G.caja, GJ2, [s * 2.2, 0.01, 1.5], [1.4, 0.02, 1.0], a, [0, s * 0.4, 0]);   // manchas de camuflaje
    parte(G.caja, GJ2, [s * 0.75, 0.45, -1.2], [0.25, 0.3, 1.6], a);
    escarapela(a, s * 3.0, 0.02, 2.0, 0.45);
    parte(G.caja, 0x5c6670, [s * 1.0, -0.15, -0.6], [0.5, 0.8, 2.6], a);               // tomas de aire
    parte(G.cil6, 0x2a2a2a, [s * 1.2, -0.25, -1.4], [0.06, 0.6, 0.06], a, [PI / 2, 0, 0]);
    parte(G.cil, GR, [s * 3.2, -0.35, 1.2], [0.12, 2.0, 0.12], a, [PI / 2, 0, 0]);     // misiles bajo el ala
    parte(G.cono, 0xeeeeee, [s * 3.2, -0.35, 0.0], [0.12, 0.4, 0.12], a, [-PI / 2, 0, 0]);
  }
  parte(aletaVertical([[1.6, 0.5], [4.4, 0.5], [4.6, 3.1], [3.6, 3.1]], 0.12), GJ, [0, 0, 0], null, a);
  parte(G.caja, AM, [0, 2.75, 4.1], [0.13, 0.18, 0.7], a); parte(G.caja, AZ, [0, 2.57, 4.0], [0.13, 0.18, 0.7], a); parte(G.caja, RO, [0, 2.39, 3.9], [0.13, 0.18, 0.7], a);
  parte(G.cil, 0x2e3236, [0, 0, 4.7], [0.62, 0.6, 0.62], a, [PI / 2, 0, 0]);
  const fuego = new THREE.Mesh(G.cono, brillo(0xffa040)); fuego.position.set(0, 0, 5.5); fuego.rotation.x = PI / 2; fuego.scale.set(0.5, 1.4, 0.5); a.add(fuego); u.fuegos.push(fuego);
  const fuego2 = new THREE.Mesh(G.cono, brillo(0xfff2b0)); fuego2.position.set(0, 0, 5.2); fuego2.rotation.x = PI / 2; fuego2.scale.set(0.3, 0.8, 0.3); a.add(fuego2); u.fuegos.push(fuego2);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 2.6, -0.07, 2.9], [2.6, 0.1, 0.45], GJ2));
  const can = grupo(a, [0, 0.15, -2.8]); u.profundidad = can;            // canards: aletas pequeñas delante
  for (const s of [-1, 1]) parte(alaPlana([[s * 0.6, -0.4], [s * 2.0, 0.6], [s * 0.6, 0.7]], 0.08), GJ2, [0, 0, 0], null, can);
  u.direccion = superficie(a, [0, 1.8, 4.5], [0.1, 2.0, 0.45], GJ2);
  u.canones = [new THREE.Vector3(-1.2, -0.25, -1.8), new THREE.Vector3(1.2, -0.25, -1.8)];
  u.escapes = [];
  u.puntas = [new THREE.Vector3(-5.0, 0.0, 2.8), new THREE.Vector3(5.0, 0.0, 2.8)];
  u.cerrada = true; u.colorFogonazo = 0xfff0c0;
}
// ---- 2030: Cóndor X, la nave del tiempo (alas hacia adelante y anillo temporal) ----
function cuerpo2030(a, u) {
  const BLA = 0xeef4f8, TEAL = 0x2bb3b1, NEON = 0x5ff8ff;
  parte(new THREE.CylinderGeometry(0.75, 0.55, 8, 12), BLA, [0, 0, 0.3], null, a, [-PI / 2, 0, 0]);
  parte(G.cono, BLA, [0, 0, -4.9], [0.75, 2.4, 0.75], a, [-PI / 2, 0, 0]);
  parte(G.caja, TEAL, [0, -0.45, 0.2], [0.9, 0.2, 7.5], a);
  parte(alaPlana([[0.6, 0.2], [4.9, -0.9], [4.9, -0.2], [0.6, 2.2]], 0.14), BLA, [0, 0, 0.3], null, a);
  parte(alaPlana([[-0.6, 0.2], [-0.6, 2.2], [-4.9, -0.2], [-4.9, -0.9]], 0.14), BLA, [0, 0, 0.3], null, a);
  for (const s of [-1, 1]) {
    parte(G.caja, matB(NEON), [s * 2.75, 0.03, -0.12], [4.4, 0.05, 0.1], a, [0, s * 0.25, 0]);   // borde neón del ala
    parte(G.caja, matB(NEON), [s * 0.78, 0.0, 0.3], [0.05, 0.08, 7.0], a);                       // línea neón del fuselaje
    parte(G.caja, TEAL, [s * 4.95, 0.0, -0.5], [0.2, 0.5, 0.9], a);
    const fin = grupo(a, [s * 0.7, 0.4, 3.0], [0, 0, -s * 0.35]);
    parte(aletaVertical([[-0.6, 0], [1.2, 0], [1.5, 1.9], [0.6, 1.9]], 0.1), BLA, [0, 0, 0], null, fin);
    parte(G.caja, AM, [0, 1.65, 1.0], [0.11, 0.17, 0.6], fin); parte(G.caja, AZ, [0, 1.48, 0.95], [0.11, 0.17, 0.6], fin); parte(G.caja, RO, [0, 1.31, 0.9], [0.11, 0.17, 0.6], fin);
    parte(G.cil, 0x2e3236, [s * 0.5, -0.1, 4.3], [0.36, 0.5, 0.36], a, [PI / 2, 0, 0]);
    const f = new THREE.Mesh(G.cono, brillo(NEON)); f.position.set(s * 0.5, -0.1, 5.0); f.rotation.x = PI / 2; f.scale.set(0.3, 1.2, 0.3); a.add(f); u.fuegos.push(f);
    const hv = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), brillo(NEON, 0.45)); hv.position.set(s * 2.2, -0.12, 0.8); hv.rotation.x = PI / 2; a.add(hv); u.levita.push(hv);
    parte(G.caja, GR, [s * 1.0, -0.25, -1.9], [0.14, 0.14, 1.0], a);
  }
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 6, 28), brillo(0xff4fd8)); anillo.position.set(0, 0, 3.6); a.add(anillo); u.anillo = anillo;
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 4.0, -0.05, 0.45], [1.6, 0.08, 0.4], TEAL));
  u.profundidad = superficie(a, [0, -0.1, 4.0], [2.6, 0.07, 0.45], BLA);
  u.direccion = grupo(a, [0, 1.2, 3.9]);
  u.canones = [new THREE.Vector3(-1.0, -0.25, -2.5), new THREE.Vector3(1.0, -0.25, -2.5)];
  u.escapes = [];
  u.puntas = [new THREE.Vector3(-4.9, 0, -0.7), new THREE.Vector3(4.9, 0, -0.7)];
  u.cerrada = true; u.colorFogonazo = NEON;
}
// ---- 1819: ornitóptero de vapor (caldera de bronce, chimenea y dos hélices) ----
function cuerpo1819(a, u) {
  const MAD = 0x7a4a24, MAD2 = 0x5e3518, BR = 0xc9a227, LONA = 0xefe2c4;
  parte(G.caja, MAD, [0, -0.1, 0.7], [1.8, 1.0, 5.2], a);
  parte(G.caja, MAD2, [0, -0.7, 0.7], [1.2, 0.4, 4.8], a);
  for (const s of [-1, 1]) parte(G.caja, BR, [s * 0.9, 0.42, 0.7], [0.1, 0.1, 5.2], a);
  parte(G.cil, BR, [0, 0.0, -2.3], [0.85, 2.6, 0.85], a, [PI / 2, 0, 0]);                       // caldera
  for (const z of [-3.3, -2.3, -1.3]) parte(G.cil, 0x6b4a1e, [0, 0, z], [0.88, 0.12, 0.88], a, [PI / 2, 0, 0]);
  parte(G.cono, BR, [0, 0, -3.85], [0.85, 0.5, 0.85], a, [-PI / 2, 0, 0]);
  parte(G.bola, matB(0xff8a3a), [0, -0.4, -3.55], 0.18, a);                                   // fuego de la caldera
  parte(G.cil6, 0x2a2a2a, [0, 1.3, -2.7], [0.28, 2.0, 0.28], a);                               // chimenea
  parte(G.cil6, 0x2a2a2a, [0, 2.35, -2.7], [0.42, 0.25, 0.42], a);
  for (const s of [-1, 1]) {
    parte(G.caja, LONA, [s * 3.0, 0.3, -0.4], [4.4, 0.07, 2.4], a, [0, 0, s * 0.05]);
    parte(G.caja, LONA, [s * 5.6, 0.45, -0.2], [1.8, 0.07, 1.6], a, [0, 0, s * 0.1]);
    parte(G.cil6, BR, [s * 3.7, 0.36, -1.6], [0.06, 7.0, 0.06], a, [0, 0, PI / 2]);
    for (const x of [1.6, 3.2, 4.8]) parte(G.cil6, MAD2, [s * x, 0.36, -0.4], [0.04, 2.4, 0.04], a, [PI / 2, 0, 0]);
    parte(G.cil, BR, [s * 2.6, 0.3, -1.2], [0.35, 1.8, 0.35], a, [PI / 2, 0, 0]);
    crearHelice(a, u, -2.2, 0.3, 4, 1.1, MAD2, BR, s * 2.6);
    parte(G.cil6, BR, [s * 1.15, -0.1, -2.0], [0.13, 1.1, 0.13], a, [PI / 2, 0, 0]);         // cañoncitos
  }
  parte(G.caja, MAD, [0, 0.2, 3.6], [0.4, 0.4, 2], a);
  parte(G.caja, LONA, [0, 0.4, 4.2], [3.0, 0.06, 1.0], a);
  parte(G.caja, LONA, [0, 0.95, 4.25], [0.06, 1.1, 0.9], a);
  parte(G.caja, AM, [0, 1.38, 4.3], [0.08, 0.25, 0.8], a); parte(G.caja, AZ, [0, 1.14, 4.3], [0.08, 0.25, 0.8], a); parte(G.caja, RO, [0, 0.9, 4.3], [0.08, 0.25, 0.8], a);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 3.8, 0.33, 0.8], [2.6, 0.06, 0.45], 0xe2d4b0));
  u.profundidad = superficie(a, [0, 0.4, 4.7], [3.0, 0.05, 0.4], 0xe2d4b0);
  u.direccion = superficie(a, [0, 0.95, 4.7], [0.06, 1.0, 0.4], MAD2);
  u.canones = [new THREE.Vector3(-1.15, -0.1, -2.6), new THREE.Vector3(1.15, -0.1, -2.6)];
  u.escapes = [new THREE.Vector3(0, 2.5, -2.7)]; u.colorHumo = 0xf2f2f2; u.humoGrande = true;
  u.puntas = [new THREE.Vector3(-6.5, 0.55, -0.2), new THREE.Vector3(6.5, 0.55, -0.2)];
  u.colorFogonazo = 0xffa040;
}
// ---- 1970: jet plateado de alas en flecha (toma de aire en la nariz) ----
function cuerpo1970(a, u) {
  const PL = 0xc8ccd2, PL2 = 0xa8adb5;
  parte(new THREE.CylinderGeometry(0.85, 0.6, 8.2, 12), PL, [0, 0, 0.4], null, a, [-PI / 2, 0, 0]);
  parte(G.cil, PL, [0, 0, -3.9], [0.85, 0.6, 0.85], a, [PI / 2, 0, 0]);
  parte(G.cil, AM, [0, 0, -3.3], [0.87, 0.35, 0.87], a, [PI / 2, 0, 0]);                       // franja amarilla de la nariz
  parte(new THREE.TorusGeometry(0.72, 0.14, 6, 16), PL2, [0, 0, -4.2], null, a);
  parte(G.cil, 0x15161a, [0, 0, -4.1], [0.62, 0.2, 0.62], a, [PI / 2, 0, 0]);                  // toma de aire
  parte(alaPlana([[0.6, -1.3], [4.7, 0.9], [4.7, 1.5], [0.6, 1.5]], 0.14), PL, [0, -0.15, 0.3], null, a);
  parte(alaPlana([[-0.6, -1.3], [-0.6, 1.5], [-4.7, 1.5], [-4.7, 0.9]], 0.14), PL, [0, -0.15, 0.3], null, a);
  parte(alaPlana([[0.4, 3.4], [2.1, 4.3], [2.1, 4.7], [0.4, 4.6]], 0.08), PL2, [0, 0.25, 0], null, a);
  parte(alaPlana([[-0.4, 3.4], [-0.4, 4.6], [-2.1, 4.7], [-2.1, 4.3]], 0.08), PL2, [0, 0.25, 0], null, a);
  parte(aletaVertical([[2.6, 0.5], [4.4, 0.5], [4.9, 2.7], [4.1, 2.7]], 0.12), PL, [0, 0, 0], null, a);
  parte(G.caja, AM, [0, 2.3, 4.45], [0.13, 0.2, 0.6], a); parte(G.caja, AZ, [0, 2.1, 4.4], [0.13, 0.2, 0.6], a); parte(G.caja, RO, [0, 1.9, 4.35], [0.13, 0.2, 0.6], a);
  for (const s of [-1, 1]) {
    escarapela(a, s * 3.0, -0.13, 0.9, 0.42);
    parte(G.cil, 0xb8bcc2, [s * 2.4, -0.6, 0.6], [0.28, 2.4, 0.28], a, [PI / 2, 0, 0]);           // tanques de combustible
    parte(G.cono, 0xb8bcc2, [s * 2.4, -0.6, -0.8], [0.28, 0.5, 0.28], a, [-PI / 2, 0, 0]);
    parte(G.cil6, 0x2a2a2a, [s * 0.55, -0.25, -3.3], [0.05, 0.6, 0.05], a, [PI / 2, 0, 0]);
  }
  parte(G.cil, 0x2e3236, [0, 0, 4.55], [0.55, 0.3, 0.55], a, [PI / 2, 0, 0]);
  const f = new THREE.Mesh(G.cono, brillo(0xffa040)); f.position.set(0, 0, 5.2); f.rotation.x = PI / 2; f.scale.set(0.35, 1.0, 0.35); a.add(f); u.fuegos.push(f);
  for (const s of [-1, 1]) u.alerones.push(superficie(a, [s * 3.5, -0.15, 1.85], [1.8, 0.1, 0.4], PL2));
  u.profundidad = superficie(a, [0, 0.25, 4.7], [4.0, 0.07, 0.35], PL2);
  u.direccion = superficie(a, [0, 1.6, 4.7], [0.1, 1.8, 0.4], PL2);
  u.canones = [new THREE.Vector3(-0.55, -0.25, -3.6), new THREE.Vector3(0.55, -0.25, -3.6)];
  u.escapes = [];
  u.puntas = [new THREE.Vector3(-4.7, -0.15, 1.5), new THREE.Vector3(4.7, -0.15, 1.5)];
  u.cerrada = true; u.colorFogonazo = 0xfff0c0;
}
// ---- Cabina común: tablero con agujas, horizonte artificial, luces, palanca, acelerador y colgandejo ----
function cabinaComun(a, cerrada) {
  const c = {};
  if (!cerrada) {
    parte(G.caja, OSC, [0, 0.8, -0.55], [1.7, 0.12, 0.12], a);
    parte(G.caja, OSC, [0, 0.72, 1.05], [1.5, 0.12, 0.12], a);
    for (const s of [-1, 1]) parte(G.caja, OSC, [s * 0.86, 0.76, 0.25], [0.12, 0.12, 1.6], a);
    const pb = new THREE.Mesh(G.caja, matVidrio); pb.position.set(0, 1.05, -0.62); pb.scale.set(1.6, 0.4, 0.04); pb.rotation.x = 0.35; a.add(pb);
    parte(G.caja, OSC, [0, 1.26, -0.69], [1.62, 0.04, 0.06], a);
  } else {
    const cup = new THREE.Mesh(G.bola, matVidrio); cup.position.set(0, 0.85, 0.15); cup.scale.set(0.98, 0.78, 1.75); a.add(cup);
    parte(new THREE.TorusGeometry(0.97, 0.04, 4, 20, PI), OSC, [0, 0.82, -0.75], [1, 0.8, 1], a);
  }
  parte(G.caja, 0x3a2a20, [-0.42, 0.45, 0.62], [0.6, 0.5, 0.12], a);                                // espaldar
  // Tablero (las agujas se mueven)
  const tablero = grupo(a, [-0.38, 0.97, -0.42]);
  parte(G.caja, OSC, [0, 0, 0], [0.9, 0.32, 0.2], tablero);
  parte(G.caja, 0x1a1c22, [0, 0.17, 0.02], [0.92, 0.04, 0.24], tablero);
  c.agujas = [];
  [-0.28, 0, 0.28].forEach((x, i) => {
    parte(G.cil, 0x9aa0aa, [x, -0.01, 0.1], [0.115, 0.02, 0.115], tablero, [PI / 2, 0, 0]);
    if (i === 1) return;
    parte(G.cil, 0x15161a, [x, -0.01, 0.112], [0.1, 0.01, 0.1], tablero, [PI / 2, 0, 0]);
    for (let k = 0; k < 8; k++) { const an = -2.2 + k / 7 * 4.4; parte(G.caja, 0xffffff, [x + Math.sin(an) * 0.08, -0.01 + Math.cos(an) * 0.08, 0.12], [0.006, 0.02, 0.004], tablero, [0, 0, -an]); }
    const ag = grupo(tablero, [x, -0.01, 0.124]);
    parte(G.caja, matB(i === 0 ? 0xff6a3a : 0x7fe3ff), [0, 0.035, 0], [0.01, 0.075, 0.004], ag);
    parte(G.bola, 0xdddddd, [0, 0, 0.003], 0.012, ag);
    c.agujas.push(ag);
  });
  // Horizonte artificial: cielo azul arriba, tierra café abajo
  c.texHorizonte = texturaCanvas(64, 128, (x, w, h) => {
    x.fillStyle = '#3a8fe0'; x.fillRect(0, 0, w, h / 2); x.fillStyle = '#8a5a2b'; x.fillRect(0, h / 2, w, h / 2);
    x.fillStyle = '#ffffff'; x.fillRect(0, h / 2 - 1, w, 2);
    for (const d of [-16, 16]) x.fillRect(w / 2 - 8, h / 2 + d, 16, 1);
  });
  c.texHorizonte.wrapT = THREE.ClampToEdgeWrapping; c.texHorizonte.repeat.set(1, 0.5);
  c.horizonte = new THREE.Mesh(new THREE.CircleGeometry(0.1, 18), new THREE.MeshBasicMaterial({ map: c.texHorizonte }));
  c.horizonte.position.set(0, -0.01, 0.113); c.horizonte.userData.noUnir = true; tablero.add(c.horizonte);
  parte(G.caja, matB(0xffd23f), [0, -0.01, 0.12], [0.09, 0.008, 0.004], tablero);
  const luz = (y, col) => { const l = new THREE.Mesh(G.bola, new THREE.MeshBasicMaterial({ color: col })); l.position.set(0.36, y, 0.1); l.scale.setScalar(0.022); tablero.add(l); return l; };
  c.luzVida = luz(0.1, 0x441111); c.luzLadrido = luz(0.03, 0x442233); c.luzCalor = luz(-0.04, 0x443311);
  unirHijos(tablero);
  // Palanca de mando y acelerador
  c.palanca = grupo(a, [-0.42, 0.25, 0.15]);
  parte(G.cil, 0x2a2a2a, [0, 0.0, 0], [0.08, 0.05, 0.08], c.palanca);
  parte(G.cil, 0x8a8f99, [0, 0.28, 0], [0.02, 0.56, 0.02], c.palanca);
  parte(G.cil, 0x1d1d1d, [0, 0.6, 0], [0.036, 0.12, 0.036], c.palanca);
  parte(G.bola, matB(0xff3333), [0, 0.67, -0.02], 0.016, c.palanca);
  unirHijos(c.palanca);
  c.acelerador = grupo(a, [-0.78, 0.82, 0.05]);
  parte(G.caja, 0x8a8f99, [0, 0.07, 0], [0.025, 0.15, 0.025], c.acelerador);
  parte(G.bola, 0x111111, [0, 0.16, 0], 0.03, c.acelerador);
  unirHijos(c.acelerador);
  // Colgandejo: un huesito de Nucita colgado que se mece
  c.colgante = grupo(a, [-0.05, cerrada ? 1.45 : 1.24, cerrada ? -0.5 : -0.66]);
  parte(G.caja, 0xffffff, [0, -0.08, 0], [0.006, 0.16, 0.006], c.colgante);
  parte(G.cil, 0xfff3dc, [0, -0.17, 0], [0.012, 0.07, 0.012], c.colgante, [0, 0, PI / 2]);
  for (const x of [-0.035, 0.035]) for (const y of [-0.16, -0.18]) parte(G.bola, 0xfff3dc, [x, y, 0], 0.013, c.colgante);
  parte(G.cono4, 0xff6fa8, [0, -0.135, 0], [0.012, 0.02, 0.01], c.colgante);
  unirHijos(c.colgante);
  return c;
}
function crearAvion(epoca) {
  const a = new THREE.Group();
  const u = { helices: [], discos: [], fuegos: [], levita: [], alerones: [], anillo: null, cerrada: false };
  ({ 1741: cuerpo1741, 1819: cuerpo1819, 1919: cuerpo1919, 1955: cuerpo1955, 1970: cuerpo1970, 1990: cuerpo1990, 2030: cuerpo2030 })[epoca](a, u);
  Object.assign(u, cabinaComun(a, u.cerrada));
  u.fogonazos = u.canones.map(c => {
    const f = new THREE.Mesh(G.cono, brillo(u.colorFogonazo || 0xffd76a));
    f.position.set(c.x, c.y, c.z - 0.45); f.rotation.x = -PI / 2; f.scale.set(0.22, 0.9, 0.22); f.visible = false; a.add(f); return f;
  });
  u.tFogonazo = [0, 0]; u.colganteVel = [0, 0]; u.tHumo = 0;
  unirHijos(a);
  a.userData = u;
  return a;
}

/* ---------- ENEMIGOS DE PETUNIA (nariz hacia +Z) ----------
   Todos son robots de Petunia, disfrazados según la época: piratas, aviadores, pilotos de jet... */
const MO = 0x5a2b8c, NE = 0x26212e, MA = 0xff3fa4, ME = 0x9aa0b4;
function cabezaRobot(g, x, y, z, s = 1, sombrero = false) {
  parte(G.caja, ME, [x, y, z], [0.55 * s, 0.45 * s, 0.5 * s], g);
  parte(G.cil6, ME, [x, y + 0.34 * s, z], [0.025 * s, 0.3 * s, 0.025 * s], g);
  parte(G.bola, matB(MA), [x, y + 0.5 * s, z], 0.07 * s, g);
  for (const k of [-1, 1]) { const o = parte(G.caja, matOjo, [x + k * 0.13 * s, y + 0.04 * s, z + 0.26 * s], [0.13 * s, 0.09 * s, 0.03 * s], g); o.userData.ojo = true; }
  if (sombrero) { // sombrero pirata
    parte(G.caja, 0x111111, [x, y + 0.27 * s, z], [0.95 * s, 0.07 * s, 0.6 * s], g);
    parte(G.cono4, 0x111111, [x, y + 0.42 * s, z], [0.45 * s, 0.3 * s, 0.3 * s], g, [0, PI / 4, 0]);
    parte(G.bola, matB(MA), [x, y + 0.4 * s, z + 0.24 * s], 0.06 * s, g);
  }
}
function simbolo(g, x, y, z, s, rx = -PI / 2, ry = 0) { const m = parte(G.plano, matPetunia, [x, y, z], s, g, [rx, ry, 0]); m.userData.noUnir = true; return m; }
function heliceEnemiga(g, z, y, radio, palas = 2, x = 0) {
  const h = grupo(g, [x, y, z], null, 'gira');
  for (let k = 0; k < palas; k++) parte(G.caja, NE, [0, 0, 0], [0.18, radio * 2, 0.05], h, [0, 0, k * PI / palas]);
  return h;
}
function avionRobotHelice(g, tipo) { // los cazas de 1955 (los originales)
  const rap = tipo === 'rapido', kam = tipo === 'kamikaze';
  parte(new THREE.CylinderGeometry(0.55, 0.75, 4.6, 8), kam ? NE : MO, [0, 0, 0], null, g, [PI / 2, 0, 0]);
  parte(G.cono, kam ? 0xff2a2a : MA, [0, 0, 2.75], [0.55, 1.0, 0.55], g, [PI / 2, 0, 0]);
  let simX = 1.8, simZ = -0.2;
  if (rap) { for (const s of [-1, 1]) parte(G.caja, MO, [s * 1.9, 0, -0.5], [3.4, 0.14, 1.3], g, [0, s * 0.45, 0]); simX = 1.4; simZ = -0.6; }
  else if (kam) {
    for (const s of [-1, 1]) { parte(G.caja, NE, [s * 1.6, 0, -0.3], [2.6, 0.14, 1.0], g); parte(G.caja, 0xffd23f, [s * 1.6, 0.08, -0.3], [0.4, 0.03, 1.0], g); }
    for (let k = 0; k < 4; k++) { const an = k / 4 * PI * 2; parte(G.cono, ME, [Math.cos(an) * 0.5, Math.sin(an) * 0.5, 2.0], [0.12, 0.6, 0.12], g, [PI / 2, 0, 0]); }
    parte(G.bola, 0xff2a2a, [0, -0.7, 0.4], [0.45, 0.4, 0.9], g); simX = 1.3; simZ = -0.3;
  } else { parte(G.caja, MO, [0, 0, -0.2], [6.4, 0.16, 1.5], g); for (const s of [-1, 1]) parte(G.caja, MA, [s * 3.1, 0, -0.2], [0.3, 0.2, 1.5], g); }
  parte(G.caja, MO, [0, 0.7, -1.9], [0.12, 1.1, 0.9], g);
  parte(G.caja, MO, [0, 0.15, -2.0], [2.4, 0.1, 0.7], g);
  parte(G.cil, NE, [0, 0, -2.45], [0.5, 0.4, 0.5], g, [PI / 2, 0, 0]);
  parte(G.cono, matB(0xffa53a), [0, 0, -2.95], [0.35, 0.8, 0.35], g, [-PI / 2, 0, 0]);
  cabezaRobot(g, 0, 0.78, 0.5);
  parte(G.bola, matCupula, [0, 0.75, 0.45], [0.45, 0.42, 0.6], g);
  for (const s of [-1, 1]) simbolo(g, s * simX, 0.12, simZ, 1.1);
}
function jetRobot(g, barrido, neon) { // jets de 1990 y de 2030
  parte(new THREE.CylinderGeometry(0.45, 0.62, 6, 8), barrido ? NE : MO, [0, 0, 0], null, g, [PI / 2, 0, 0]);
  parte(G.cono, barrido ? MO : NE, [0, 0, 3.8], [0.45, 1.6, 0.45], g, [PI / 2, 0, 0]);
  const pts = barrido ? [[-0.5, 1.0], [-4.2, -1.8], [-4.2, -2.5], [-0.5, -1.6], [0.5, -1.6], [4.2, -2.5], [4.2, -1.8], [0.5, 1.0]] : [[0, 1.8], [-4.4, -2.4], [4.4, -2.4]];
  parte(alaPlana(pts, 0.14), MO, [0, 0.07, 0], null, g);
  parte(aletaVertical([[-3.1, 0.3], [-1.6, 0.3], [-2.4, 2.2], [-3.3, 2.2]], 0.12), MO, [0, 0, 0], null, g);
  for (const s of [-1, 1]) { simbolo(g, s * 2.3, 0.09, -1.2, 1.2); parte(G.caja, MA, [s * (barrido ? 4.2 : 3.6), 0.08, -2.0], [0.3, 0.05, 0.6], g); }
  if (neon) for (const s of [-1, 1]) parte(G.caja, matB(MA), [s * 0.5, 0.0, 0], [0.05, 0.06, 5.5], g);
  parte(G.cil, NE, [0, 0, -3.1], [0.45, 0.4, 0.45], g, [PI / 2, 0, 0]);
  const f = new THREE.Mesh(G.cono, brillo(neon ? MA : 0xffa53a)); f.position.set(0, 0, -3.8); f.rotation.x = -PI / 2; f.scale.set(0.35, 1.2, 0.35); g.add(f);
  cabezaRobot(g, 0, 0.6, 1.3);
  parte(G.bola, matCupula, [0, 0.55, 1.25], [0.42, 0.4, 0.75], g);
}
function crearEnemigo(tipo) {
  const g = new THREE.Group();
  switch (tipo) {
    case 'basico': case 'rapido': case 'kamikaze': avionRobotHelice(g, tipo); break;
    case 'biplanoE': {
      parte(new THREE.CylinderGeometry(0.5, 0.7, 4.6, 6), MO, [0, 0.1, 0], null, g, [PI / 2, 0, 0]);
      parte(G.cil, NE, [0, 0.1, 2.4], [0.75, 0.5, 0.75], g, [PI / 2, 0, 0]);
      heliceEnemiga(g, 2.75, 0.1, 1.3);
      parte(G.caja, MA, [0, -0.4, 0.4], [7, 0.12, 1.3], g); parte(G.caja, MA, [0, 1.35, 0.6], [7.6, 0.12, 1.3], g);
      for (const s of [-1, 1]) { for (const x of [1.4, 3.1]) parte(G.cil6, NE, [s * x, 0.48, 0.5], [0.05, 1.75, 0.05], g); simbolo(g, s * 2.5, 1.42, 0.6, 1.1); }
      parte(G.caja, MO, [0, 0.65, -2.1], [0.1, 1.0, 0.8], g); parte(G.caja, MO, [0, 0.15, -2.2], [2.4, 0.08, 0.7], g);
      for (const s of [-1, 1]) { parte(G.caja, NE, [s * 0.6, -0.8, 1.2], [0.07, 0.9, 0.07], g); parte(G.cil, 0x111111, [s * 0.75, -1.25, 1.2], [0.35, 0.12, 0.35], g, [0, 0, PI / 2]); }
      cabezaRobot(g, 0, 0.85, 0.2); parte(G.caja, 0xffffff, [0.25, 0.65, -0.4], [0.1, 0.05, 0.8], g, [0, 0.4, 0]); // bufanda blanca
      break;
    }
    case 'hidroavion': {
      parte(new THREE.CylinderGeometry(0.5, 0.65, 4.8, 6), MO, [0, 0, 0], null, g, [PI / 2, 0, 0]);
      parte(G.cil, NE, [0, 0, 2.45], [0.65, 0.4, 0.65], g, [PI / 2, 0, 0]);
      heliceEnemiga(g, 2.75, 0, 1.25, 3);
      parte(G.caja, MO, [0, 1.0, 0.4], [8.2, 0.14, 1.4], g);
      for (const s of [-1, 1]) {
        parte(G.caja, MA, [s * 3.9, 1.0, 0.4], [0.4, 0.16, 1.4], g); simbolo(g, s * 2.6, 1.08, 0.4, 1.1);
        parte(G.cil6, NE, [s * 0.9, 0.5, 0.6], [0.05, 1.1, 0.05], g, [0, 0, s * 0.6]);
        parte(G.caja, 0xdcdce6, [s * 1.3, -1.3, 0.5], [0.5, 0.4, 3.8], g);
        parte(G.cil6, NE, [s * 1.3, -0.75, 0.5], [0.05, 0.9, 0.05], g);
      }
      parte(G.caja, MO, [0, 0.7, -2.2], [0.1, 1.2, 0.8], g); parte(G.caja, MO, [0, 0.2, -2.3], [2.6, 0.08, 0.7], g);
      cabezaRobot(g, 0, 0.7, 0.9); parte(G.bola, matCupula, [0, 0.65, 0.9], [0.42, 0.4, 0.6], g);
      break;
    }
    case 'globo': {
      const env = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matTex(0xffffff, texGlobo)); env.scale.set(5, 6, 5); g.add(env);
      parte(G.cono, MO, [0, -6.3, 0], [2.2, 2.0, 2.2], g, [PI, 0, 0]);
      parte(G.caja, 0x7a4a24, [0, -8.6, 0], [2.2, 1.4, 2.2], g);
      parte(G.caja, 0xc9a227, [0, -7.95, 0], [2.3, 0.15, 2.3], g);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parte(G.cil6, 0x3a2a1a, [sx * 1.0, -7.4, sz * 1.0], [0.03, 1.4, 0.03], g);
      parte(G.cil6, 0x222222, [0, -8.6, 1.5], [0.2, 1.2, 0.2], g, [PI / 2, 0, 0]);   // cañoncito
      cabezaRobot(g, 0, -7.3, 0, 1.4, true);
      const ll = new THREE.Mesh(G.cono, brillo(0xffa040)); ll.position.set(0, -7.1, 0); ll.scale.set(0.35, 0.9, 0.35); ll.name = 'llama'; g.add(ll);
      break;
    }
    case 'galeon': case 'galeonJefe': {
      const jefe = tipo === 'galeonJefe', MAD = 0x6b4423, MAD2 = 0x4e3018, ORO = 0xc9a227;
      parte(G.caja, MAD, [0, -0.9, 0], [3.4, 2.0, 11], g);
      parte(G.caja, MAD2, [0, -1.7, 0], [2.2, 0.8, 10], g);
      parte(G.cono4, MAD, [0, -0.9, 6.3], [1.9, 2.2, 1.1], g, [PI / 2, PI / 4, 0]);
      parte(G.caja, MA, [0, -0.6, 0], [3.45, 0.3, 11.02], g);
      parte(G.caja, MAD, [0, 0.7, -4.3], [3.4, 1.4, 2.6], g);
      parte(G.caja, MAD, [0, 0.4, 4.4], [3.0, 0.8, 1.8], g);
      for (const s of [-1, 1]) {
        parte(G.caja, ORO, [s * 1.7, 0.15, 0], [0.15, 0.15, 11], g);
        for (const z of [-2.4, 0, 2.4]) { const cg = grupo(g, [s * 1.75, -0.2, z], [0, 0, -s * PI / 2]); parte(G.cil6, 0x1a1a1a, [0, 0.4, 0], [0.18, 0.9, 0.18], cg); }
      }
      const mastiles = [[3.4, 8.5], [0, 10.5], [-2.6, 8]];
      for (const [z, h] of mastiles) {
        parte(G.cil6, 0x5b3a1e, [0, h / 2 - 0.2, z], [0.16, h, 0.16], g);
        for (const [y, w, hh] of [[h * 0.4, 4.6, 2.8], [h * 0.75, 3.6, 2.2]]) {
          parte(G.caja, 0x5b3a1e, [0, y + hh / 2 + 0.1, z], [w + 0.4, 0.12, 0.12], g);
          parte(G.caja, 0xf6eaff, [0, y, z + 0.12], [w, hh, 0.1], g);
          simbolo(g, 0, y, z + 0.2, hh * 0.75, 0, 0);
        }
      }
      parte(G.caja, 0x111111, [0.7, 10.3, 0], [1.4, 0.9, 0.05], g);  // bandera negra con la flor
      simbolo(g, 0.7, 10.3, 0.04, 0.7, 0, 0);
      cabezaRobot(g, 0, 1.75, -4.3, 1.5, true);
      if (jefe) { parte(G.caja, ORO, [0, 1.5, -5.65], [3.5, 0.5, 0.1], g); for (const s of [-1, 1]) parte(G.bola, matB(0xffd36a), [s * 1.5, 2.0, -5.6], 0.25, g); }
      break;
    }
    case 'ornitoptero': { // pájaro de hierro de 1819 que aletea
      parte(G.esfera, MO, [0, 0, 0], [0.8, 0.7, 2.0], g);
      parte(G.cono, ME, [0, 0, 2.3], [0.35, 1.0, 0.35], g, [PI / 2, 0, 0]);
      cabezaRobot(g, 0, 0.75, 0.6);
      for (const [n, s] of [['aleteaI', -1], ['aleteaD', 1]]) {
        const al = grupo(g, [s * 0.6, 0.2, 0], null, n);
        parte(G.caja, MO, [s * 2.2, 0, 0], [4.4, 0.1, 1.6], al);
        for (let k = 0; k < 4; k++) parte(G.caja, MA, [s * (1 + k * 1.0), 0.06, -0.9], [0.8, 0.06, 0.6], al);
        parte(G.cil6, 0xc9a227, [s * 2.2, 0.08, 0.8], [0.06, 4.4, 0.06], al, [0, 0, PI / 2]);
      }
      parte(G.caja, MO, [0, 0, -2.3], [2.2, 0.08, 1.2], g);
      simbolo(g, 0, 0.72, -0.4, 0.9);
      for (const s of [-1, 1]) parte(G.cil6, NE, [s * 0.4, -0.6, 0.6], [0.08, 0.6, 0.08], g);
      break;
    }
    case 'dirigible': { // pequeño dirigible de guerra
      parte(G.bola, 0x8a7aa0, [0, 0, 0], [2.6, 2.6, 7], g);
      for (const z of [-3, 0, 3]) { const r = 2.6 * Math.sqrt(1 - (z / 7) ** 2) + 0.05; parte(new THREE.TorusGeometry(1, 0.06, 4, 20), MA, [0, 0, z], [r, r, 1], g); }
      for (let k = 0; k < 4; k++) { const fg = grupo(g, [0, 0, -6], [0, 0, k * PI / 2]); parte(G.caja, MO, [0, 2, 0], [0.15, 2, 1.6], fg); }
      parte(G.caja, 0x5b3a1e, [0, -3.3, 0.5], [1.4, 1, 3.2], g);
      cabezaRobot(g, 0, -2.9, 1.8);
      heliceEnemiga(g, -1.4, -3.3, 0.9, 2);
      for (const s of [-1, 1]) simbolo(g, s * 2.62, 0.3, 1, 2.6, 0, s * PI / 2);
      break;
    }
    case 'helicopteroChico': { const h = crearModeloJefe('helicoptero'); h.scale.setScalar(0.42); g.add(h); break; }
    case 'jetE': jetRobot(g, false, false); break;
    case 'jetR': jetRobot(g, true, false); break;
    case 'robotJet': jetRobot(g, true, true); break;
    case 'dron': {
      parte(G.esfera, MO, [0, 0, 0], [1.3, 1.0, 1.3], g);
      parte(new THREE.TorusGeometry(1.3, 0.12, 5, 18), MA, [0, 0, 0], null, g, [PI / 2, 0, 0]);
      const o = parte(G.bola, matOjo, [0, 0, 1.15], [0.5, 0.5, 0.3], g); o.userData.ojo = true;
      for (let k = 0; k < 4; k++) {
        const an = k / 4 * PI * 2 + PI / 4, x = Math.cos(an) * 2.1, z = Math.sin(an) * 2.1;
        parte(G.caja, NE, [x / 2, 0.1, z / 2], [0.2, 0.15, 2.2], g, [0, -an + PI / 2, 0]);
        parte(G.cil6, NE, [x, 0.25, z], [0.2, 0.4, 0.2], g);
        const r = grupo(g, [x, 0.5, z], null, 'giraY'); parte(G.caja, ME, [0, 0, 0], [1.6, 0.04, 0.18], r); parte(G.caja, ME, [0, 0, 0], [0.18, 0.04, 1.6], r);
      }
      simbolo(g, 0, 1.02, 0, 1.2);
      break;
    }
    case 'robot': { // robot volador de 2030
      parte(G.caja, ME, [0, 0, 0], [1.3, 0.8, 1.9], g);
      parte(G.caja, MO, [0, 0.42, 0.1], [1.0, 0.1, 1.4], g);
      simbolo(g, 0, 0.48, 0.1, 0.9);
      const cab = grupo(g, [0, 0.15, 1.35]);
      parte(G.caja, ME, [0, 0, 0], [0.75, 0.65, 0.7], cab);
      parte(G.caja, 0x111111, [0, 0.05, 0.36], [0.6, 0.22, 0.02], cab);
      for (const s of [-1, 1]) { const o = parte(G.caja, matOjo, [s * 0.15, 0.05, 0.38], [0.15, 0.1, 0.03], cab); o.userData.ojo = true; }
      parte(G.cil6, ME, [0, 0.5, 0], [0.03, 0.4, 0.03], cab); parte(G.bola, matB(MA), [0, 0.72, 0], 0.07, cab);
      for (const s of [-1, 1]) {
        parte(G.caja, MO, [s * 0.95, 0.0, 0.9], [0.35, 0.35, 1.3], g);
        parte(G.cil6, NE, [s * 0.95, 0.0, 1.75], [0.16, 0.6, 0.16], g, [PI / 2, 0, 0]);
        parte(G.bola, matB(MA), [s * 0.95, 0.0, 2.08], 0.1, g);
        parte(G.caja, ME, [s * 0.4, 0, -1.55], [0.42, 0.42, 1.3], g);
        parte(G.caja, NE, [s * 0.4, 0, -2.3], [0.5, 0.5, 0.4], g);
        const f = new THREE.Mesh(G.cono, brillo(0x5ff8ff)); f.position.set(s * 0.4, 0, -2.95); f.rotation.x = -PI / 2; f.scale.set(0.22, 0.9, 0.22); g.add(f);
      }
      break;
    }
  }
  return unirHijos(g);
}
// Jefes: modelos grandes
function crearModeloJefe(tipo) {
  const g = new THREE.Group();
  if (tipo === 'bombardero') {
    const base = crearEnemigo('basico'); base.scale.setScalar(3.2); g.add(base);
    for (const s of [-1, 1]) for (const k of [1, 2]) {
      parte(G.cil, NE, [s * k * 3.0, -0.7, 1.2], [0.7, 2.8, 0.7], g, [PI / 2, 0, 0]);
      parte(G.cono, matB(MA), [s * k * 3.0, -0.7, 2.8], [0.45, 0.7, 0.45], g, [PI / 2, 0, 0]);
      heliceEnemiga(g, 3.2, -0.7, 1.2, 3, s * k * 3.0);
    }
    parte(G.caja, NE, [0, -2.2, 0], [2.4, 1.2, 5], g);
  } else if (tipo === 'galeonJefe') {
    const b = crearEnemigo('galeonJefe'); b.scale.setScalar(2.2); g.add(b);
  } else if (tipo === 'zepelin') {
    parte(G.bola, 0x8a7aa0, [0, 0, 0], [8, 8, 26], g);
    for (const z of [-12, 0, 12]) parte(new THREE.TorusGeometry(1, 0.03, 4, 24), MA, [0, 0, z], [8 * Math.sqrt(1 - (z / 26) ** 2) + 0.1, 8 * Math.sqrt(1 - (z / 26) ** 2) + 0.1, 1], g);
    for (let k = 0; k < 4; k++) { const fg = grupo(g, [0, 0, -22], [0, 0, k * PI / 2]); parte(G.caja, MO, [0, 6, 0], [0.4, 6, 5], fg); }
    parte(G.caja, 0x4a3a5a, [0, -9.2, 2], [3.4, 2.4, 10], g);
    for (let k = -3; k <= 3; k++) for (const s of [-1, 1]) parte(G.caja, matB(0xffe08a), [s * 1.72, -9.0, 2 + k * 1.3], [0.05, 0.8, 0.8], g);
    cabezaRobot(g, 0, -9.0, 7.3, 1.6);
    for (const s of [-1, 1]) {
      parte(G.cil, NE, [s * 6.5, -5.5, -6], [0.8, 3, 0.8], g, [PI / 2, 0, 0]);
      parte(G.caja, NE, [s * 4, -6.5, -6], [3.5, 0.25, 0.8], g);
      heliceEnemiga(g, -7.7, -5.5, 1.6, 3, s * 6.5);
      simbolo(g, s * 8.05, 1, 4, 9, 0, s * PI / 2);
    }
  } else if (tipo === 'helicoptero') {
    const h = grupo(g, null); h.scale.setScalar(1.8);
    parte(G.esfera, MO, [0, 0, 0], [2.2, 2.0, 4.2], h);
    parte(G.bola, matVidrioOsc, [0, 0.4, 2.6], [1.5, 1.2, 1.6], h);
    cabezaRobot(h, 0, 0.6, 2.7, 1.4);
    parte(new THREE.CylinderGeometry(0.3, 0.6, 7, 6), MO, [0, 0.5, -6.5], null, h, [PI / 2, 0, 0]);
    parte(G.caja, MO, [0, 1.6, -9.8], [0.15, 2.2, 1.2], h);
    const tr = grupo(h, [0.3, 1.4, -9.8], null, 'giraX'); parte(G.caja, ME, [0, 0, 0], [0.05, 2.4, 0.25], tr); parte(G.caja, ME, [0, 0, 0], [0.05, 0.25, 2.4], tr);
    parte(G.cil6, NE, [0, 2.1, 0], [0.4, 0.6, 0.4], h);
    const rot = grupo(h, [0, 2.45, 0], null, 'giraY'); for (let k = 0; k < 4; k++) parte(G.caja, ME, [0, 0, 0], [0.45, 0.06, 13], rot, [0, k * PI / 4, 0]);
    parte(G.caja, NE, [0, -0.5, 0.3], [6.4, 0.25, 1.4], h);
    for (const s of [-1, 1]) {
      parte(G.cil, NE, [s * 3, -0.9, 0.3], [0.45, 2.2, 0.45], h, [PI / 2, 0, 0]); parte(G.cono, matB(MA), [s * 3, -0.9, 1.5], [0.45, 0.4, 0.45], h, [PI / 2, 0, 0]);
      parte(G.caja, NE, [s * 1.3, -2.2, 0], [0.15, 0.15, 5], h); parte(G.caja, NE, [s * 1.0, -1.6, 0.8], [0.1, 1.2, 0.1], h);
      simbolo(h, s * 2.25, 0.3, -0.5, 2.2, 0, s * PI / 2);
    }
    parte(G.cil6, NE, [0, -1.6, 3.5], [0.15, 1.6, 0.15], h, [PI / 2, 0, 0]);
    unirHijos(h);
  } else if (tipo === 'fortaleza') { // Fortaleza de Vapor (1819): casco de madera, globos, chimeneas y cañones
    const MAD = 0x6b4423, BR = 0xc9a227;
    parte(G.caja, MAD, [0, 0, 0], [10, 5, 26], g);
    parte(G.cono4, MAD, [0, 0, 14.5], [5.5, 6, 3.2], g, [PI / 2, PI / 4, 0]);
    parte(G.caja, MA, [0, 1.2, 0], [10.1, 0.6, 26.1], g);
    for (const s of [-1, 1]) for (let k = -3; k <= 3; k++) { const cg = grupo(g, [s * 5.1, -0.6, k * 3.2], [0, 0, -s * PI / 2]); parte(G.cil6, 0x1a1a1a, [0, 0.5, 0], [0.35, 1.2, 0.35], cg); }
    for (const [x, z, r] of [[0, -4, 6], [-6, 6, 4.5], [6, 6, 4.5]]) { parte(G.bola, 0x9a8ab0, [x, 8 + r * 0.4, z], [r, r * 0.8, r * 1.6], g); parte(G.cil6, 0x3a2a1a, [x, 4, z], [0.15, 6, 0.15], g); }
    for (const z of [-9, 9]) { const ch = grupo(g, [0, 4.5, z], null, 'chimenea'); parte(G.cil6, 0x2a2a2a, [0, 0, 0], [0.9, 5, 0.9], ch); parte(G.cil6, BR, [0, 2.6, 0], [1.2, 0.4, 1.2], ch); }
    for (const s of [-1, 1]) for (const z of [-8, 8]) { parte(G.cil, BR, [s * 7, 0, z], [0.8, 2, 0.8], g, [PI / 2, 0, 0]); parte(G.caja, MAD, [s * 6, 0, z], [2, 0.4, 0.6], g); heliceEnemiga(g, z + 1.2, 0, 2, 4, s * 7); }
    cabezaRobot(g, 0, 3.6, 10, 2.2, true);
    parte(G.caja, 0x111111, [0, 13, -4], [3, 2, 0.08], g); simbolo(g, 0, 13, -3.94, 1.8, 0, 0);
    for (const s of [-1, 1]) simbolo(g, s * 5.06, 0, -3, 4, 0, s * PI / 2);
  } else if (tipo === 'condorRobot') { // Cóndor Tuerca (1970): cóndor robot gigante que aletea
    const GR2 = 0x3a3a44;
    parte(G.esfera, GR2, [0, 0, 0], [3.4, 3, 8], g);
    parte(new THREE.TorusGeometry(2.4, 0.9, 6, 16), 0xf2f2f2, [0, 0.6, 5.6], null, g);               // collar blanco
    const cab = grupo(g, [0, 1.4, 8]);
    parte(G.esfera, 0xc77a7a, [0, 0, 0], [1.6, 1.5, 1.9], cab);
    parte(G.cono, 0xe8d8a0, [0, -0.4, 2.2], [0.6, 1.6, 0.6], cab, [PI / 2, 0, 0]);
    parte(G.cono, 0x444444, [0, -0.9, 2.8], [0.3, 0.6, 0.3], cab, [PI, 0, 0]);
    for (const s of [-1, 1]) { const o = parte(G.caja, matOjo, [s * 0.7, 0.35, 1.4], [0.45, 0.3, 0.1], cab); o.userData.ojo = true; }
    parte(G.caja, 0x8a3a3a, [0, 1.6, 0.6], [0.4, 0.8, 1.4], cab);
    for (const [n, s] of [['aleteaI', -1], ['aleteaD', 1]]) {
      const al = grupo(g, [s * 2.6, 1, 0.5], null, n);
      parte(G.caja, GR2, [s * 7, 0, 0], [14, 0.6, 5], al);
      parte(G.caja, 0xf2f2f2, [s * 7, 0.32, -1.6], [13, 0.1, 1.4], al);
      for (let k = 0; k < 5; k++) parte(G.caja, 0x22222a, [s * (13.6 + k * 0.1), 0, -2 + k * 1.0], [3, 0.25, 0.7], al, [0, s * (0.25 - k * 0.12), 0]);
      parte(G.cil6, ME, [s * 7, -0.5, 1.8], [0.25, 13, 0.25], al, [0, 0, PI / 2]);
    }
    for (let k = 0; k < 5; k++) parte(G.caja, 0x22222a, [(k - 2) * 0.9, 0, -9], [0.8, 0.3, 4], g, [0, (k - 2) * 0.15, 0]);
    for (const s of [-1, 1]) { parte(G.cil6, ME, [s * 1.2, -3, 2], [0.3, 2.4, 0.3], g); parte(G.caja, ME, [s * 1.2, -4.2, 2.8], [1, 0.3, 1.6], g); }
    simbolo(g, 0, 3.02, -1, 4);
  } else if (tipo === 'naveP') {
    // La nave de guerra de Petunia: núcleo con escudo, dos cañones y dos alas que se destruyen por separado
    parte(G.esferaS, NE, [0, 0, 0], [14, 5, 24], g);
    parte(G.caja, MO, [0, 2.6, -2], [14, 2, 22], g);
    parte(G.caja, 0x111118, [0, 3.2, 19.5], [10, 5, 1.2], g);
    for (const s of [-1, 1]) parte(G.caja, matB(MA), [s * 2.3, 4.0, 20.15], [2.2, 1.0, 0.1], g);
    parte(G.caja, matB(MA), [0, 2.0, 20.15], [3.5, 0.35, 0.1], g);
    const flor = grupo(g, [0, 4.2, -2], null, 'giraLento');
    for (let k = 0; k < 5; k++) { const an = k / 5 * PI * 2; parte(G.esfera, MA, [Math.cos(an) * 3.4, 0, Math.sin(an) * 3.4], [2.6, 0.6, 1.7], flor, [0, -an, 0]); }
    parte(G.esfera, 0xffd23f, [0, 0.3, 0], [1.6, 0.8, 1.6], flor);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(G.cono, brillo(MA)); f.position.set(s * 5, 0, -25); f.rotation.x = -PI / 2; f.scale.set(1.6, 4, 1.6); g.add(f); }
    const nucleo = grupo(g, [0, -4.5, 0], null, 'p_nucleo');
    parte(G.esfera, matB(0xff5fc8), [0, 0, 0], 3.2, nucleo);
    const esc = new THREE.Mesh(G.esfera, brillo(0x5ff8ff, 0.28)); esc.scale.setScalar(16); esc.name = 'escudo'; g.add(esc);
    for (const s of [-1, 1]) {
      const c = grupo(g, [s * 9, 0.5, 13], null, 'p_canon');
      parte(G.cil6, NE, [0, 0, 0], [2.6, 2.2, 2.6], c);
      for (const d of [-0.8, 0.8]) parte(G.cil6, ME, [d, 0.3, 2.8], [0.45, 4.5, 0.45], c, [PI / 2, 0, 0]);
      parte(G.bola, matB(MA), [0, 1.3, 0], 0.6, c);
      const w = grupo(g, [s * 19, 0, -3], null, 'p_ala');
      parte(G.caja, MO, [0, 0, 0], [15, 1.2, 12], w, [0, 0, s * 0.08]);
      parte(G.caja, MA, [s * 7.6, 0.6, 0], [0.8, 1.6, 12], w);
      parte(G.cil, NE, [s * 3, -1.4, -2], [1.6, 8, 1.6], w, [PI / 2, 0, 0]);
      const fw = new THREE.Mesh(G.cono, brillo(MA)); fw.position.set(s * 3, -1.4, -7); fw.rotation.x = -PI / 2; fw.scale.set(1.1, 3, 1.1); w.add(fw);
      simbolo(w, s * 1, 0.62, 0, 7);
      unirHijos(c); unirHijos(w);
    }
  }
  return unirHijos(g);
}
// Cohete del jugador y misil enemigo (nariz hacia +Z)
function crearCoheteModelo(enemigo) {
  const g = new THREE.Group();
  parte(G.cil, enemigo ? MO : 0xf4f4f4, [0, 0, 0], [0.2, 1.6, 0.2], g, [PI / 2, 0, 0]);
  parte(G.cono, enemigo ? matB(0xff2a2a) : 0xe23a3a, [0, 0, 1.05], [0.2, 0.5, 0.2], g, [PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) parte(G.caja, enemigo ? NE : AZ, [0, 0, -0.6], [0.04, 0.6, 0.4], g, [0, 0, k * PI / 2]);
  return unirHijos(g);
}
// Premios: huesito, caja de cohetes, estrella
function crearPremioModelo(tipo) {
  const g = new THREE.Group(); let color;
  if (tipo === 'hueso') {
    parte(G.cil, 0xfff3dc, [0, 0, 0], [0.4, 2.6, 0.4], g, [0, 0, PI / 2]);
    for (const x of [-1.35, 1.35]) for (const y of [-0.38, 0.38]) parte(G.bola, 0xfff3dc, [x, y, 0], 0.5, g);
    color = 0xff8fc8;
  } else if (tipo === 'caja') {
    parte(G.caja, 0x56722f, [0, 0, 0], [2.4, 1.8, 1.8], g);
    parte(G.caja, 0xffd166, [0, 0, 0], [2.45, 0.35, 1.85], g);
    parte(G.cil, 0xffffff, [0, 1.25, 0], [0.22, 1.2, 0.22], g, [0, 0, PI / 2]);
    parte(G.cono, 0xe23a3a, [0.85, 1.25, 0], [0.22, 0.45, 0.22], g, [0, 0, -PI / 2]);
    color = 0xffa53a;
  } else {
    const f = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.6 : 1.4, an = i / 10 * PI * 2 + PI / 2; const x = Math.cos(an) * r, y = Math.sin(an) * r; if (i) f.lineTo(x, y); else f.moveTo(x, y); }
    const geo = new THREE.ExtrudeGeometry(f, { depth: 0.4, bevelEnabled: false }); geo.center();
    parte(geo, 0xffd23f, [0, 0, 0], null, g);
    color = 0xfff27a;
  }
  g.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })));
  unirHijos(g); g.scale.setScalar(1.3);
  return g;
}
const PROTOS = {};
function proto(clave, fabrica) { if (!PROTOS[clave]) PROTOS[clave] = fabrica(); return PROTOS[clave]; }

// ---- Carros para las calles ----
function crearCarro(estilo, color) {
  const c = new THREE.Group(), taxi = estilo.startsWith('taxi');
  if (taxi) estilo = { taxiC: 'clasico', taxiN: 'normal', taxi: 'moderno' }[estilo];
  if (estilo === 'bus') {
    parte(G.caja, color, [0, 1.5, 0], [2.6, 2.4, 9], c);
    parte(G.caja, 0x223344, [0, 2.0, 0], [2.65, 0.8, 8.2], c);
    parte(G.caja, 0xffffff, [0, 2.75, 0], [2.6, 0.12, 9], c);
  } else if (estilo === 'clasico') {
    parte(G.caja, color, [0, 0.65, 0], [2.0, 0.7, 4.4], c);
    parte(G.esfera, color, [0, 1.1, -0.2], [0.95, 0.55, 1.3], c);
    parte(G.caja, 0x2a3a4a, [0, 1.15, -0.2], [1.92, 0.35, 1.6], c);
    for (const z of [-2.25, 2.25]) parte(G.caja, 0xdddddd, [0, 0.45, z], [2.1, 0.2, 0.15], c);
  } else {
    parte(G.caja, color, [0, 0.6, 0], [2.0, 0.6, 4.4], c);
    parte(G.caja, 0x1e2a36, [0, 1.1, -0.2], [1.7, 0.5, 2.2], c);
    if (estilo === 'moderno') parte(G.caja, matB(0x5ff8ff), [0, 0.35, 0], [2.04, 0.08, 4.44], c);
  }
  if (taxi) parte(G.caja, 0xffffff, [0, 1.45, -0.2], [0.6, 0.2, 0.25], c);
  const ruedas = estilo === 'bus' ? [-3, 3] : [-1.4, 1.4];
  for (const s of [-1, 1]) for (const z of ruedas) parte(G.cil6, 0x151515, [s * (estilo === 'bus' ? 1.2 : 0.95), 0.38, z], [0.38, 0.25, 0.38], c, [0, 0, PI / 2]);
  for (const s of [-1, 1]) { parte(G.caja, matB(0xfff2c0), [s * 0.65, 0.7, estilo === 'bus' ? 4.52 : 2.22], [0.3, 0.18, 0.05], c); parte(G.caja, matB(0xff3333), [s * 0.7, 0.7, estilo === 'bus' ? -4.52 : -2.22], [0.3, 0.15, 0.05], c); }
  return unirHijos(c);
}

// =====================================================================
// 6. ESCENARIOS
// =====================================================================
const TEJA = 0xc4552f;
const COLORES_CASAS = [0xf7c8a0, 0xf5e6a8, 0xa8d8e8, 0xf2a7b5, 0xc8e6a0, 0xffffff, 0xe8c4f0, 0xffb27a, 0xa0e0c8];
const COLORES_COLONIAL = [0xf7a8b8, 0xffd166, 0x7ec8e3, 0xf4a261, 0x90be6d, 0xc8a2e8, 0xfff4e0, 0xff8c69, 0x5ec2b7];
const COLORES_CARRO = [0xe23a3a, 0x2a5bd7, 0xf6f6f6, 0x2e2e2e, 0x3f9b5a, 0x9aa0aa, 0xff8c42];
const ARBOLES_FLOR = [0xf27ab8, 0xffd23f, 0x4f9a3c, 0x5fae45, 0x3f8a34, 0xe05a9a];

function crearTerreno(fAltura, fColor, tam = 2600, seg = ES_TACTIL ? 84 : 100) {
  const g = new THREE.PlaneGeometry(tam, tam, seg, seg); g.rotateX(-PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = fAltura(x, z);
    p.setY(i, y); fColor(c, x, y, z); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 }));
  m.userData.noUnir = true; m.userData.propio = true; return m;
}
function crearMar(gr, color = 0x1878b8) {
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x88ccff, transparent: true, opacity: 0.9 }));
  mar.rotation.x = -PI / 2; gr.add(mar);
}
function casa(gr, x, z, h0, ancho, alto, fondo, color, techo, rotY, futuro, tex = texFachada) {
  const c = new THREE.Group(); c.position.set(x, h0, z); c.rotation.y = rotY || 0; gr.add(c);
  parte(G.caja, matTex(color, tex), [0, alto / 2, 0], [ancho, alto, fondo], c);
  if (techo === 'dos') { const rh = Math.min(ancho, fondo) * 0.42; parte(G.piramide, TEJA, [0, alto + rh / 2, 0], [ancho * 1.1, rh, fondo * 1.1], c); }
  else {
    parte(G.caja, 0xd9d2c4, [0, alto + 0.25, 0], [ancho + 0.4, 0.5, fondo + 0.4], c);
    if (futuro && rnd() < 0.6) { for (const s of [-1, 1]) parte(G.caja, 0x1d3f7a, [s * ancho * 0.22, alto + 0.85, 0], [ancho * 0.38, 0.12, fondo * 0.6], c, [0.35, 0, 0]); }
    else if (rnd() < 0.7) { parte(G.cil6, 0x1c1c1c, [ancho * 0.25, alto + 1.4, fondo * 0.2], [1.1, 1.8, 1.1], c); parte(G.cil6, 0x2a2a2a, [ancho * 0.25, alto + 2.35, fondo * 0.2], [1.15, 0.15, 1.15], c); }
    if (rnd() < 0.4) parte(G.cil6, 0x999999, [-ancho * 0.3, alto + 2, -fondo * 0.25], [0.06, 3.5, 0.06], c);
  }
  if (rnd() < 0.3) { parte(G.caja, 0x3a3a3a, [0, alto * 0.55, fondo / 2 + 0.6], [ancho * 0.6, 0.15, 1.2], c); parte(G.caja, 0x222222, [0, alto * 0.55 + 0.6, fondo / 2 + 1.15], [ancho * 0.6, 1.0, 0.08], c); }
}
function arbol(gr, x, z, h0, esc, color) {
  parte(G.cil6, 0x7a5230, [x, h0 + 2 * esc, z], [0.5 * esc, 4 * esc, 0.5 * esc], gr);
  parte(G.esferaS, color || 0x4f9a3c, [x, h0 + 5.5 * esc, z], [3 * esc, 2.6 * esc, 3 * esc], gr, [rnd(), rnd(), 0]);
  parte(G.esferaS, color || 0x4f9a3c, [x + 1.2 * esc, h0 + 4.8 * esc, z + 0.6 * esc], [1.8 * esc, 1.6 * esc, 1.8 * esc], gr, [rnd(), rnd(), 0]);
}
function eucalipto(gr, x, z, h0, esc) {
  parte(G.cil6, 0x8a7a66, [x, h0 + 4 * esc, z], [0.35 * esc, 8 * esc, 0.35 * esc], gr);
  parte(G.cono, elegirR([0x3f6e4a, 0x4a7a55, 0x355f40]), [x, h0 + 9 * esc, z], [2.2 * esc, 9 * esc, 2.2 * esc], gr);
}
function palmera(gr, x, z, h0, esc) {
  const p = new THREE.Group(); p.position.set(x, h0, z); p.rotation.y = rnd() * 6.28; gr.add(p);
  let y = 0, xo = 0;
  for (let i = 0; i < 5; i++) { parte(G.cil6, 0x9b7651, [xo, y + 1.2 * esc, 0], [0.35 * esc, 2.4 * esc, 0.35 * esc], p, [0, 0, -0.08 * i]); y += 2.3 * esc; xo += 0.2 * i * esc; }
  for (let k = 0; k < 7; k++) { const a = k / 7 * PI * 2; parte(G.caja, 0x3f9b3a, [xo + Math.cos(a) * 2.2 * esc, y + 0.3 * esc, Math.sin(a) * 2.2 * esc], [4.5 * esc, 0.15 * esc, 0.9 * esc], p, [0, -a, -0.35]); }
  for (let k = 0; k < 3; k++) parte(G.esferaS, 0x6b4a22, [xo + rr(-0.4, 0.4) * esc, y - 0.3 * esc, rr(-0.4, 0.4) * esc], 0.35 * esc, p);
}
const matNube = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x8a8f99, flatShading: true });
function nube(gr, x, y, z, esc) {
  for (let k = 0; k < 5; k++) parte(G.esferaS, matNube, [x + rr(-9, 9) * esc, y + rr(-2, 3) * esc, z + rr(-5, 5) * esc], rr(6, 10) * esc, gr, [rnd() * 3, rnd() * 3, 0]);
}
function nubes(gr, n, cx, cz) { for (let i = 0; i < n; i++) { const a = rr(0, 6.28), r = rr(100, 900); nube(gr, cx + Math.cos(a) * r, rr(170, 260), cz + Math.sin(a) * r, rr(0.8, 1.6)); } }
function bandera(gr, x, y, z, esc) {
  parte(G.cil6, 0xdddddd, [x, y + 4 * esc, z], [0.15 * esc, 8 * esc, 0.15 * esc], gr);
  parte(G.caja, 0xffd23f, [x + 1.6 * esc, y + 7.2 * esc, z], [3 * esc, 1 * esc, 0.1], gr);
  parte(G.caja, 0x2a5bd7, [x + 1.6 * esc, y + 6.45 * esc, z], [3 * esc, 0.5 * esc, 0.1], gr);
  parte(G.caja, 0xe23a3a, [x + 1.6 * esc, y + 5.95 * esc, z], [3 * esc, 0.5 * esc, 0.1], gr);
}
function farol(gr, x, z, h0, futuro) {
  parte(G.cil6, 0x55585e, [x, h0 + 3.5, z], [0.15, 7, 0.15], gr);
  parte(G.caja, 0x55585e, [x + 0.8, h0 + 7, z], [1.6, 0.12, 0.12], gr);
  parte(G.esferaS, matB(futuro ? 0xd9fbff : 0xfff0b0), [x + 1.5, h0 + 6.8, z], 0.35, gr);
}
function iglesia(gr, x, z, h0, rotY, color, torres) {
  const c = grupo(gr, [x, h0, z], [0, rotY, 0]);
  parte(G.caja, color, [0, 7, 0], [14, 14, 30], c);
  parte(G.piramide, TEJA, [0, 16, 0], [15, 4, 31], c);
  parte(G.caja, 0x5a3218, [0, 3, 15.1], [3.5, 6, 0.3], c);
  parte(G.cil, color, [0, 18, 15.1], [1.6, 0.4, 1.6], c, [PI / 2, 0, 0]);
  const xs = torres === 2 ? [-5, 5] : [0];
  for (const tx of xs) { parte(G.caja, color, [tx, 12, 13], [4.5, 24, 4.5], c); parte(G.caja, 0x3a2a20, [tx, 20, 15.3], [1.6, 2.4, 0.1], c); parte(G.piramide, color, [tx, 26.5, 13], [4.6, 5, 4.6], c); parte(G.caja, 0xc9a227, [tx, 29.6, 13], [0.15, 1.6, 0.15], c); parte(G.caja, 0xc9a227, [tx, 29.8, 13], [0.9, 0.15, 0.15], c); }
  parte(G.esfera, color, [0, 15, -8], [5, 4, 5], c);
}

// ---- Tráfico: carros que andan por las calles ----
function crearTrafico(gr, lineas, n, estilos, alturaVuelo) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    const ln = elegirR(lineas), estilo = elegirR(estilos);
    const color = estilo.startsWith('taxi') ? 0xffd200 : (estilo === 'bus' ? elegirR([0xd93a3a, 0x2f9a4a, 0x2a6bd7]) : elegirR(COLORES_CARRO));
    const m = proto('carro_' + estilo + color, () => crearCarro(estilo, color)).clone(); gr.add(m);
    lista.push({ m, ln, s: rr(-ln.L, ln.L), sentido: rnd() < 0.5 ? 1 : -1, v: estilo === 'bus' ? rr(7, 10) : rr(9, 16) * (alturaVuelo ? 1.8 : 1), y: alturaVuelo ? rr(14, 26) : 0 });
  }
  return dt => {
    for (const c of lista) {
      c.s += c.v * dt * c.sentido;
      if (c.s > c.ln.L) c.s = -c.ln.L; else if (c.s < -c.ln.L) c.s = c.ln.L;
      const off = c.sentido * 1.9, base = c.ln.c0 || 0;
      if (c.ln.eje === 'z') { c.m.position.set(c.ln.c + off, c.ln.y + c.y, base + c.s); c.m.rotation.y = c.sentido > 0 ? 0 : PI; }
      else { c.m.position.set(base + c.s, c.ln.y + c.y, c.ln.c - off); c.m.rotation.y = c.sentido > 0 ? PI / 2 : -PI / 2; }
    }
  };
}

// ---------------- CÚCUTA (1955 y 2030) ----------------
function alturaCucuta(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.004, z * 0.004, 1) * 18 - 7) * suave(470, 640, r);
  h += suave(450, 1000, r) * (60 + fbm(x * 0.006, z * 0.006, 7) * 230);
  return Math.max(0, h);
}
function colorCucuta(c, x, y, z) {
  if (y < 1.5) c.setHex(0xb9c06c); else if (y < 35) c.setHex(0x8db552); else if (y < 130) c.setHex(0x5f9440); else c.setHex(0x9c8a6c);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 3) * 0.08 - 0.04);
}
const rioC = z => 250 + Math.sin(z * 0.005) * 25; // río Pamplonita
function construirCucuta(anio) {
  const futuro = anio === 2030, gr = new THREE.Group(); srand(futuro ? 11 : 12);
  gr.add(crearTerreno(alturaCucuta, colorCucuta));
  parte(new THREE.CylinderGeometry(455, 455, 0.06, 48), 0x4b4e54, [0, 0, 0], null, gr);    // asfalto de la ciudad
  // ---- El patio de la casa (como en la foto de Nucita) ----
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(44, 64), new THREE.MeshPhongMaterial({ map: texBaldosa, shininess: 5 }));
  piso.rotation.x = -PI / 2; piso.position.set(0, 0.1, 0); gr.add(piso);
  const matPared = new THREE.MeshPhongMaterial({ map: texPared, shininess: 5 });
  const pared = new THREE.Mesh(G.caja, matPared); pared.position.set(-22.5, 4, 0); pared.scale.set(1, 8, 64); gr.add(pared);
  const fondo = new THREE.Mesh(G.caja, matPared); fondo.position.set(0, 4, 32.5); fondo.scale.set(46, 8, 1); gr.add(fondo);
  for (let k = 0; k < 8; k++) {
    const z = -27 + k * 7.5, y = 2.2 + (k % 2) * 2;
    parte(G.cil6, 0xc0663c, [-21.5, y, z], [0.8, 1.1, 0.8], gr);
    parte(G.cono, 0x3e8f3a, [-21.4, y + 1.2, z], [0.9, 1.6, 0.9], gr);
    parte(G.esferaS, 0x57a845, [-21.2, y + 0.9, z + 0.6], 0.6, gr);
  }
  for (let k = 0; k < 6; k++) parte(G.caja, 0xb5532e, [-17 + rr(-1, 1), 0.4 + Math.floor(k / 3) * 0.8, 28 + (k % 3) * 1.2], [2.2, 0.75, 1.0], gr);
  parte(G.cil6, 0x8a6a4a, [-16, 2.2, 29], [1.2, 1.2, 1.2], gr); parte(G.cono, 0x4fa83a, [-16, 4, 29], [1.6, 2.6, 1.6], gr);
  parte(G.cil6, 0x5f7a3a, [-8, 2.5, 26], [0.1, 5, 0.1], gr);
  for (let i = 0; i < 10; i++) parte(G.bola, 0xff7a1a, [-8 + rr(-0.5, 0.5), 1 + i * 0.4, 26 + rr(-0.5, 0.5)], 0.2, gr);
  casa(gr, 32, 0, 0, 18, 9, 40, 0xf3e3c3, 'dos', 0, futuro);
  bandera(gr, 22, 9, -20, 1.2);
  // pista de despegue con rayas
  parte(G.caja, 0x3a3c40, [0, 0.06, -150], [18, 0.08, 236], gr);
  for (let k = 0; k < 14; k++) parte(G.caja, 0xffffff, [0, 0.11, -40 - k * 16], [0.6, 0.04, 7], gr);
  // ---- El barrio: manzanas con andenes, casas, árboles con flores ----
  const ESP = 62;
  for (let bx = -7; bx <= 7; bx++) for (let bz = -7; bz <= 7; bz++) {
    const cx = bx * ESP, cz = bz * ESP, r = Math.hypot(cx, cz);
    if (r > 430 || (bx === 0 && bz === 0)) continue;
    if (Math.abs(cx - rioC(cz)) < 45) continue;
    if (bx === 0 && bz < 0 && bz >= -4) { // corredor de despegue: jardines bajitos
      for (const s of [-1, 1]) { parte(G.caja, 0x7fae4a, [cx + s * 18, 0.08, cz], [18, 0.16, 54], gr); for (let k = 0; k < 3; k++) parte(G.esferaS, elegirR([0x4f9a3c, 0xf27ab8, 0xffd23f]), [cx + s * 18 + rr(-6, 6), 0.8, cz + rr(-22, 22)], 1.1, gr); }
      continue;
    }
    if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) { // parque alrededor de la casa
      parte(G.caja, 0x7fae4a, [cx, 0.08, cz], [54, 0.16, 54], gr);
      for (let k = 0; k < 4; k++) { const tx = cx + rr(-22, 22), tz = cz + rr(-22, 22); if (Math.abs(tx) < 46 && Math.abs(tz) < 40) continue; arbol(gr, tx, tz, 0.16, rr(1, 1.5), elegirR(ARBOLES_FLOR)); }
      continue;
    }
    if (bx === -2 && bz === -2) { // Parque Santander y Catedral de San José
      parte(G.caja, 0xd8cdb8, [cx, 0.12, cz], [54, 0.24, 54], gr);
      parte(G.caja, 0x7fae4a, [cx, 0.2, cz + 6], [40, 0.2, 30], gr);
      parte(G.caja, 0xd8cdb8, [cx, 0.25, cz + 6], [4, 0.2, 30], gr); parte(G.caja, 0xd8cdb8, [cx, 0.25, cz + 6], [40, 0.2, 4], gr);
      parte(G.caja, 0xbdb6a6, [cx, 1.5, cz + 6], [2.6, 3, 2.6], gr); parte(G.caja, 0x7a6a50, [cx, 4.2, cz + 6], [0.9, 2.4, 0.9], gr); parte(G.esferaS, 0x7a6a50, [cx, 5.8, cz + 6], 0.5, gr);
      for (let k = 0; k < 6; k++) arbol(gr, cx + rr(-18, 18), cz + 6 + rr(-12, 12), 0.3, rr(0.9, 1.2), elegirR([0xf27ab8, 0x4f9a3c, 0xffd23f]));
      iglesia(gr, cx, cz - 19, 0.24, 0, 0xf2ead8, 1);
      continue;
    }
    if (bx === 2 && bz === -3) { // cancha de fútbol
      parte(G.caja, 0x4fa83a, [cx, 0.12, cz], [54, 0.24, 54], gr);
      parte(G.caja, 0xffffff, [cx, 0.26, cz], [36, 0.04, 0.4], gr);
      for (const s of [-1, 1]) { parte(G.caja, 0xffffff, [cx + s * 18, 0.26, cz], [0.4, 0.04, 50], gr); parte(G.caja, 0xffffff, [cx, 0.26, cz + s * 24.8], [36, 0.04, 0.4], gr); parte(G.caja, 0xffffff, [cx, 1.3, cz + s * 24.5], [7, 0.25, 0.25], gr); for (const d of [-3.5, 3.5]) parte(G.caja, 0xffffff, [cx + d, 0.7, cz + s * 24.5], [0.25, 1.4, 0.25], gr); }
      parte(new THREE.TorusGeometry(5, 0.2, 4, 24), 0xffffff, [cx, 0.26, cz], null, gr, [PI / 2, 0, 0]);
      parte(G.caja, 0x9aa0aa, [cx + 24, 1.5, cz], [4, 3, 40], gr);
      continue;
    }
    parte(G.caja, 0xcfc6b4, [cx, 0.12, cz], [54, 0.24, 54], gr);                          // andén de la manzana
    if (futuro && r > 110 && rnd() < 0.14) { // torre futurista con bordes de neón
      const al = rr(45, 85), col = elegirR([0xdff6ff, 0xbfe9e6, 0xf0e6ff]), neon = elegirR([0x5ff8ff, 0xff4fd8, 0x7dffb0]);
      parte(G.caja, matTex(col, texEdificio), [cx, al / 2, cz], [22, al, 22], gr);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parte(G.caja, matB(neon), [cx + sx * 11.05, al / 2, cz + sz * 11.05], [0.4, al, 0.4], gr);
      for (let k = 1; k < 4; k++) parte(G.caja, matB(neon), [cx, al * k / 4, cz], [22.3, 0.35, 22.3], gr);
      parte(G.cil6, 0x55585e, [cx, al + 5, cz], [0.3, 10, 0.3], gr); parte(G.esferaS, matB(0xff3355), [cx, al + 10.3, cz], 0.6, gr);
      parte(G.cil, 0x2a2e36, [cx, al + 0.3, cz], [8, 0.6, 8], gr); parte(G.cil, matB(0xffd23f), [cx, al + 0.65, cz], [6.5, 0.1, 6.5], gr);
      continue;
    }
    if (!futuro && r < 260 && rnd() < 0.07) { // edificio de 1955
      const al = rr(16, 26); parte(G.caja, matTex(0xf2e6cc, texEdificio), [cx, al / 2, cz], [24, al, 24], gr); parte(G.caja, 0xd9d2c4, [cx, al + 0.4, cz], [25, 0.8, 25], gr);
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const hx = cx + (k % 2 ? 13.5 : -13.5), hz = cz + (k < 2 ? 13.5 : -13.5);
      casa(gr, hx, hz, 0.24, rr(10, 13.5), rr(4.8, 8.5), rr(10, 13.5), elegirR(COLORES_CASAS), rnd() < 0.55 ? 'dos' : 'plano', ((rnd() * 4) | 0) * PI / 2, futuro);
    }
    if (rnd() < 0.75) arbol(gr, cx + rr(-3, 3), cz + rr(-3, 3), 0.24, rr(0.9, 1.3), elegirR(ARBOLES_FLOR));
  }
  // ---- Río Pamplonita cruzando la ciudad, con orillas verdes y puentes ----
  for (let z = -440; z <= 440; z += 30) {
    const x1 = rioC(z), x2 = rioC(z + 30), yaw = Math.atan2(x2 - x1, 30), xm = (x1 + x2) / 2;
    parte(G.caja, 0x3a8fb0, [xm, 0.08, z + 15], [26, 0.12, 32], gr, [0, yaw, 0]);
    for (const s of [-1, 1]) parte(G.caja, 0x6fa84a, [xm + s * 19, 0.12, z + 15], [12, 0.2, 32], gr, [0, yaw, 0]);
    if (rnd() < 0.8) arbol(gr, xm + (rnd() < 0.5 ? -1 : 1) * rr(15, 23), z + rr(0, 30), 0.2, rr(0.9, 1.3), elegirR(ARBOLES_FLOR));
  }
  for (let j = -7; j <= 6; j++) { const z = (j + 0.5) * ESP; if (Math.abs(z) > 420) continue; const pu = grupo(gr, [rioC(z), 0, z]); parte(G.caja, 0x9a9a9a, [0, 0.15, 0], [50, 0.3, 11], pu); for (const s of [-1, 1]) parte(G.caja, 0xd8d8d8, [0, 0.8, s * 5.2], [50, 0.9, 0.4], pu); }
  // ---- Templo Histórico de Villa del Rosario (ladrillo rojo con cúpula) ----
  const tx = 330, tz = 360, th = alturaCucuta(tx, tz);
  const tp = grupo(gr, [tx, th, tz], [0, 0.6, 0]);
  parte(G.caja, 0x7fae4a, [0, 0.1, 0], [60, 0.2, 60], tp);
  parte(G.caja, 0xa8502f, [0, 4, 6], [14, 8, 22], tp);
  parte(G.caja, 0x8a3e22, [0, 8.3, 6], [14.6, 0.6, 22.6], tp);
  for (const [x, z] of [[-6, -8], [6, -8], [-6, -18], [6, -18]]) parte(G.caja, 0xa8502f, [x, 5, z], [2, 10, 2], tp);
  parte(G.caja, 0xa8502f, [0, 10.5, -13], [14, 1.5, 12], tp);
  parte(new THREE.SphereGeometry(5.5, 12, 6, 0, PI * 2, 0, PI / 2), 0xb85a38, [0, 11.2, -13], null, tp);
  parte(G.cil6, 0xa8502f, [0, 17.5, -13], [1.2, 1.6, 1.2], tp); parte(G.cono, 0xa8502f, [0, 19.2, -13], [1.4, 1.8, 1.4], tp);
  for (let k = 0; k < 6; k++) palmera(gr, tx + rr(-26, 26), tz + rr(-26, 26), th, rr(0.9, 1.1));
  // faroles en las esquinas
  const lineas = [];
  for (let i = -7; i <= 6; i++) {
    const c = (i + 0.5) * ESP; if (Math.abs(c) > 420) continue;
    const L = Math.sqrt(430 * 430 - c * c) - 10;
    lineas.push({ eje: 'z', c, L, y: 0.03 }, { eje: 'x', c, L, y: 0.03 });
    for (let j = -7; j <= 6; j++) { const c2 = (j + 0.5) * ESP; if (Math.hypot(c, c2) < 420 && Math.abs(c + 3.5 - rioC(c2)) > 30 && rnd() < 0.7) farol(gr, c + 3.5, c2 + 3.5, 0, futuro); }
  }
  for (let i = 0; i < (ES_TACTIL ? 90 : 150); i++) {
    const a = rr(0, 6.28), r = rr(480, 950), x = Math.cos(a) * r, z = Math.sin(a) * r;
    arbol(gr, x, z, alturaCucuta(x, z) - 0.5, rr(1.2, 2.2), elegirR([0x4f9a3c, 0x3f8a34, 0x6aa84f, 0xf27ab8]));
  }
  nubes(gr, 16, 0, 0);
  unirTodo(gr);
  const animaciones = [crearTrafico(gr, lineas, ES_TACTIL ? 26 : 42, futuro ? ['moderno', 'moderno', 'taxi', 'bus'] : ['clasico', 'clasico', 'taxiC', 'bus'])];
  if (futuro) animaciones.push(crearTrafico(gr, lineas, ES_TACTIL ? 6 : 10, ['moderno', 'taxi'], true)); // carros voladores
  gr.userData.animar = dt => animaciones.forEach(f => f(dt));
  return gr;
}

// ---------------- CARTAGENA 1741 ----------------
function costaCartagena(z) { return 170 + (fbm(z * 0.002, 3.3, 5) - 0.5) * 220; }
function alturaCartagena(x, z) {
  const d = costaCartagena(z) - x; let h;
  if (d < 0) h = -6 + d * 0.05;
  else h = suave(0, 50, d) * 3 + suave(250, 700, d) * fbm(x * 0.005, z * 0.005, 9) * 70;
  h += 48 * gauss(x, z, -230, 150, 55);   // cerro del Castillo San Felipe
  h += 80 * gauss(x, z, -120, -330, 70);  // cerro de La Popa
  return Math.max(h, -25);
}
function colorCartagena(c, x, y, z) {
  const d = costaCartagena(z) - x;
  if (y < 0) c.setHex(0xd8c48a); else if (d < 28) c.setHex(0xead79c); else if (y < 30) c.setHex(0x86b84e); else c.setHex(0x5f9a3e);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 4) * 0.06 - 0.03);
}
function canonMuralla(gr, x, y, z, yaw) { const g = grupo(gr, [x, y, z], [0, yaw, 0]); parte(G.cil6, 0x1a1a1a, [0, 0, 1.2], [0.35, 2.4, 0.35], g, [PI / 2, 0, 0]); parte(G.caja, 0x5b3a1e, [0, -0.5, 0.6], [1, 0.6, 1.6], g); }
function construirCartagena() {
  const gr = new THREE.Group(); srand(22);
  gr.add(crearTerreno(alturaCartagena, colorCartagena));
  crearMar(gr);
  parte(G.cil, 0xc9b28a, [0, 3.0, 0], [128, 0.12, 95], gr);                          // empedrado
  // Murallas con baluartes, garitas y cañones
  const M = 14, muro = [];
  for (let i = 0; i < M; i++) { const a = i / M * PI * 2; muro.push([Math.cos(a) * 135 + rr(-6, 6), Math.sin(a) * 100 + rr(-6, 6)]); }
  for (let i = 0; i < M; i++) {
    const [x1, z1] = muro[i], [x2, z2] = muro[(i + 1) % M], lx = x2 - x1, lz = z2 - z1, L = Math.hypot(lx, lz), r = -Math.atan2(lz, lx);
    parte(G.caja, 0xd6b77c, [(x1 + x2) / 2, 7, (z1 + z2) / 2], [L, 8, 6], gr, [0, r, 0]);
    parte(G.caja, 0xc9a96a, [(x1 + x2) / 2, 11.3, (z1 + z2) / 2], [L, 0.6, 1], gr, [0, r, 0]);
    parte(G.caja, 0xc9a96a, [x1, 8, z1], [13, 10, 13], gr, [0, r, 0]);
    parte(G.cil6, 0xe8d2a0, [x1, 15, z1], [1.5, 4, 1.5], gr);
    parte(G.cono, 0xd6b77c, [x1, 18, z1], [2, 2, 2], gr);
    canonMuralla(gr, x1 * 1.04, 13.6, z1 * 1.04, Math.atan2(x1, z1));
  }
  // Puerta principal (Boca del Puente)
  const T = grupo(gr, [0, 3, 104]);
  parte(G.caja, 0xf2c75c, [0, 6, 0], [16, 12, 10], T);
  parte(G.caja, 0x3b2a20, [0, 3.5, 5.1], [5, 7, 0.4], T);
  parte(G.caja, 0xf7f0dc, [0, 15, 0], [9, 6, 8], T);
  parte(G.piramide, 0xf2c75c, [0, 20, 0], [9.4, 4, 8.4], T);
  // Casitas coloniales de colores con balcones de madera y buganvilias
  for (let x = -115; x <= 115; x += 15) for (let z = -85; z <= 85; z += 15) {
    if ((x / 122) ** 2 + (z / 90) ** 2 > 1) continue;
    if (Math.abs(x) < 14 && z > 72) continue;
    if (Math.hypot(x + 25, z + 20) < 22 || Math.hypot(x - 92, z + 30) < 20) continue;
    if (rnd() < 0.12) continue;
    const a = rr(10, 13), al = rr(7, 12), g = new THREE.Group(); g.position.set(x + rr(-1, 1), 3, z + rr(-1, 1)); g.rotation.y = ((rnd() * 4) | 0) * PI / 2; gr.add(g);
    parte(G.caja, matTex(elegirR(COLORES_COLONIAL), texColonial), [0, al / 2, 0], [a, al, a], g);
    parte(G.caja, 0xb5532e, [0, al + 0.4, 0], [a + 0.8, 0.8, a + 0.8], g);
    parte(G.caja, 0x6b3e22, [0, al * 0.62, a / 2 + 0.6], [a * 0.7, 0.35, 1.2], g);
    parte(G.caja, 0x7a4a2a, [0, al * 0.62 + 0.9, a / 2 + 1.15], [a * 0.7, 1.5, 0.15], g);
    parte(G.caja, 0x6b3e22, [0, al * 0.62 + 2.0, a / 2 + 0.7], [a * 0.75, 0.2, 1.4], g);
    if (rnd() < 0.5) parte(G.esferaS, 0xff4fa0, [a * 0.3, al * 0.75, a / 2 + 0.4], 1.3, g);
  }
  // Iglesia de San Pedro Claver (piedra con cúpula) junto a la muralla
  const spc = grupo(gr, [92, 3, -30], [0, PI / 2, 0]);
  parte(G.caja, 0xd8c49a, [0, 7, 0], [13, 14, 28], spc); parte(G.piramide, TEJA, [0, 15.5, 0], [14, 3, 29], spc);
  for (const s of [-1, 1]) { parte(G.caja, 0xd8c49a, [s * 4.5, 11, 13], [4, 22, 4], spc); parte(G.piramide, 0xc9b080, [s * 4.5, 24, 13], [4.2, 4, 4.2], spc); }
  parte(G.esfera, 0xe8d8b0, [0, 16, -9], [5, 4.5, 5], spc); parte(G.cono, 0xc9a227, [0, 21.5, -9], [0.4, 2, 0.4], spc);
  // Getsemaní: casitas de colores fuera de la muralla
  for (let i = 0; i < 45; i++) {
    const x = rr(-110, 110), z = rr(112, 220), h = alturaCartagena(x, z);
    if (h < 1.5 || (Math.abs(x) < 16 && z < 130)) continue;
    const a = rr(9, 12), al = rr(5, 8), g = grupo(gr, [x, h - 0.2, z], [0, ((rnd() * 4) | 0) * PI / 2, 0]);
    parte(G.caja, matTex(elegirR(COLORES_COLONIAL), texColonial), [0, al / 2, 0], [a, al, a], g);
    parte(G.piramide, TEJA, [0, al + 1.3, 0], [a * 1.1, 2.6, a * 1.1], g);
    if (rnd() < 0.5) parte(G.esferaS, 0xff4fa0, [a * 0.3, al * 0.8, a / 2 + 0.3], 1.1, g);
  }
  // Catedral
  parte(G.caja, 0xe9dcc0, [-25, 10, -20], [20, 14, 34], gr);
  parte(G.caja, 0xf2c75c, [-25, 16, -40], [8, 26, 8], gr);
  parte(G.esfera, 0xc4552f, [-25, 31, -40], [4, 3.5, 4], gr);
  parte(G.cono, 0xf2c75c, [-25, 35, -40], [0.7, 4, 0.7], gr);
  // Castillo de San Felipe sobre su cerro
  const hc = alturaCartagena(-230, 150);
  for (let k = 0; k < 3; k++) parte(G.caja, k % 2 ? 0xc7ae7e : 0xb9a27a, [-230, hc - 6 + k * 7, 150], [70 - k * 20, 10, 56 - k * 16], gr);
  for (let k = 0; k < 8; k++) parte(G.caja, 0xb9a27a, [-230 - 14 + k * 4, hc + 17, 162], [2, 2, 2], gr);
  for (let k = 0; k < 5; k++) canonMuralla(gr, -230 - 20 + k * 10, hc + 0.5, 150 + 29, 0);
  // Convento de La Popa
  const hp = alturaCartagena(-120, -330);
  casa(gr, -120, -330, hp - 1, 26, 8, 18, 0xffffff, 'plano', 0.3, false, texColonial);
  parte(G.caja, 0xffffff, [-110, hp + 12, -330], [5, 12, 5], gr);
  // Canoas de pescadores
  for (let i = 0; i < 10; i++) { const z = rr(-500, 500), x = costaCartagena(z) + rr(8, 40); parte(G.caja, 0x7a4a24, [x, 0.2, z], [1.4, 0.6, 6], gr, [0, rr(0, 3), 0]); }
  for (let i = 0; i < 55; i++) { const z = rr(-650, 650), x = costaCartagena(z) - rr(6, 32); palmera(gr, x, z, alturaCartagena(x, z), rr(0.9, 1.3)); }
  for (const [x, z] of [[-60, 40], [50, -30], [70, 55], [-80, -50], [10, 60]]) palmera(gr, x, z, 3, 1);
  for (let i = 0; i < (ES_TACTIL ? 60 : 90); i++) { const x = rr(-1100, -280), z = rr(-1100, 1100); arbol(gr, x, z, alturaCartagena(x, z) - 0.5, rr(1.2, 2), elegirR([0x4f9a3c, 0x3f8a34])); }
  nubes(gr, 18, 0, 0);
  return unirTodo(gr);
}

// ---------------- BARRANQUILLA 1919 ----------------
const rioX = z => 300 + Math.sin(z * 0.004) * 40;
const costaB = x => -480 + (fbm(x * 0.003, 1.7, 3) - 0.5) * 90;
function alturaBarranquilla(x, z) {
  const cs = costaB(x);
  if (z < cs) return Math.max(-6 + (z - cs) * 0.03, -25);                    // mar Caribe
  const dr = Math.abs(x - rioX(z)) - 48;
  let h = dr < 0 ? -5 : lerp(-0.6, 2, suave(0, 14, dr));                    // río Magdalena
  h = Math.min(h, lerp(-0.6, 2, suave(0, 16, z - cs)));                       // playa
  h += suave(520, 1000, Math.hypot(x + 40, z + 60)) * fbm(x * 0.005, z * 0.005, 4) * 150;
  return Math.max(h, -25);
}
function colorBarranquilla(c, x, y, z) {
  if (y < 0.8) c.setHex(0xe2cf96); else if (y < 30) c.setHex(0x8fbf55); else c.setHex(0x5f9a3e);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 6) * 0.06 - 0.03);
}
function crearVapor() { // barco de vapor con rueda de paletas
  const b = new THREE.Group();
  parte(G.caja, 0xf4f0e6, [0, 1.2, 0], [5, 1.6, 16], b);
  parte(G.caja, 0xf4f0e6, [0, 3.0, -1], [4.2, 1.8, 10], b);
  parte(G.caja, 0xb5532e, [0, 4.0, -1], [4.6, 0.2, 10.5], b);
  parte(G.caja, 0xf4f0e6, [0, 4.8, 1], [3, 1.4, 3], b);
  parte(G.cil6, 0x222222, [0, 6.5, 0], [0.5, 5, 0.5], b);
  parte(G.caja, 0xd93a3a, [0, 0.45, 0], [5.05, 0.3, 16.05], b);
  const rueda = grupo(b, [0, 1.8, -9], null, 'rueda');
  for (let k = 0; k < 6; k++) parte(G.caja, 0xd93a3a, [0, 0, 0], [4.6, 0.25, 3.4], rueda, [k * PI / 6, 0, 0]);
  return unirHijos(b);
}
function construirBarranquilla() {
  const gr = new THREE.Group(); srand(33);
  gr.add(crearTerreno(alturaBarranquilla, colorBarranquilla));
  crearMar(gr, 0x2a86a8);
  // Ciudad de 1919: casas republicanas de colores
  const cx0 = -40, cz0 = -60;
  for (let x = -280; x <= 200; x += 40) for (let z = -380; z <= 260; z += 40) {
    if (((x - cx0) / 235) ** 2 + ((z - cz0) / 305) ** 2 > 1) continue;
    if (z === -20) continue;                                  // Paseo Bolívar
    if (Math.hypot(x + 40, z + 100) < 30) continue;           // Iglesia San Nicolás
    if (x > 120 && z < -150 && z > -260) continue;            // Antigua Aduana
    parte(G.caja, 0xd8cdb5, [x, 2.1, z], [34, 0.2, 34], gr);
    for (let k = 0; k < 4; k++) {
      const hx = x + (k % 2 ? 8.5 : -8.5), hz = z + (k < 2 ? 8.5 : -8.5);
      const a = rr(13, 15.5), al = rr(5, 8.5), col = elegirR(COLORES_COLONIAL);
      const g = grupo(gr, [hx, 2.2, hz], [0, ((rnd() * 4) | 0) * PI / 2, 0]);
      parte(G.caja, matTex(col, texColonial), [0, al / 2, 0], [a * 0.95, al, a * 0.95], g);
      parte(G.caja, 0xf4efe4, [0, al + 0.5, 0], [a, 1.0, a], g);
      if (rnd() < 0.4) parte(G.piramide, TEJA, [0, al + 2, 0], [a * 0.8, 2.2, a * 0.8], g);
    }
    if (rnd() < 0.4) arbol(gr, x, z, 2.2, rr(0.9, 1.2), elegirR([0x4f9a3c, 0xf27ab8, 0x3f8a34]));
  }
  // Paseo Bolívar con palmeras
  parte(G.caja, 0xc9c0aa, [-40, 2.15, -20], [440, 0.2, 18], gr);
  for (let x = -250; x <= 170; x += 16) for (const s of [-1, 1]) palmera(gr, x, -20 + s * 6, 2.2, 0.9);
  parte(G.caja, 0xbdb6a6, [-40, 3.5, -20], [2.5, 3, 2.5], gr); parte(G.caja, 0x5a5a5a, [-40, 6.2, -20], [1, 2.6, 1], gr);
  // Iglesia de San Nicolás
  iglesia(gr, -40, -100, 2.2, PI, 0xf3e6c8, 2);
  // Antigua Aduana (edificio amarillo con arcos y torre)
  const ad = grupo(gr, [165, 2.2, -205], [0, 0, 0]);
  parte(G.caja, 0xe8b84a, [0, 6, 0], [16, 12, 60], ad);
  for (let k = -5; k <= 5; k++) parte(G.caja, 0x5a3a20, [-8.05, 3, k * 5], [0.1, 4.5, 3], ad);
  parte(G.caja, 0xf4efe4, [0, 12.5, 0], [17, 1, 61], ad);
  parte(G.caja, 0xe8b84a, [0, 17, 0], [7, 10, 7], ad); parte(G.cil, 0xffffff, [-3.55, 18, 0], [1.8, 0.2, 1.8], ad, [0, 0, PI / 2]); parte(G.piramide, TEJA, [0, 24, 0], [7.4, 4, 7.4], ad);
  // Hidroaviones de SCADTA amarrados en el río, junto a la Aduana
  for (let k = 0; k < 3; k++) {
    const z = -230 - k * 26, x = rioX(z) - 34, h = grupo(gr, [x, 0.6, z], [0, 0.3, 0]);
    parte(G.caja, 0xc8ccd2, [0, 1.6, 0], [1.4, 1.3, 8], h); parte(G.caja, 0xb8bcc2, [0, 1.1, -0.5], [12, 0.25, 2], h);
    for (let r = 0; r < 6; r++) parte(G.caja, 0x9aa0a8, [0, 1.25, -1.4 + r * 0.35], [12, 0.04, 0.12], h);
    for (const s of [-1, 1]) { parte(G.caja, 0xe8e8e8, [s * 1.6, 0, 0.4], [0.6, 0.5, 6], h); parte(G.cil6, 0x555555, [s * 1.6, 0.7, 0.4], [0.06, 1.2, 0.06], h); }
    parte(G.caja, 0xc8ccd2, [0, 2.4, 3.6], [0.12, 1.4, 1], h); parte(G.cil, 0x444444, [0, 1.6, -4.1], [0.6, 0.4, 0.6], h, [PI / 2, 0, 0]);
    parte(G.caja, 0x3a2a1a, [0, 1.6, -4.4], [0.15, 2.4, 0.1], h);
  }
  parte(G.caja, 0x8a6a4a, [rioX(-255) - 52, 1.6, -255], [10, 0.5, 70], gr);   // muelle de madera
  // Muelle de Puerto Colombia (largo, metido en el mar)
  const xm = -560, czm = costaB(xm);
  parte(G.caja, 0x8a6a4a, [xm, 3, czm - 110], [6, 0.6, 230], gr);
  for (let k = 0; k < 20; k++) for (const s of [-1, 1]) parte(G.cil6, 0x5b4a3a, [xm + s * 2.5, -1.5, czm - 5 - k * 12], [0.35, 9, 0.35], gr);
  parte(G.caja, 0xf2e6cc, [xm, 5, czm + 12], [16, 6, 10], gr); parte(G.piramide, TEJA, [xm, 9.5, czm + 12], [17, 3, 11], gr);
  // Vía del tren del muelle a la ciudad
  const A = new THREE.Vector3(xm, 2.3, czm + 22), Bv = new THREE.Vector3(-300, 2.3, -330), dV = new THREE.Vector3().subVectors(Bv, A), Lt = dV.length();
  const yawT = Math.atan2(dV.x, dV.z);
  const via = grupo(gr, [(A.x + Bv.x) / 2, 0, (A.z + Bv.z) / 2], [0, yawT, 0]);
  parte(G.caja, 0x8a7a66, [0, 2.2, 0], [3, 0.3, Lt], via); for (const s of [-1, 1]) parte(G.caja, 0x555555, [s * 0.8, 2.45, 0], [0.15, 0.15, Lt], via);
  // Palmeras y ceibas en la costa y la orilla del río
  for (let i = 0; i < 50; i++) { const x = rr(-900, 260), z = costaB(x) + rr(8, 40); palmera(gr, x, z, alturaBarranquilla(x, z), rr(0.9, 1.3)); }
  for (let i = 0; i < 40; i++) { const z = rr(-420, 600), x = rioX(z) - 48 - rr(8, 30); palmera(gr, x, z, alturaBarranquilla(x, z), rr(0.9, 1.2)); }
  for (let i = 0; i < (ES_TACTIL ? 70 : 110); i++) { const a = rr(0, 6.28), r = rr(380, 950), x = -40 + Math.cos(a) * r, z = -60 + Math.sin(a) * r; const h = alturaBarranquilla(x, z); if (h > 1) arbol(gr, x, z, h - 0.5, rr(1.3, 2.3), elegirR([0x4f9a3c, 0x3f8a34, 0x6aa84f])); }
  nubes(gr, 18, -40, -60);
  unirTodo(gr);
  // Cosas que se mueven: barcos de vapor por el río y el trencito
  const vapores = [];
  for (let i = 0; i < 4; i++) { const m = proto('vapor', crearVapor).clone(); gr.add(m); let rueda; m.traverse(o => { if (o.name === 'rueda') rueda = o; }); vapores.push({ m, rueda, z: rr(-420, 600), v: rr(5, 9) * (i % 2 ? 1 : -1), off: i % 2 ? 18 : -18, tHumo: 0 }); }
  const tren = new THREE.Group();
  parte(G.caja, 0x1d1d1d, [0, 3.6, 3], [2.6, 2.6, 6], tren); parte(G.cil, 0x1d1d1d, [0, 3.6, 6.5], [1.2, 3, 1.2], tren, [PI / 2, 0, 0]);
  parte(G.cil6, 0x1d1d1d, [0, 5.8, 6.8], [0.4, 2, 0.4], tren); parte(G.caja, 0xd93a3a, [0, 3.2, 3], [2.7, 0.4, 6.1], tren);
  for (let k = 0; k < 2; k++) { parte(G.caja, 0x8a3a2a, [0, 3.8, -4 - k * 8], [2.8, 3, 7], tren); parte(G.caja, 0xf4efe4, [0, 5.4, -4 - k * 8], [3, 0.3, 7.2], tren); }
  unirHijos(tren); gr.add(tren);
  let uT = 0, sT = 1, tHumoT = 0;
  const _h = new THREE.Vector3();
  gr.userData.animar = dt => {
    for (const v of vapores) {
      v.z += v.v * dt; if (v.z > 600) v.z = -420; if (v.z < -420) v.z = 600;
      v.m.position.set(rioX(v.z) + v.off, 0.3, v.z); v.m.rotation.y = v.v > 0 ? 0 : PI;
      v.rueda.rotation.x += dt * 3 * Math.sign(v.v);
      v.tHumo -= dt; if (v.tHumo <= 0) { v.tHumo = 0.35; emitir(_h.set(v.m.position.x, 9.5, v.m.position.z), 0x555555, _pv.set(rand(-1, 1), 3, rand(-1, 1)), 2.2, 0.8, 3.5, 0, 0.6); }
    }
    uT += sT * dt / 40; if (uT > 1) { uT = 1; sT = -1; } if (uT < 0) { uT = 0; sT = 1; }
    tren.position.lerpVectors(A, Bv, uT); tren.position.y = 0; tren.rotation.y = sT > 0 ? yawT : yawT + PI;
    tHumoT -= dt; if (tHumoT <= 0) { tHumoT = 0.25; _h.set(0, 7, 6.8).applyMatrix4(tren.matrixWorld); emitir(_h, 0xdddddd, _pv.set(0, 3, 0), 1.6, 0.6, 2.6, 0, 0.6); }
  };
  return gr;
}

// ---------------- BOGOTÁ 1990 ----------------
function alturaBogota(x, z) {
  const r = Math.hypot(x, z);
  let h = suave(230, 470, x) * (95 + fbm(x * 0.01, z * 0.01, 22) * 70);   // cerros orientales
  h += 75 * gauss(x, z, 380, -80, 55);                                     // Monserrate
  h += 65 * gauss(x, z, 390, 110, 55);                                     // Guadalupe
  h += suave(650, 1100, r) * fbm(x * 0.004, z * 0.004, 23) * 170;           // montañas lejanas
  return Math.max(0, h);
}
function colorBogota(c, x, y, z) {
  if (y < 4) c.setHex(0x9aa58a); else if (y < 60) c.setHex(0x6f9a50); else if (y < 150) c.setHex(0x3f6e3a); else c.setHex(0x9a9a6a);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 8) * 0.06 - 0.03);
}
function construirBogota() {
  const gr = new THREE.Group(); srand(44);
  gr.add(crearTerreno(alturaBogota, colorBogota));
  parte(G.caja, 0x4b4e54, [-125, 0.03, 0], [660, 0.06, 920], gr);
  const ESP = 44, LADR = [0xb85a38, 0xa8502f, 0xc46a45, 0x9a4a2c];
  for (let x = -440; x <= 190; x += ESP) for (let z = -440; z <= 440; z += ESP) {
    if (Math.hypot(x - 100, z - 120) < 30) continue;          // Plaza de Bolívar
    if (Math.hypot(x - 20, z + 40) < 25) continue;            // Torre Colpatria
    if (Math.hypot(x - 66, z + 66) < 25 || Math.hypot(x - 110, z + 130) < 26 || (Math.abs(x + 330) < 80 && Math.abs(z + 200) < 80)) continue;
    parte(G.caja, 0xcfc6b4, [x, 0.12, z], [38, 0.24, 38], gr);
    const d = Math.hypot(x - 60, z - 40);
    if (d < 170 && rnd() < 0.8) {
      const al = rr(18, 48) * (1 - d / 340), vidrio = rnd() < 0.25;
      parte(G.caja, matTex(vidrio ? elegirR([0x9cc3e0, 0xe8eef5]) : elegirR(LADR), vidrio ? texEdificio : texLadrillo), [x + rr(-4, 4), al / 2, z + rr(-4, 4)], [rr(16, 24), al, rr(16, 24)], gr);
      if (rnd() < 0.5) parte(G.caja, matTex(elegirR(LADR), texLadrillo), [x + 10, 6, z - 10], [14, 12, 14], gr);
    } else {
      for (let k = 0; k < 4; k++) { const al = rr(7, 15); parte(G.caja, matTex(elegirR(LADR), texLadrillo), [x + (k % 2 ? 9 : -9), al / 2, z + (k < 2 ? 9 : -9)], [15, al, 15], gr); }
      if (rnd() < 0.5) arbol(gr, x, z, 0.24, rr(0.9, 1.2), elegirR([0x3f8a34, 0x4f9a3c]));
    }
  }
  // Torre Colpatria
  parte(G.caja, matTex(0x7a9ab8, texEdificio), [20, 50, -40], [16, 100, 16], gr);
  parte(G.caja, 0xdddddd, [20, 101, -40], [17, 2, 17], gr); parte(G.cil6, 0xaaaaaa, [20, 108, -40], [0.3, 12, 0.3], gr);
  // Plaza de Bolívar: Capitolio, Catedral Primada y Palacio Liévano
  parte(G.caja, 0xbdb6a6, [100, 0.3, 120], [46, 0.3, 46], gr);
  parte(G.caja, 0xc8c6be, [100, 7, 145], [40, 14, 8], gr); for (let k = -4; k <= 4; k++) parte(G.cil6, 0xf0f0ea, [100 + k * 4, 6, 140.5], [0.8, 12, 0.8], gr);
  parte(G.caja, 0xc8c6be, [100, 14.5, 141], [40, 1.5, 2], gr);
  iglesia(gr, 132, 120, 0.3, -PI / 2, 0xe8e0cc, 2);
  parte(G.caja, 0xe8dcc0, [70, 7, 120], [8, 14, 36], gr); parte(G.caja, 0x3a3f48, [70, 15.5, 120], [8.6, 3, 36.6], gr);
  parte(G.caja, 0xbdb6a6, [100, 2, 120], [3, 4, 3], gr); parte(G.caja, 0x5a5a5a, [100, 5.5, 120], [1, 3, 1], gr);
  // Monserrate: iglesia blanca en la cima y teleférico
  const hm = alturaBogota(380, -80);
  const mon = grupo(gr, [380, hm - 1, -80], [0, PI / 2, 0]);
  parte(G.caja, 0xffffff, [0, 5, 0], [12, 10, 22], mon); parte(G.piramide, TEJA, [0, 12, 0], [13, 4, 23], mon);
  parte(G.caja, 0xffffff, [0, 9, 10], [4.5, 18, 4.5], mon); parte(G.piramide, 0xffffff, [0, 20, 10], [4.6, 4, 4.6], mon); parte(G.caja, 0xc9a227, [0, 23, 10], [0.2, 2, 0.2], mon);
  parte(G.caja, 0xf2e6cc, [-12, 3, -6], [10, 6, 10], mon);
  const bt = new THREE.Vector3(250, alturaBogota(250, -60) + 3, -60), tp = new THREE.Vector3(365, hm + 3, -78);
  parte(G.caja, 0xf2e6cc, [bt.x, bt.y, bt.z], [8, 6, 8], gr);
  const dC = new THREE.Vector3().subVectors(tp, bt), cab = grupo(gr, [(bt.x + tp.x) / 2, (bt.y + tp.y) / 2 + 3.5, (bt.z + tp.z) / 2]);
  cab.lookAt(tp.x, tp.y + 3.5, tp.z); parte(G.caja, 0x333333, [0, 0, 0], [0.12, 0.12, dC.length()], cab).userData.noChoque = true;
  // Guadalupe: estatua blanca
  const hg = alturaBogota(390, 110);
  parte(G.caja, 0xdddddd, [390, hg + 3, 110], [5, 6, 5], gr); parte(G.cil6, 0xffffff, [390, hg + 11, 110], [1.4, 10, 1.4], gr); parte(G.esferaS, 0xffffff, [390, hg + 17, 110], 1.2, gr);
  // Planetario (cúpula blanca)
  parte(G.cil, 0xe8e4dc, [66, 3, -66], [12, 6, 12], gr);
  parte(new THREE.SphereGeometry(11, 14, 7, 0, PI * 2, 0, PI / 2), 0xf6f6f6, [66, 6, -66], null, gr);
  // Plaza de toros de Santamaría (anillo de ladrillo con arena adentro)
  parte(G.cil, matTex(0xb85a38, texLadrillo), [110, 5, -130], [16, 10, 16], gr);
  parte(G.cil, 0xd8c08a, [110, 5.05, -130], [12, 10.1, 12], gr);
  // Parque Simón Bolívar con su lago
  parte(G.caja, 0x6fa84a, [-330, 0.15, -200], [150, 0.3, 150], gr);
  parte(G.cil, 0x3a8fb0, [-330, 0.2, -200], [45, 0.32, 30], gr);
  for (let k = 0; k < 30; k++) { const a = rr(0, 6.28), d = rr(50, 72); arbol(gr, -330 + Math.cos(a) * d, -200 + Math.sin(a) * d, 0.3, rr(1, 1.4), elegirR([0x3f8a34, 0x4f9a3c, 0xf27ab8])); }
  // Eucaliptos en los cerros
  for (let i = 0; i < (ES_TACTIL ? 110 : 180); i++) { const x = rr(240, 560), z = rr(-600, 600), h = alturaBogota(x, z); if (h > 20) eucalipto(gr, x, z, h - 0.5, rr(0.8, 1.3)); }
  for (let i = 0; i < 60; i++) { const a = rr(0, 6.28), r = rr(500, 950), x = Math.cos(a) * r, z = Math.sin(a) * r; if (x < 200) arbol(gr, x, z, alturaBogota(x, z) - 0.5, rr(1.3, 2), elegirR([0x3f6e3a, 0x4f9a3c])); }
  nubes(gr, 26, 0, 0);
  unirTodo(gr);
  // Tráfico: Avenida Caracas, Carrera Séptima y Calle 26 con busetas
  const lineas = [{ eje: 'z', c: -66, L: 430, y: 0.06 }, { eje: 'z', c: 154, L: 430, y: 0.06 }, { eje: 'x', c: -22, L: 310, y: 0.06, c0: -125 }, { eje: 'x', c: 198, L: 310, y: 0.06, c0: -125 }, { eje: 'z', c: -286, L: 430, y: 0.06 }];
  const tr = crearTrafico(gr, lineas, ES_TACTIL ? 26 : 40, ['normal', 'normal', 'clasico', 'taxiN', 'bus', 'bus']);
  const cabina = new THREE.Group(); parte(G.caja, 0xd93a3a, [0, -1.6, 0], [2.4, 2.4, 3], cabina); parte(G.caja, 0x223344, [0, -1.3, 0], [2.45, 0.9, 2.6], cabina); parte(G.caja, 0x333333, [0, 0, 0], [0.2, 1.4, 0.2], cabina); unirHijos(cabina); gr.add(cabina);
  let uC = 0, sC = 1;
  const topeC = tp.clone().setY(tp.y + 3.5), baseC = bt.clone().setY(bt.y + 3.5);
  gr.userData.animar = dt => { tr(dt); uC += sC * dt / 25; if (uC > 1) { uC = 1; sC = -1; } if (uC < 0) { uC = 0; sC = 1; } cabina.position.lerpVectors(baseC, topeC, uC); };
  return gr;
}

// ---------------- BOYACÁ 1819 ----------------
const rioBoy = z => 30 + Math.sin(z * 0.006) * 40;
function alturaBoyaca(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm(x * 0.004, z * 0.004, 31) * 45 * suave(120, 480, r);
  h += suave(480, 1000, r) * (80 + fbm(x * 0.006, z * 0.006, 32) * 170);   // montañas de los Andes alrededor
  h -= 5 * suave(20, 0, Math.abs(x - rioBoy(z)));                            // cañada del río Teatinos
  return h;
}
function colorBoyaca(c, x, y, z) {
  const dr = Math.abs(x - rioBoy(z));
  if (dr < 14) c.setHex(0x8a9a6a);
  else if (y < 30) c.setHex(elegirCampo(x, z));
  else if (y < 140) c.setHex(0x5a8a45); else c.setHex(0x9a9478);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 11) * 0.06 - 0.03);
}
function elegirCampo(x, z) { // retazos de cultivos: papa, trigo, pasto
  const h = hash2(Math.floor(x / 70), Math.floor(z / 70), 12);
  return h < 0.25 ? 0xc9b85a : h < 0.45 ? 0x9cb84e : h < 0.6 ? 0x7a9a3e : h < 0.75 ? 0xa88a5a : 0x88b050;
}
function construirBoyaca() {
  const gr = new THREE.Group(); srand(55);
  gr.add(crearTerreno(alturaBoyaca, colorBoyaca));
  // el río, en tramos que siguen su curva
  for (let z = -900; z <= 900; z += 30) {
    const x1 = rioBoy(z), x2 = rioBoy(z + 30), yaw = Math.atan2(x2 - x1, 30);
    parte(G.caja, 0x3f86a8, [(x1 + x2) / 2, -3.2, z + 15], [22, 0.3, 32], gr, [0, yaw, 0]);
  }
  // Puente de Boyacá: puente de piedra con arco
  const bx = rioBoy(0), hb = 0;
  const pu = grupo(gr, [bx, hb, 0]);
  parte(G.caja, 0xa8a090, [0, 0.4, 0], [40, 1.2, 6], pu);
  parte(new THREE.TorusGeometry(7, 1.4, 6, 14, PI), 0x9a9282, [0, -1.0, 0], [1, 0.7, 2.2], pu);
  for (const s of [-1, 1]) { parte(G.caja, 0x8a8272, [0, 1.4, s * 2.8], [40, 0.9, 0.4], pu); }
  bandera(gr, bx + 18, 1, 4, 0.9);
  // Casa de Teja junto al puente
  casa(gr, bx - 40, 30, alturaBoyaca(bx - 40, 30), 12, 5, 9, 0xfaf6ee, 'dos', 0.4, false, texColonial);
  // Pueblo colonial blanco con techos de teja y plaza
  const px = -260, pz = -180, hp = alturaBoyaca(px, pz);
  parte(G.caja, 0xcfc6b0, [px, hp + 0.2, pz], [50, 0.4, 50], gr);
  iglesia(gr, px, pz - 42, hp, 0, 0xfaf6ee, 1);
  for (let i = 0; i < 40; i++) {
    const a = rr(0, 6.28), d = rr(32, 110), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    casa(gr, x, z, alturaBoyaca(x, z) - 0.3, rr(9, 13), rr(4.5, 6.5), rr(9, 13), elegirR([0xfaf6ee, 0xfaf6ee, 0xf3ead6]), 'dos', ((rnd() * 4) | 0) * PI / 2, false, texColonial);
  }
  // Haciendas, vacas y muros de piedra
  for (let i = 0; i < 14; i++) {
    const x = rr(-450, 450), z = rr(-450, 450); if (Math.abs(x - rioBoy(z)) < 40 || Math.hypot(x - px, z - pz) < 140) continue;
    const h = alturaBoyaca(x, z); casa(gr, x, z, h - 0.3, rr(16, 22), 5, rr(9, 12), 0xfaf6ee, 'dos', rr(0, 3), false, texColonial);
    parte(G.caja, 0x8a8478, [x + 20, h + 0.6, z], [0.8, 1.2, 40], gr);
    for (let k = 0; k < 4; k++) { const vx = x + rr(-30, 30), vz = z + rr(15, 40), vh = alturaBoyaca(vx, vz), ry = rr(0, 3); const v = grupo(gr, [vx, vh, vz], [0, ry, 0]); parte(G.caja, rnd() < 0.5 ? 0xf2f2f2 : 0x6b4a2a, [0, 1.2, 0], [1.1, 1, 2.2], v); parte(G.caja, 0x222222, [0, 1.5, 1.3], [0.7, 0.7, 0.7], v); for (const sx of [-0.4, 0.4]) for (const sz of [-0.8, 0.8]) parte(G.caja, 0x333333, [sx, 0.35, sz], [0.2, 0.7, 0.2], v); }
  }
  for (let i = 0; i < (ES_TACTIL ? 120 : 200); i++) { const x = rr(-1000, 1000), z = rr(-1000, 1000); if (Math.abs(x - rioBoy(z)) < 18) continue; const h = alturaBoyaca(x, z); if (Math.hypot(x, z) < 200 && rnd() < 0.6) continue; arbol(gr, x, z, h - 0.5, rr(1, 1.8), elegirR([0x3f7a3a, 0x4f8a40, 0x5a9a48])); }
  nubes(gr, 22, 0, 0);
  return unirTodo(gr);
}

// ---------------- EJE CAFETERO 1970 ----------------
function alturaEje(x, z) {
  const r = Math.hypot(x, z);
  let h = 22 + fbm(x * 0.006, z * 0.006, 41) * 95;                            // montañas verdes cafeteras
  h = lerp(h, 6, clamp(gauss(x, z, -200, -40, 170) * 1.6, 0, 1));            // Valle de Cocora
  h = lerp(h, 32, clamp(gauss(x, z, 230, 90, 90) * 1.8, 0, 1));               // meseta de Salento
  h += suave(600, 1100, r) * fbm(x * 0.004, z * 0.004, 42) * 200;
  return h;
}
function colorEje(c, x, y, z) {
  const cocora = gauss(x, z, -200, -40, 170) > 0.5;
  if (cocora && y < 20) c.setHex(0x8fd060);
  else if (y < 120) c.setHex(Math.sin(x * 0.06 + z * 0.03) > 0.2 ? 0x2f6b2f : 0x5fa040);   // surcos de café
  else c.setHex(0x9aa070);
  c.offsetHSL(0, 0, hash2(x * 0.05, z * 0.05, 13) * 0.06 - 0.03);
}
function palmaCera(gr, x, z, h0, alto) { // palma de cera del Quindío: tronco altísimo y delgado
  parte(G.cil6, 0xd8d4c8, [x, h0 + alto / 2, z], [0.45, alto, 0.45], gr);
  for (let k = 0; k < 4; k++) parte(G.cil6, 0xb8b4a8, [x, h0 + alto * (0.2 + k * 0.2), z], [0.5, 0.25, 0.5], gr);
  for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; parte(G.caja, 0x3f8a3a, [x + Math.cos(a) * 2.2, h0 + alto + 0.3, z + Math.sin(a) * 2.2], [4.4, 0.15, 0.8], gr, [0, -a, -0.45]); }
}
function construirEje() {
  const gr = new THREE.Group(); srand(66);
  gr.add(crearTerreno(alturaEje, colorEje));
  // Valle de Cocora con palmas de cera y neblina
  for (let i = 0; i < (ES_TACTIL ? 60 : 95); i++) { const a = rr(0, 6.28), d = rr(0, 190), x = -200 + Math.cos(a) * d, z = -40 + Math.sin(a) * d; palmaCera(gr, x, z, alturaEje(x, z) - 0.5, rr(38, 58)); }
  for (let i = 0; i < 8; i++) nube(gr, -200 + rr(-150, 150), rr(22, 40), -40 + rr(-150, 150), rr(0.8, 1.3));
  // Salento: casitas blancas con balcones, puertas y ventanas de colores vivos
  const sx = 230, sz = 90, hs = alturaEje(sx, sz);
  parte(G.caja, 0xcfc6b0, [sx, hs + 0.2, sz], [40, 0.4, 40], gr);
  iglesia(gr, sx, sz - 38, hs, 0, 0xffffff, 1);
  for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
    if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue;
    const x = sx + gx * 22, z = sz + gz * 22, h = alturaEje(x, z), col = elegirR([0xe23a3a, 0x2a5bd7, 0x3f9b3a, 0xffc933, 0xff7a1a, 0x9a4ad0]);
    const c = grupo(gr, [x, h - 0.3, z], [0, ((rnd() * 4) | 0) * PI / 2, 0]);
    parte(G.caja, matTex(0xffffff, texColonial), [0, 3.5, 0], [12, 7, 12], c);
    parte(G.piramide, TEJA, [0, 9, 0], [13.2, 4, 13.2], c);
    parte(G.caja, col, [0, 4.6, 6.6], [10, 0.3, 1.4], c); parte(G.caja, col, [0, 5.4, 7.25], [10, 1.2, 0.15], c);   // balcón de color
    for (const s of [-1, 1]) parte(G.caja, col, [s * 4.2, 1.6, 6.05], [1.6, 3.2, 0.1], c);
  }
  // Fincas cafeteras
  for (let i = 0; i < 18; i++) { const x = rr(-600, 600), z = rr(-600, 600); if (gauss(x, z, -200, -40, 170) > 0.3 || Math.hypot(x - sx, z - sz) < 120) continue; casa(gr, x, z, alturaEje(x, z) - 0.5, rr(12, 16), 5, rr(9, 12), 0xffffff, 'dos', rr(0, 3), false, texColonial); }
  // Plátano y guadua
  for (let i = 0; i < (ES_TACTIL ? 110 : 180); i++) { const x = rr(-1000, 1000), z = rr(-1000, 1000); if (gauss(x, z, -200, -40, 170) > 0.4) continue; arbol(gr, x, z, alturaEje(x, z) - 0.5, rr(1, 1.6), elegirR([0x2f6b2f, 0x4f9a3c, 0x6ab04a])); }
  // Carretera de Salento al valle de Cocora
  const ruta = []; for (let k = 0; k <= 40; k++) { const t = k / 40, x = lerp(sx - 25, -120, t), z = lerp(sz, -40, t) + Math.sin(t * PI * 3) * 30; ruta.push(new THREE.Vector3(x, alturaEje(x, z) + 0.3, z)); }
  for (let k = 0; k < ruta.length - 1; k++) { const A = ruta[k], B = ruta[k + 1], seg = grupo(gr, [(A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2]); seg.lookAt(B); parte(G.caja, 0x9a7a52, [0, 0, 0], [6, 0.5, A.distanceTo(B) + 1], seg); }
  nubes(gr, 18, 0, 0);
  unirTodo(gr);
  // Jeeps Willys cargados de café que van y vienen por la carretera
  const jeeps = [];
  for (let i = 0; i < 6; i++) {
    const col = elegirR([0x3f6b3a, 0xb83a3a, 0x2a5b9a, 0xd8a03a]);
    const j = proto('willys' + col, () => { const w = new THREE.Group(); parte(G.caja, col, [0, 1.0, 0], [2.2, 1.0, 3.8], w); parte(G.caja, col, [0, 1.6, 1.2], [2.0, 0.4, 1.2], w); parte(G.caja, 0x222222, [0, 2.4, -0.4], [2.1, 0.08, 2.6], w); for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) parte(G.cil6, 0x151515, [s * 1.05, 0.45, z], [0.45, 0.3, 0.45], w, [0, 0, PI / 2]); for (let k = 0; k < 3; k++) parte(G.caja, 0xc8b48a, [rr(-0.5, 0.5), 2.7 + k * 0.3, -0.4 + rr(-0.6, 0.6)], [0.9, 0.5, 0.7], w); parte(G.cil6, 0x151515, [0, 1.2, -2.05], [0.45, 0.25, 0.45], w, [PI / 2, 0, 0]); return unirHijos(w); }).clone();
    gr.add(j); jeeps.push({ m: j, u: rnd(), v: rr(0.012, 0.02) * (i % 2 ? 1 : -1) });
  }
  gr.userData.animar = dt => {
    for (const j of jeeps) {
      j.u += j.v * dt; if (j.u > 1) j.u -= 1; if (j.u < 0) j.u += 1;
      const f = j.u * (ruta.length - 1), k = Math.floor(f), t = f - k, A = ruta[k], B = ruta[Math.min(k + 1, ruta.length - 1)];
      j.m.position.lerpVectors(A, B, t); j.m.lookAt(j.v > 0 ? B : A);
    }
  };
  return gr;
}

const ESCENARIOS = {
  cucuta2030: { construir: () => construirCucuta(2030), altura: alturaCucuta },
  cucuta1955: { construir: () => construirCucuta(1955), altura: alturaCucuta },
  cartagena1741: { construir: construirCartagena, altura: alturaCartagena },
  barranquilla1919: { construir: construirBarranquilla, altura: alturaBarranquilla },
  bogota1990: { construir: construirBogota, altura: alturaBogota },
  boyaca1819: { construir: construirBoyaca, altura: alturaBoyaca },
  eje1970: { construir: construirEje, altura: alturaEje }
};

// =====================================================================
// 7. NIVELES: un viaje por la historia (cada ciudad en una época)
// =====================================================================
const AVIONES = {
  1741: { nombre: 'un barco volador de madera', corto: 'Barco volador', vel: 36, max: 58, min: 22, giro: 1.25, bala: 0xffa040, balaVel: 290, sonido: 'helice', desc: 'Madera, lona y cañoncitos de bronce. ¡Un barco pirata con alas y hélice!' },
  1819: { nombre: 'un ornitóptero de vapor', corto: 'Ornitóptero de vapor', vel: 38, max: 60, min: 22, giro: 1.3, bala: 0xffa040, balaVel: 290, sonido: 'helice', desc: 'Una caldera de bronce, una chimenea que echa vapor y dos hélices. ¡Chu chuuu!' },
  1919: { nombre: 'un biplano de lona', corto: 'Biplano de lona', vel: 40, max: 64, min: 24, giro: 1.35, bala: 0xffe680, balaVel: 300, sonido: 'helice', desc: 'Dos alas de tela, motor de estrella y ametralladoras de época.' },
  1955: { nombre: 'una avioneta de combate', corto: 'Avioneta de combate', vel: 46, max: 78, min: 28, giro: 1.35, bala: 0xffe680, balaVel: 320, sonido: 'helice', desc: 'Hélice de tres palas, colores de Colombia y ametralladoras en las alas.' },
  1970: { nombre: 'un jet plateado', corto: 'Jet plateado', vel: 54, max: 92, min: 32, giro: 1.4, bala: 0xfff0c0, balaVel: 360, sonido: 'jet', desc: 'Uno de los primeros jets: alas en flecha y la toma de aire en la nariz.' },
  1990: { nombre: 'un jet supersónico', corto: 'Jet supersónico', vel: 58, max: 100, min: 36, giro: 1.45, bala: 0xfff0c0, balaVel: 380, sonido: 'jet', desc: 'Ala en delta, misiles y postcombustión. ¡Más rápido que el sonido!' },
  2030: { nombre: 'el Cóndor X, la nave del tiempo', corto: 'Cóndor X', vel: 58, max: 102, min: 34, giro: 1.55, bala: 0x5ff8ff, balaVel: 400, sonido: 'jet', desc: 'La nave del tiempo de Nucita: alas hacia adelante, anillo temporal y láseres.' }
};
const EPOCAS = [1741, 1819, 1919, 1955, 1970, 1990, 2030];
const NIVELES = [
  {
    id: 'prologo', ciudad: 'Cúcuta', anio: 2030, titulo: 'Prólogo: el robo del tiempo', avion: 2030, escenario: 'cucuta2030', mapa: [-72.5, 7.9], etiqueta: 'left',
    cielo: [0x2f8fe0, 0xcdeeff], niebla: 0xcdeeff, nieblaRango: [380, 1500], luz: [0.8, 0.8], agua: -Infinity, pajaros: 0x2a2a2a,
    despegue: true, inicio: { x: 0, y: 1.8, z: 22 }, centro: [0, 0], limite: 820, dif: 0, misiles: false,
    oleadas: [{ dron: 2 }, { dron: 2, robot: 1 }], portal: true, jefe: null,
    dialogo: [['Petunia', '¡Bip bop! Ya tengo la máquina del tiempo. ¡Primero mando a mis robots al pasado!'], ['Nucita', '¡Guau! Despeguemos desde el patio. ¡Hay que alcanzar su portal antes de que se cierre!']],
    burlas: ['¡Mis drones son más rápidos que tu perrita, jijiji!'],
    dato: 'A Cúcuta le dicen "la ciudad de los árboles" por la cantidad de árboles que dan sombra en sus calles.',
    final: '¡El portal nos llevó a 1741! ¡Agárrate fuerte!'
  },
  {
    id: 'cartagena', ciudad: 'Cartagena', anio: 1741, titulo: 'Los galeones de Petunia', avion: 1741, escenario: 'cartagena1741', mapa: [-75.5, 10.4], etiqueta: 'right',
    cielo: [0x2a7fd6, 0xffe6c4], niebla: 0xf6e6cc, nieblaRango: [420, 1600], luz: [0.85, 0.8], agua: 0, pajaros: 0xf4f4f4,
    inicio: { x: 420, y: 70, z: 260 }, centro: [0, 0], limite: 850, dif: 0.3, misiles: false,
    oleadas: [{ globo: 3 }, { galeon: 2, globo: 2 }, { galeon: 3, globo: 3 }],
    jefe: { tipo: 'galeonJefe', ia: 'barco', nombre: 'La Capitana de Petunia', vida: 90, bala: 'canon', escoltas: ['galeon', 'globo', 'globo'], frases: ['¡Arrr-bot! ¡Fuego con todos los cañones!', '¡Glu glu... me hundo!'] },
    dialogo: [['Nucita', '¡Guau! Llegamos a 1741. La máquina del tiempo volvió el avión un barco volador de madera.'], ['Petunia', 'Mis galeones piratas robot se van a tomar Cartagena. ¡Arrr-bot!'], ['Nucita', 'Las murallas aguantan... ¡y nosotros hundimos los barcos desde el aire!']],
    burlas: ['¡Mis cañones apuntan a tu barquito volador!', '¡Ni las murallas te van a salvar, jijiji!'],
    dato: 'En 1741 Cartagena de Indias resistió el ataque de una flota enorme gracias a sus murallas y al Castillo de San Felipe de Barajas.',
    final: 'Petunia huyó a 1819... ¡a los campos de Boyacá!'
  },
  {
    id: 'boyaca', ciudad: 'Boyacá', anio: 1819, titulo: 'El puente de la libertad', avion: 1819, escenario: 'boyaca1819', mapa: [-73.4, 5.45], etiqueta: 'left',
    cielo: [0x3b8de0, 0xe6f0f6], niebla: 0xe0eaf0, nieblaRango: [380, 1500], luz: [0.85, 0.8], agua: -Infinity, pajaros: 0x2a2a2a,
    inicio: { x: -420, y: 100, z: 380 }, centro: [0, 0], limite: 820, dif: 0.55, misiles: false,
    oleadas: [{ globo: 2, ornitoptero: 2 }, { dirigible: 2, ornitoptero: 3 }, { dirigible: 3, ornitoptero: 3, globo: 2 }],
    jefe: { tipo: 'fortaleza', ia: 'jefe', nombre: 'Fortaleza de Vapor', vida: 100, bala: 'canon', orbita: 150, alto: 40, escoltas: ['ornitoptero', 'ornitoptero', 'dirigible'], frases: ['¡Chuuu-bot! ¡Voy a tumbar ese puente!', '¡Mi caldera... explotó!'] },
    dialogo: [['Petunia', 'En 1819 voy a derribar el Puente de Boyacá con mi Fortaleza de Vapor. ¡Así la historia será otra!'], ['Nucita', '¡Guau! ¡Ese puente es importantísimo! Ahora volamos un ornitóptero de vapor. ¡Chu chuuu!']],
    burlas: ['¡Mis ornitópteros vuelan como pájaros de hierro!', '¡Ese puentecito no va a aguantar!'],
    dato: 'El 7 de agosto de 1819, junto al Puente de Boyacá, se libró la Batalla de Boyacá, clave para la independencia de Colombia.',
    final: 'El puente está a salvo. ¡Petunia escapó a Barranquilla, en 1919!'
  },
  {
    id: 'barranquilla', ciudad: 'Barranquilla', anio: 1919, titulo: 'El primer correo aéreo', avion: 1919, escenario: 'barranquilla1919', mapa: [-74.8, 11.0], etiqueta: 'left',
    cielo: [0x3a8ee0, 0xf2e9d0], niebla: 0xeee6d2, nieblaRango: [400, 1550], luz: [0.85, 0.8], agua: 0, pajaros: 0xf4f4f4,
    inicio: { x: 200, y: 80, z: -620 }, centro: [-40, -60], limite: 850, dif: 0.8, misiles: false,
    oleadas: [{ biplanoE: 4 }, { biplanoE: 3, hidroavion: 2 }, { biplanoE: 4, hidroavion: 3 }],
    jefe: { tipo: 'zepelin', ia: 'jefe', nombre: 'Zepelín Tuercas', vida: 100, bala: 'normal', orbita: 170, alto: 45, escoltas: ['biplanoE', 'biplanoE', 'hidroavion'], frases: ['¡Ni una carta llegará a su destino!', '¡Pfffsss... me desinflo!'] },
    dialogo: [['Nucita', '¡Es 1919! Desde Barranquilla va a salir el primer correo aéreo de Colombia. ¡Ahora volamos un biplano!'], ['Petunia', 'Mi Zepelín Tuercas no va a dejar pasar ni una carta. ¡Jijiji!']],
    burlas: ['¡Las cartas de Colombia ahora son mías!', '¡Mis biplanos tienen más alas que tú!'],
    dato: 'En 1919 salió desde Barranquilla el primer vuelo de correo aéreo de Colombia, y ese mismo año se fundó allí SCADTA, la aerolínea que después se convirtió en Avianca.',
    final: 'Las cartas llegaron. ¡Petunia se fue a Cúcuta, en 1955!'
  },
  {
    id: 'cucuta1955', ciudad: 'Cúcuta', anio: 1955, titulo: 'El cielo de los abuelos', avion: 1955, escenario: 'cucuta1955', mapa: [-72.5, 7.9], etiqueta: 'left',
    cielo: [0x2f8fe0, 0xd8eeff], niebla: 0xd8eeff, nieblaRango: [380, 1500], luz: [0.85, 0.8], agua: -Infinity, pajaros: 0x2a2a2a,
    inicio: { x: 300, y: 90, z: 330 }, centro: [0, 0], limite: 820, dif: 1.1, misiles: true,
    oleadas: [{ basico: 4, rapido: 1 }, { basico: 4, rapido: 2, kamikaze: 1 }, { basico: 4, rapido: 3, kamikaze: 2 }],
    jefe: { tipo: 'bombardero', ia: 'jefe', nombre: 'Bombardero Tuerca', vida: 110, bala: 'normal', orbita: 150, alto: 25, misiles: true, escoltas: ['basico', 'basico', 'kamikaze'], frases: ['¡Bzzz! ¡En 1955 nadie me detendrá!', '¡Error... error... sistema caído!'] },
    dialogo: [['Nucita', '¡Cúcuta en 1955! Mira, nuestro barrio cuando los abuelos eran niños. ¡Ahora tenemos una avioneta de hélice!'], ['Petunia', '¡Mis cazas de hélice van a cubrir el cielo de Cúcuta!']],
    burlas: ['¡Tu barrio va a ser mío!', '¡Bzzz! ¡Más cazas, más cazas!'],
    dato: 'Muy cerca de Cúcuta, en Villa del Rosario, se reunió en 1821 el Congreso que creó la Constitución de Cúcuta. Su Templo Histórico todavía se puede visitar.',
    final: 'Petunia saltó a 1970... ¡al Eje Cafetero!'
  },
  {
    id: 'eje', ciudad: 'Eje Cafetero', anio: 1970, titulo: 'El cóndor de lata', avion: 1970, escenario: 'eje1970', mapa: [-75.57, 4.64], etiqueta: 'right',
    cielo: [0x3a86d8, 0xdfeee8], niebla: 0xdce8e2, nieblaRango: [320, 1350], luz: [0.85, 0.75], agua: -Infinity, pajaros: 0x2a2a2a,
    inicio: { x: 420, y: 150, z: -320 }, centro: [0, 0], limite: 820, dif: 1.35, misiles: true,
    oleadas: [{ jetR: 2, helicopteroChico: 2 }, { jetR: 3, helicopteroChico: 3 }, { jetR: 4, helicopteroChico: 3, kamikaze: 2 }],
    jefe: { tipo: 'condorRobot', ia: 'jefe', nombre: 'Cóndor Tuerca', vida: 140, bala: 'laser', orbita: 160, alto: 35, escoltas: ['jetR', 'helicopteroChico', 'helicopteroChico'], frases: ['¡Krrraaa! ¡Todo el café será de Petunia!', '¡Mis plumas de lata... se caen!'] },
    dialogo: [['Nucita', '¡1970 en el Eje Cafetero! Montañas de café, palmas de cera altísimas... ¡y vamos en un jet plateado!'], ['Petunia', 'Mi Cóndor Tuerca, un cóndor robot gigante, se va a robar toda la cosecha de café. ¡Bip bop!']],
    burlas: ['¡Krrraaa! ¡Ese café huele delicioso!', '¡Mis helicópteros vigilan cada cafetal!'],
    dato: 'La palma de cera del Quindío es el árbol nacional de Colombia y puede medir más de 60 metros. ¡En el Valle de Cocora hay muchísimas!',
    final: 'El café está a salvo. ¡Petunia escapó a Bogotá, en 1990!'
  },
  {
    id: 'bogota', ciudad: 'Bogotá', anio: 1990, titulo: 'Truenos sobre Monserrate', avion: 1990, escenario: 'bogota1990', mapa: [-74.07, 4.6], etiqueta: 'left',
    cielo: [0x5f86b8, 0xc9d6e0], niebla: 0xc9d6e0, nieblaRango: [300, 1300], luz: [0.75, 0.6], agua: -Infinity, pajaros: 0x2a2a2a,
    inicio: { x: -420, y: 100, z: 420 }, centro: [-40, 0], limite: 800, dif: 1.6, misiles: true,
    oleadas: [{ jetE: 4, jetR: 1 }, { jetE: 3, jetR: 3 }, { jetE: 4, jetR: 3, kamikaze: 2 }],
    jefe: { tipo: 'helicoptero', ia: 'jefe', nombre: 'Helicóptero Trueno', vida: 130, bala: 'normal', orbita: 120, alto: 20, misiles: true, escoltas: ['jetE', 'jetE', 'jetR'], frases: ['¡Desde Monserrate lo veo todo, bip bop!', '¡Mis aspas... se detienen!'] },
    dialogo: [['Nucita', '¡Bogotá 1990! Allá arriba está Monserrate. ¡Y ahora volamos un jet supersónico!'], ['Petunia', 'Mi Helicóptero Trueno te espera junto a los cerros. Después vuelvo a 2030 por mi equipo de robots.']],
    burlas: ['¡Qué frío hace aquí arriba, bip bop!', '¡Mis jets son más rápidos que el sonido... y que tú!'],
    dato: 'El santuario de Monserrate está a más de 3.100 metros sobre el nivel del mar, y la Torre Colpatria fue por muchos años el edificio más alto de Colombia.',
    final: 'Petunia volvió a 2030... ¡a nuestra casa en Cúcuta!'
  },
  {
    id: 'final', ciudad: 'Cúcuta', anio: 2030, titulo: 'Batalla final: el equipo de robots', avion: 2030, escenario: 'cucuta2030', mapa: [-72.5, 7.9], etiqueta: 'left',
    cielo: [0x0d0b2e, 0x6a2d6e], niebla: 0x2a1840, nieblaRango: [260, 1300], luz: [0.5, 0.35], agua: -Infinity, noche: true, pajaros: 0x111111,
    inicio: { x: 320, y: 110, z: 320 }, centro: [0, 0], limite: 820, dif: 2.0, misiles: true,
    oleadas: [{ robot: 4, dron: 2 }, { robot: 4, robotJet: 2, dron: 3 }, { robot: 5, robotJet: 3, dron: 4 }],
    jefe: { tipo: 'naveP', ia: 'nave', nombre: 'Petunia y su nave de guerra', vida: 120, bala: 'laser', orbita: 200, alto: 40, escoltas: ['robot', 'robot', 'dron'], frases: ['¡Colombia será mía!', '¡Esto no se queda así!'] },
    dialogo: [['Petunia', '¡Volvimos a 2030! Mi equipo completo de robots te espera. ¡Colombia será mía!'], ['Nucita', '¡Guau guau! Es la batalla final, sobre nuestro barrio. ¡Por Cúcuta y por toda Colombia!']],
    burlas: ['¡Robots, formación de ataque!', '¡Ni con 300 años de historia me vas a ganar!'],
    dato: '', final: ''
  }
];
const TUT_PC = ['¡Despegando! Nucita va contigo de copiloto 🐶', 'W/S o flechas ↑↓: subir y bajar', 'A/D o flechas ←→: girar', 'Espacio o clic: disparar · E o clic derecho: cohete', 'El rombo verde 🔷 muestra dónde apuntar', 'Q: Ladrido Sónico de Nucita · C: cambiar cámara', 'Shift: acelerar · Ctrl o X: frenar · P: pausa'];
const TUT_TACTIL = ['¡Despegando! Nucita va contigo de copiloto 🐶', 'Joystick de la izquierda: dirigir', '🔥 disparar · 🚀 cohete', 'El rombo verde 🔷 muestra dónde apuntar', '🐶 Ladrido Sónico · 🎥 cámara · ⚡ acelerar'];

// Estado general del juego
const juego = {
  estado: 'menu', nivel: 0, dif: 0, puntos: 0, puntosInicio: 0, derribados: 0,
  fase: 'oleadas', oleada: -1, tOleada: 0, jefe: null, tFin: 0, tMuerte: 0,
  fAltura: () => 0, solidos: () => -1e9, agua: -Infinity, centro: new THREE.Vector3(), limite: 800,
  camaraModo: 'fuera', temblor: 0, intro: 0, lider: new THREE.Vector3(), tutorial: [], tTut: 0,
  combo: 0, tCombo: 0
};
// ---- Dificultad: Normal o Difícil ----
// Difícil: enemigos más rápidos y fuertes, más enemigos por oleada, jefes con más vida y menos ayuda para apuntar.
let modoDificil = Guardado.get('dificil', false);
const cantidadEnemigos = n => modoDificil ? Math.ceil(n * 1.35) : n;
// ---- Reloj del viaje: 20 minutos para salvar la historia ----
// Solo corre mientras juegas. Si llega a cero, se borran los niveles superados y se vuelve a empezar.
const TIEMPO_TOTAL = 20 * 60;
let reloj = clamp(Number(Guardado.get('reloj', TIEMPO_TOTAL)) || TIEMPO_TOTAL, 0, TIEMPO_TOTAL);
function fmtTiempo(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function guardarReloj() { Guardado.set('reloj', reloj); }
function actualizarReloj(dt) {
  const antes = reloj; reloj = Math.max(0, reloj - dt);
  if (antes > 300 && reloj <= 300) { Nucita.decir('¡Quedan 5 minutos!', null, 0); aviso('⏱ ¡Quedan 5 minutos!', 2); }
  if (antes > 60 && reloj <= 60) { Nucita.decir('¡Solo queda 1 minuto!', null, 0); aviso('⏱ ¡Último minuto!', 2); }
  if (cuadro % 90 === 0) guardarReloj();
  if (reloj <= 0) tiempoAgotado();
}
function tiempoAgotado() {
  reloj = TIEMPO_TOTAL; guardarReloj(); Guardado.set('nivel', 0); guardarRecord();
  juego.estado = 'tiempo'; Sonido.motor(0, false); Sonido.portal();
  mostrarPantalla('pTiempo');
}
// Altura del suelo (o del mar) en un punto, para choques
function altura(x, z) { return Math.max(juego.fAltura(x, z), juego.agua, juego.solidos(x, z)); }

// =====================================================================
// 8. ENTRADA (teclado, ratón, táctil y giroscopio)
// =====================================================================
const teclas = {}, raton = { izq: false, nx: 0, ny: 0 }, tactil = { jx: 0, jy: 0, fuego: false, acel: false };
const giro = { activo: false, x: 0, y: 0, b0: null, g0: null };

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  const nueva = !teclas[e.code]; teclas[e.code] = true;
  if (!nueva) return;
  if (juego.estado === 'jugando') {
    if (e.code === 'KeyE') lanzarCohete();
    else if (e.code === 'KeyQ') ladridoSonico();
    else if (e.code === 'KeyC') cambiarCamara();
    else if (e.code === 'KeyP' || e.code === 'Escape') pausar();
  } else if (juego.estado === 'pausa' && (e.code === 'KeyP' || e.code === 'Escape')) reanudar();
  else if (juego.estado === 'hangar') { if (e.code === 'ArrowLeft') verHangar(hgIdx - 1); else if (e.code === 'ArrowRight') verHangar(hgIdx + 1); else if (e.code === 'Escape') irAlMenu(); }
  else if (juego.estado === 'intro' && e.code === 'Escape') finIntro();
});
window.addEventListener('keyup', e => { teclas[e.code] = false; });
window.addEventListener('blur', () => { for (const k in teclas) teclas[k] = false; raton.izq = false; if (juego.estado === 'jugando') pausar(); });
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || juego.estado !== 'jugando') return;
  if (e.button === 0) raton.izq = true; else if (e.button === 2) lanzarCohete();
});
window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) raton.izq = false; });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('mousemove', e => { raton.nx = e.clientX / innerWidth * 2 - 1; raton.ny = e.clientY / innerHeight * 2 - 1; });
let dirigirMouse = Guardado.get('mouse', false);

const joy = $('joystick'), perilla = $('perilla'); let joyId = null; const joyC = { x: 0, y: 0 }, JOY_R = 55;
function moverJoy(e) {
  let dx = e.clientX - joyC.x, dy = e.clientY - joyC.y; const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  perilla.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  tactil.jx = dx / JOY_R; tactil.jy = -dy / JOY_R;
}
joy.addEventListener('pointerdown', e => {
  e.preventDefault(); joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (er) { }
  const r = joy.getBoundingClientRect(); joyC.x = r.left + r.width / 2; joyC.y = r.top + r.height / 2; moverJoy(e);
});
joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moverJoy(e); });
const soltarJoy = e => { if (e.pointerId === joyId) { joyId = null; tactil.jx = tactil.jy = 0; perilla.style.transform = 'translate(-50%,-50%)'; } };
joy.addEventListener('pointerup', soltarJoy); joy.addEventListener('pointercancel', soltarJoy);
document.querySelectorAll('.btnT').forEach(b => {
  const acc = b.dataset.a;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); b.classList.add('activo');
    if (acc === 'fuego') tactil.fuego = true; else if (acc === 'acel') tactil.acel = true;
    else if (acc === 'cohete') lanzarCohete(); else if (acc === 'ladrido') ladridoSonico();
    else if (acc === 'camara') cambiarCamara(); else if (acc === 'pausa') pausar();
  });
  const fin = () => { b.classList.remove('activo'); if (acc === 'fuego') tactil.fuego = false; if (acc === 'acel') tactil.acel = false; };
  b.addEventListener('pointerup', fin); b.addEventListener('pointercancel', fin); b.addEventListener('pointerleave', fin);
});
window.addEventListener('deviceorientation', e => {
  if (!giro.activo || e.beta === null) return;
  const ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  let lado, cab;
  if (ang === 90) { lado = e.beta; cab = -e.gamma; } else if (ang === 270 || ang === -90) { lado = -e.beta; cab = e.gamma; } else { lado = e.gamma; cab = e.beta; }
  if (giro.b0 === null) { giro.b0 = lado; giro.g0 = cab; }
  giro.x = clamp((lado - giro.b0) / 20, -1, 1); giro.y = clamp((cab - giro.g0) / 20, -1, 1);
});
function calibrarGiro() { giro.b0 = null; giro.x = giro.y = 0; }
async function activarGiro(on) {
  if (on && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') on = false; } catch (er) { on = false; }
  }
  $('chkGiro').checked = on; giro.activo = on; calibrarGiro(); Guardado.set('giro', on);
}
function leerEntrada() {
  let x = tactil.jx, y = tactil.jy;
  if (teclas.KeyA || teclas.ArrowLeft) x -= 1; if (teclas.KeyD || teclas.ArrowRight) x += 1;
  if (teclas.KeyW || teclas.ArrowUp) y += 1; if (teclas.KeyS || teclas.ArrowDown) y -= 1;
  if (giro.activo) { x += giro.x; y += giro.y; }
  if (dirigirMouse && !ES_TACTIL) { // el mouse funciona como palanca: lejos del centro = giro más fuerte
    const zm = v => Math.abs(v) < 0.05 ? 0 : (v - Math.sign(v) * 0.05) / 0.95;
    x += zm(raton.nx) * 1.8; y -= zm(raton.ny) * 1.8;
  }
  return {
    x: clamp(x, -1, 1), y: clamp(y, -1, 1),
    acel: !!(teclas.ShiftLeft || teclas.ShiftRight || tactil.acel),
    freno: !!(teclas.ControlLeft || teclas.ControlRight || teclas.KeyX),
    fuego: !!(teclas.Space || raton.izq || tactil.fuego)
  };
}

// =====================================================================
// 9. JUGADOR (avión de la época + piloto + Nucita)
// =====================================================================
const avioneta = new THREE.Group(); avioneta.rotation.order = 'YXZ'; escena.add(avioneta);
const ASIENTO_P = new THREE.Vector3(-0.42, 0.36, 0.38), ASIENTO_N = new THREE.Vector3(0.48, 0.5, -0.05);
const nucita = crearNucita(); nucita.position.copy(ASIENTO_N); avioneta.add(nucita);
let piloto = null, modelo = null;
const cacheAviones = {};
function ponerPiloto(tipo) {
  if (piloto) avioneta.remove(piloto);
  piloto = crearPiloto(tipo); piloto.position.copy(ASIENTO_P); avioneta.add(piloto);
  piloto.visible = juego.camaraModo !== 'dentro';
}
function ponerAvion(epoca) {
  if (modelo) avioneta.remove(modelo);
  if (!cacheAviones[epoca]) cacheAviones[epoca] = crearAvion(epoca);
  modelo = cacheAviones[epoca]; avioneta.add(modelo);
  avioneta.userData = modelo.userData;
  jugador.av = AVIONES[epoca];
  matBala.color.setHex(jugador.av.bala);
  Sonido.jet = jugador.av.sonido === 'jet';
}
const jugador = {
  pos: avioneta.position, yaw: 0, pitch: 0, roll: 0, vel: 46, velObj: 46, av: AVIONES[2030],
  vida: 100, cohetes: 6, calor: 0, sobrecalentado: false, carga: 0.5, invul: 0,
  cdBala: 0, cdCohete: 0, lado: 0, inX: 0, inY: 0, yawVel: 0, adelante: new THREE.Vector3(0, 0, -1), muerto: false, entrada: { x: 0, y: 0 }
};
function aplicarOrientacion() {
  avioneta.rotation.set(jugador.pitch, jugador.yaw, jugador.roll);
  jugador.adelante.set(-Math.sin(jugador.yaw) * Math.cos(jugador.pitch), Math.sin(jugador.pitch), -Math.cos(jugador.yaw) * Math.cos(jugador.pitch));
  avioneta.updateMatrixWorld(true);
}
function actualizarJugador(dt) {
  const J = jugador, AV = J.av;
  if (J.muerto) { juego.tMuerte -= dt; if (juego.tMuerte <= 0) gameOver(); return; }
  const ent = juego.intro > 0 ? { x: 0, y: 0, acel: false, freno: false, fuego: false } : leerEntrada();
  if (juego.intro > 0) {
    // Despegue automático desde el patio de la casa
    juego.intro -= dt; const t = 3.6 - juego.intro;
    J.vel = Math.min(AV.vel, 6 + t * 30);
    J.pitch = t < 1.3 ? 0 : lerp(J.pitch, 0.38, 1 - Math.exp(-3 * dt));
    if (juego.intro <= 0) { aviso('¡En el aire!', 1.8); Nucita.decir('¡Guau! ¡A cazar robots, ' + nombrePiloto() + '!', null, 0); }
  } else {
    // Controles suaves: curva para apuntar fino y el avión responde sin brusquedad
    const crv = v => Math.sign(v) * Math.pow(Math.abs(v), 1.35), k = 1 - Math.exp(-9 * dt);
    J.inX = lerp(J.inX, crv(ent.x), k); J.inY = lerp(J.inY, crv(ent.y), k);
    // Ayuda de puntería: si un enemigo está cerca de la mira, el avión se acomoda solito hacia él
    let fino = 1;
    const obj = buscarObjetivo(0.96, 480);
    if (obj) {
      puntoAdelantado(obj, J.pos, AV.balaVel + J.vel, _aim).sub(J.pos); const d = _aim.length();
      const dyaw = angDif(Math.atan2(-_aim.x, -_aim.z), J.yaw), dpit = Math.asin(clamp(_aim.y / d, -1, 1)) - J.pitch;
      if (Math.abs(dyaw) < 0.22 && Math.abs(dpit) < 0.22) {
        const f = (ES_TACTIL ? 1.1 : 0.7) * (modoDificil ? 0.45 : 1) * (1 - Math.min(1, Math.abs(J.inX) * 0.8));
        J.yaw += clamp(dyaw, -f * dt, f * dt); J.pitch += clamp(dpit, -f * dt, f * dt);
        fino = 0.75; // giro más fino cuando ya lo tienes en la mira
      }
    }
    J.pitch = lerp(J.pitch, J.inY * 0.75, 1 - Math.exp(-2.5 * dt));
    J.yawVel = lerp(J.yawVel, -J.inX * AV.giro * fino, 1 - Math.exp(-7 * dt));
    J.yaw += J.yawVel * dt;
    J.roll = lerp(J.roll, -J.inX * 0.85, 1 - Math.exp(-4 * dt));
    J.velObj = ent.acel ? AV.max : (ent.freno ? AV.min : AV.vel);
    J.vel = lerp(J.vel, J.velObj, 1 - Math.exp(-1.6 * dt));
  }
  J.entrada = { x: J.inX, y: J.inY, acel: ent.acel, freno: ent.freno, fuego: ent.fuego };
  // Límite del mapa: si se aleja mucho, el avión vuelve solo
  const dx = juego.centro.x - J.pos.x, dz = juego.centro.z - J.pos.z;
  if (Math.hypot(dx, dz) > juego.limite) {
    const obj = Math.atan2(-dx, -dz);
    J.yaw += clamp(angDif(obj, J.yaw), -1.3 * dt, 1.3 * dt);
    Nucita.decir('¡Nos alejamos! ¡Volvamos!', 'limite', 8);
  }
  aplicarOrientacion();
  J.pos.addScaledVector(J.adelante, J.vel * dt);
  if (J.pos.y > TECHO) { J.pos.y = TECHO; J.pitch = Math.min(J.pitch, 0); }
  const suelo = altura(J.pos.x, J.pos.z);
  if (juego.intro > 0) { if (J.pos.y < suelo + 1.8) J.pos.y = suelo + 1.8; }
  else if (J.pos.y < suelo + 2.2) {
    if (J.invul <= 0) { explosion(J.pos, 1.3); danioJugador(20, true); Nucita.decir('¡Cuidado con el suelo!', null, 0); Nucita.asustar(); }
    if (!J.muerto) { J.pos.y = suelo + 45; J.pitch = 0.25; J.invul = Math.max(J.invul, 2.5); }
  }
  aplicarOrientacion();
  // Armas
  J.cdBala -= dt; J.cdCohete -= dt; J.invul -= dt;
  if (ent.fuego && !J.sobrecalentado && J.cdBala <= 0) { dispararJugador(); J.cdBala = 1 / 12; J.calor += 0.03; }
  J.calor = Math.max(0, J.calor - dt * (ent.fuego && !J.sobrecalentado ? 0.08 : 0.45));
  if (J.calor >= 1 && !J.sobrecalentado) { J.sobrecalentado = true; aviso('¡Armas recalentadas!', 1.5); }
  if (J.sobrecalentado && J.calor < 0.35) J.sobrecalentado = false;
  J.carga = Math.min(1, J.carga + dt / 14);
  avioneta.visible = !(J.invul > 0 && juego.camaraModo === 'fuera' && Math.floor(tiempo * 12) % 2 === 0);
  Sonido.motor(J.vel, true);
}
function danioJugador(n, forzado) {
  const J = jugador;
  if ((!forzado && J.invul > 0) || J.muerto || juego.estado !== 'jugando') return;
  J.vida -= n; juego.temblor = Math.max(juego.temblor, 0.6);
  $('flash').style.opacity = 1; clearTimeout(danioJugador._t); danioJugador._t = setTimeout(() => $('flash').style.opacity = 0, 160);
  Sonido.golpe();
  if (!forzado) J.invul = 0.25;
  if (J.vida <= 0) {
    J.vida = 0; J.muerto = true; juego.tMuerte = 2.4;
    explosion(J.pos, 3); avioneta.visible = false; Sonido.motor(0, false);
    Nucita.decir('¡Auuuu!', null, 0);
  }
}
const _cq = new THREE.Quaternion(), _ce = new THREE.Euler(0, 0, 0, 'YXZ'), _cv = new THREE.Vector3(), _cv2 = new THREE.Vector3();
function actualizarCamara(dt) {
  const J = jugador, AV = J.av;
  // Sensación de velocidad: el campo de visión se abre al acelerar
  const fovObj = 65 + clamp((J.vel - AV.vel) / (AV.max - AV.vel), -0.5, 1) * 9;
  camara.fov = lerp(camara.fov, fovObj, 1 - Math.exp(-3 * dt)); camara.updateProjectionMatrix();
  if (juego.camaraModo === 'fuera' || J.muerto) {
    _ce.set(J.pitch * 0.5, J.yaw, 0); _cq.setFromEuler(_ce);
    _cv.set(0, 3.4, 13).applyQuaternion(_cq).add(J.pos);
    const h = altura(_cv.x, _cv.z) + 1.5; if (_cv.y < h) _cv.y = h;
    camara.position.lerp(_cv, 1 - Math.exp(-10 * dt));
    _cv2.copy(J.pos).addScaledVector(J.adelante, 25); _cv2.y += 1.5;
    camara.lookAt(_cv2);
  } else {
    // Vista desde la cabina: vibración del motor y la cabeza que mira hacia el giro
    const vib = Math.sin(tiempo * 47) * 0.004 * (J.vel / AV.vel) + (J.entrada.acel ? Math.sin(tiempo * 71) * 0.003 : 0);
    _cv.set(-0.45, 1.3 + vib, 0.85); avioneta.localToWorld(_cv); camara.position.copy(_cv);
    camara.quaternion.copy(avioneta.quaternion);
    _ce.set(-0.13 + J.entrada.y * 0.03, -0.17 - J.entrada.x * 0.12, J.entrada.x * 0.04); _cq.setFromEuler(_ce); camara.quaternion.multiply(_cq);
  }
  if (juego.temblor > 0) {
    camara.position.x += rand(-1, 1) * juego.temblor * 0.6; camara.position.y += rand(-1, 1) * juego.temblor * 0.6;
    juego.temblor = Math.max(0, juego.temblor - dt * 2.5);
  }
}
function cambiarCamara() {
  juego.camaraModo = juego.camaraModo === 'fuera' ? 'dentro' : 'fuera';
  if (piloto) piloto.visible = juego.camaraModo !== 'dentro';
  aviso(juego.camaraModo === 'dentro' ? 'Cámara: cabina' : 'Cámara: exterior', 1);
}
// Sombra del avión en el suelo (silueta)
const texSombra = texturaCanvas(64, 64, (x) => { x.fillStyle = 'rgba(0,0,0,1)'; x.fillRect(29, 6, 6, 52); x.fillRect(4, 20, 56, 9); x.fillRect(20, 50, 24, 5); });
const sombra = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, opacity: 0.35, depthWrite: false }));
escena.add(sombra);
const _pa = new THREE.Vector3(), _aim = new THREE.Vector3(), _bh = new THREE.Vector3();
function animarAvioneta(dt) {
  const u = avioneta.userData, enMenu = juego.estado !== 'jugando' && juego.estado !== 'pausa', J = jugador, e = J.entrada, k = 1 - Math.exp(-8 * dt), t = tiempo;
  const ex = enMenu ? Math.sin(t * 0.8) * 0.4 : e.x, ey = enMenu ? Math.sin(t * 0.6) * 0.3 : e.y; // en el menú se mueven solitas
  u.helices.forEach(h => h.rotation.z += dt * (enMenu ? 7 : 24 + J.vel * 0.5));
  u.discos.forEach(d => d.material.opacity = enMenu ? 0 : 0.13);
  const pot = enMenu ? 0.3 : clamp((J.vel - J.av.min) / (J.av.max - J.av.min), 0.15, 1.2);
  u.fuegos.forEach((f, i) => { const s = (0.6 + pot * 0.9) * rand(0.85, 1.1); f.scale.y = (i % 2 ? 0.9 : 1.4) * s; });
  u.levita.forEach(l => l.material.opacity = 0.3 + Math.sin(t * 9) * 0.12);
  if (u.anillo) u.anillo.rotation.z += dt * 2.5;
  // Superficies de control
  u.alerones[0].rotation.x = lerp(u.alerones[0].rotation.x, ex * 0.4, k);
  u.alerones[1].rotation.x = lerp(u.alerones[1].rotation.x, -ex * 0.4, k);
  u.profundidad.rotation.x = lerp(u.profundidad.rotation.x, -ey * 0.4, k);
  u.direccion.rotation.y = lerp(u.direccion.rotation.y, ex * 0.4, k);
  // Palanca y acelerador
  u.palanca.rotation.x = lerp(u.palanca.rotation.x, ey * 0.35, k);
  u.palanca.rotation.z = lerp(u.palanca.rotation.z, -ex * 0.35, k);
  u.acelerador.rotation.x = lerp(u.acelerador.rotation.x, e.acel ? -0.55 : (e.freno ? 0.45 : 0), k);
  // Instrumentos: velocímetro y altímetro con un temblorcito del motor
  const vib = enMenu ? 0 : Math.sin(t * 53) * 0.03;
  u.agujas[0].rotation.z = -(-2.2 + clamp(J.vel / J.av.max, 0, 1) * 4.4) + vib;
  u.agujas[1].rotation.z = -(-2.2 + clamp(J.pos.y / TECHO, 0, 1) * 4.4) - vib;
  u.horizonte.rotation.z = -J.roll;
  u.texHorizonte.offset.y = 0.25 + clamp(J.pitch * 0.3, -0.24, 0.24);
  // Luces de aviso del tablero
  const parpadeo = Math.sin(t * 12) > 0;
  u.luzVida.material.color.setHex(J.vida < 30 && !enMenu ? (parpadeo ? 0xff2222 : 0x551111) : 0x2a3a2a);
  u.luzLadrido.material.color.setHex(J.carga >= 1 && !enMenu ? 0xff7fd0 : 0x3a2232);
  u.luzCalor.material.color.setHex(J.sobrecalentado ? (parpadeo ? 0xff9a1a : 0x553311) : (J.calor > 0.6 ? 0xffc04a : 0x3a3020));
  // Colgandejo: péndulo que se mece con los giros y el temblor del motor
  const objZ = -J.roll * 0.8 + vib * 2, objX = -J.pitch * 0.6 + (e.acel ? 0.25 : 0);
  u.colganteVel[0] += (40 * (objZ - u.colgante.rotation.z) - 2.5 * u.colganteVel[0]) * dt;
  u.colganteVel[1] += (40 * (objX - u.colgante.rotation.x) - 2.5 * u.colganteVel[1]) * dt;
  u.colgante.rotation.z += u.colganteVel[0] * dt; u.colgante.rotation.x += u.colganteVel[1] * dt;
  // Fogonazos de las armas
  for (let i = 0; i < 2; i++) {
    u.tFogonazo[i] -= dt; const f = u.fogonazos[i];
    f.visible = u.tFogonazo[i] > 0;
    if (f.visible) { f.scale.set(rand(0.18, 0.3), rand(0.7, 1.2), rand(0.18, 0.3)); f.rotation.y = rand(0, 3); }
  }
  // Humo del escape, humo de daño y estelas en las puntas de las alas
  if (juego.estado === 'jugando' && !J.muerto) {
    u.tHumo -= dt;
    if (u.tHumo <= 0) {
      u.tHumo = ES_TACTIL ? 0.12 : 0.07;
      for (const p of u.escapes) emitir(_pa.copy(p).applyMatrix4(avioneta.matrixWorld), u.colorHumo || 0x9a9a9a, _pv.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)), u.humoGrande ? 0.35 : 0.6, u.humoGrande ? 0.3 : 0.25, u.humoGrande ? 0.9 : 1.1, 0, u.humoGrande ? 0.5 : 0.35);
      if (J.vida < 40) emitir(_pa.set(0, 0.3, -2.0).applyMatrix4(avioneta.matrixWorld), J.vida < 20 ? 0x222222 : 0x555555, _pv.set(rand(-1, 1), rand(1, 3), rand(-1, 1)), 1.4, 0.6, 2.6, 0, 0.75);
    }
    if ((Math.abs(e.x) > 0.6 || (e.acel && J.vel > J.av.vel * 1.3)) && (!ES_TACTIL || cuadro % 2 === 0)) {
      for (const p of u.puntas) emitir(_pa.copy(p).applyMatrix4(avioneta.matrixWorld), 0xffffff, _pv.set(0, 0, 0), 0.55, 0.18, 0.45, 0, 0.5);
    }
  }
  // Sombra en el suelo
  const suelo = altura(J.pos.x, J.pos.z), alto = J.pos.y - suelo;
  sombra.visible = avioneta.visible && alto < 140 && !sala.visible;
  if (sombra.visible) {
    sombra.position.set(J.pos.x, suelo + 0.2, J.pos.z); sombra.rotation.set(-PI / 2, 0, J.yaw);
    sombra.material.opacity = 0.38 * (1 - alto / 140); sombra.scale.setScalar(1 + alto / 200);
  }
  if (piloto) {
    const c = piloto.userData.cabeza;
    c.rotation.y = lerp(c.rotation.y, -ex * 0.4 + Math.sin(t * 0.7) * 0.15, 0.1);
    c.rotation.z = lerp(c.rotation.z, J.roll * -0.3, 0.1);
    const vb = enMenu ? 0.35 : clamp(J.vel / 55, 0.3, 1.5) * (u.cerrada ? 0.35 : 1);
    piloto.userData.bufanda.forEach((sg, i) => { sg.rotation.y = Math.sin(t * 11 - i * 0.9 + 1) * 0.3 * vb + (i === 0 ? -0.4 : 0); sg.rotation.x = Math.sin(t * 8 - i * 1.1) * 0.15 * vb + (i === 0 ? -0.2 : 0); });
  }
  animarNucita(dt);
}

// =====================================================================
// 10. ARMAS Y EFECTOS
// =====================================================================
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _pv = new THREE.Vector3();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3();
function distSeg(a, b, p) { // distancia de un punto a un segmento (para balas rápidas)
  _s1.subVectors(b, a); const l2 = _s1.lengthSq();
  const t = l2 > 0 ? clamp(_s2.subVectors(p, a).dot(_s1) / l2, 0, 1) : 0;
  return _s2.copy(a).addScaledVector(_s1, t).distanceTo(p);
}
// ---- Partículas (fuego, humo, chispas, escombros) ----
const MAX_P = ES_TACTIL ? 220 : 340, particulas = []; let idxP = 0;
for (let i = 0; i < MAX_P; i++) {
  const m = new THREE.Mesh(G.esferaS, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  m.visible = false; escena.add(m);
  particulas.push({ m, vel: new THREE.Vector3(), vida: 0, max: 1, t0: 1, t1: 1, grav: 0, op: 1 });
}
function emitir(pos, color, vel, vida, t0, t1, grav = 0, op = 1) {
  const p = particulas[idxP]; idxP = (idxP + 1) % MAX_P;
  p.m.position.copy(pos); p.m.material.color.setHex(color); p.vel.copy(vel);
  p.vida = p.max = vida; p.t0 = t0; p.t1 = t1; p.grav = grav; p.op = op;
  p.m.visible = true; p.m.scale.setScalar(t0); p.m.rotation.set(rand(0, 3), rand(0, 3), 0);
}
function actualizarParticulas(dt) {
  for (const p of particulas) {
    if (p.vida <= 0) continue;
    p.vida -= dt; if (p.vida <= 0) { p.m.visible = false; continue; }
    const k = 1 - p.vida / p.max;
    p.m.scale.setScalar(lerp(p.t0, p.t1, k)); p.m.material.opacity = p.op * (1 - k);
    p.vel.y -= p.grav * dt; p.vel.multiplyScalar(1 - 1.5 * dt);
    p.m.position.addScaledVector(p.vel, dt);
  }
}
function explosion(pos, tam = 1, sonido = true) {
  for (let i = 0; i < 14; i++) emitir(pos, elegir([0xffd23f, 0xff8a1f, 0xff4d1f]), _pv.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(14 * tam), rand(0.4, 0.8), 0.8 * tam, 3 * tam);
  for (let i = 0; i < 8; i++) emitir(pos, elegir([0x555555, 0x777777, 0x444444]), _pv.set(rand(-1, 1), rand(0, 1.2), rand(-1, 1)).multiplyScalar(6 * tam), rand(1, 1.8), 1.2 * tam, 4.5 * tam, -2, 0.8);
  for (let i = 0; i < 8; i++) emitir(pos, 0xfff2a8, _pv.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(30 * tam), rand(0.3, 0.6), 0.25 * tam, 0.1, 25);
  if (sonido) Sonido.explosion(tam > 2);
  const d = pos.distanceTo(camara.position);
  if (d < 120) juego.temblor = Math.max(juego.temblor, (tam > 2 ? 1.2 : 0.5) * (1 - d / 120));
}
function escombros(pos, tam = 1) { for (let i = 0; i < 10; i++) emitir(pos, elegir([MO, NE, ME, MA]), _pv.set(rand(-1, 1), rand(0, 1.4), rand(-1, 1)).multiplyScalar(18 * tam), rand(1.2, 2), 0.35 * tam, 0.25 * tam, 30); }
function humo(pos, tam = 1) { emitir(pos, elegir([0x3a3a3a, 0x555555]), _pv.set(rand(-1, 1), rand(1, 3), rand(-1, 1)), 1.2, 0.8 * tam, 3 * tam, 0, 0.7); }

// ---- Grupos de balas reutilizables ----
function crearPool(n, fabrica) {
  const arr = [];
  for (let i = 0; i < n; i++) { const m = fabrica(); m.visible = false; escena.add(m); arr.push({ m, pos: m.position, prev: new THREE.Vector3(), vel: new THREE.Vector3(), vida: 0, activa: false, danio: 0 }); }
  return arr;
}
function tomar(pool) { for (const o of pool) if (!o.activa) { o.activa = true; o.m.visible = true; return o; } return null; }
function soltar(o) { o.activa = false; o.m.visible = false; }
const matBala = new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const matBalaE = brillo(0xff3366, 0.95), matCanonazo = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 60 }), matLaserE = brillo(0xff4fd8, 0.95);
const balasJ = crearPool(70, () => { const m = new THREE.Mesh(G.caja, matBala); m.scale.set(0.2, 0.2, 5); return m; });
const balasE = crearPool(80, () => new THREE.Mesh(G.bola, matBalaE));

function buscarObjetivo(minDot, maxDist) {
  let mejor = null, mejorP = Infinity;
  for (const e of enemigos) {
    if (e.cayendo || e.escudo) continue;
    _d.subVectors(e.pos, jugador.pos); const dist = _d.length();
    if (dist > maxDist || dist < 1) continue;
    const dot = _d.dot(jugador.adelante) / dist; if (dot < minDot) continue;
    const p = dist * (2 - dot); if (p < mejorP) { mejorP = p; mejor = e; }
  }
  return mejor;
}
function puntoAdelantado(e, origen, velBala, out) { // dónde estará el enemigo cuando llegue la bala
  const t = e.pos.distanceTo(origen) / velBala;
  return out.copy(e.pos).addScaledVector(e.dir, (e.velActual || 0) * t);
}
function dispararJugador() {
  const u = avioneta.userData, AV = jugador.av, lado = jugador.lado;
  const origen = _a.copy(u.canones[lado]); avioneta.localToWorld(origen); jugador.lado ^= 1;
  const dir = _b.copy(jugador.adelante), vb = AV.balaVel + jugador.vel;
  const obj = buscarObjetivo(0.975, 460); // ayudita de puntería
  if (obj) dir.copy(puntoAdelantado(obj, origen, vb, _c)).sub(origen).normalize();
  const b = tomar(balasJ); if (!b) return;
  b.pos.copy(origen); b.prev.copy(origen); b.vel.copy(dir).multiplyScalar(vb); b.vida = 1.4; b.obj = obj; b.vb = vb;
  b.m.lookAt(_c.copy(origen).add(dir));
  u.tFogonazo[lado] = 0.05;
  juego.temblor = Math.max(juego.temblor, 0.05);
  Sonido.disparo(AV.sonido === 'jet');
}
const TIPOS_BALA = {
  normal: { mat: matBalaE, esc: [0.5, 0.5, 0.5], vel: 150, danio: 4 },
  canon: { mat: matCanonazo, esc: [0.75, 0.75, 0.75], vel: 115, danio: 7 },
  laser: { mat: matLaserE, esc: [0.18, 0.18, 3], vel: 210, danio: 5 }
};
function dispararEnemigo(origen, dir, err, tipo = 'normal') {
  const T = TIPOS_BALA[tipo], b = tomar(balasE); if (!b) return;
  b.m.material = T.mat; b.m.scale.set(T.esc[0], T.esc[1], T.esc[2]);
  b.pos.copy(origen).addScaledVector(dir, 4); b.prev.copy(b.pos);
  b.vel.copy(dir).add(_c.set(rand(-err, err), rand(-err, err), rand(-err, err))).normalize().multiplyScalar(T.vel);
  b.m.lookAt(_c.copy(b.pos).add(b.vel));
  b.vida = 2.8; b.danio = T.danio + juego.dif * 1.2;
  emitir(b.pos, tipo === 'canon' ? 0xffb050 : (tipo === 'laser' ? 0xff4fd8 : 0xff6a6a), _pv.set(0, 0, 0), 0.12, 0.8, 1.6);
  if (tipo === 'canon') emitir(b.pos, 0xbbbbbb, _pv.set(0, 2, 0), 1.0, 1, 3, 0, 0.7);
  if (origen.distanceTo(jugador.pos) < 280) { if (tipo === 'canon') Sonido.canonazo(); else if (tipo === 'laser') Sonido.laser(); else Sonido.balaEnemiga(); }
}
function actualizarBalas(dt) {
  for (const b of balasJ) {
    if (!b.activa) continue;
    // la bala se curva un poquito hacia su enemigo (solo si ya iba casi derecho)
    if (!modoDificil && b.obj && !b.obj.cayendo && !b.obj.escudo) {
      puntoAdelantado(b.obj, b.pos, b.vb, _bh).sub(b.pos); const dl = _bh.length();
      if (dl > 4) { _bh.divideScalar(dl); _pa.copy(b.vel).divideScalar(b.vb); if (_pa.dot(_bh) > 0.97) { _pa.lerp(_bh, Math.min(1, 5 * dt)).normalize(); b.vel.copy(_pa).multiplyScalar(b.vb); b.m.lookAt(_bh.copy(b.pos).add(b.vel)); } }
    }
    b.prev.copy(b.pos); b.pos.addScaledVector(b.vel, dt); b.vida -= dt;
    if (b.vida <= 0) { soltar(b); continue; }
    let pego = false;
    for (const e of enemigos) { if (!e.cayendo && distSeg(b.prev, b.pos, e.pos) < e.radio) { golpe(e, 1, b.pos); pego = true; break; } }
    if (!pego) for (const mi of misiles) { if (distSeg(b.prev, b.pos, mi.pos) < 2.4) { explotarMisil(mi); pego = true; break; } }
    if (!pego && b.pos.y < altura(b.pos.x, b.pos.z)) { emitir(b.pos, juego.agua > -1 && b.pos.y < 0.5 ? 0xe8f6ff : 0xc8b48a, _pv.set(0, 6, 0), 0.5, 0.5, 1.6, 10); pego = true; }
    if (pego) soltar(b);
  }
  for (const b of balasE) {
    if (!b.activa) continue;
    b.prev.copy(b.pos); b.pos.addScaledVector(b.vel, dt); b.vida -= dt;
    if (b.vida <= 0 || b.pos.y < altura(b.pos.x, b.pos.z)) { soltar(b); continue; }
    if (!jugador.muerto && distSeg(b.prev, b.pos, jugador.pos) < 3.2) { danioJugador(b.danio); emitir(b.pos, 0xffaa55, _pv.set(0, 0, 0), 0.3, 0.8, 2); soltar(b); }
  }
}
// ---- Cohetes del jugador (persiguen al enemigo más cercano) ----
const cohetes = [];
function lanzarCohete() {
  if (juego.estado !== 'jugando' || juego.intro > 0 || jugador.muerto) return;
  if (jugador.cohetes <= 0) { Nucita.decir('¡No quedan cohetes!', 'sinCohetes', 4, false); return; }
  if (jugador.cdCohete > 0) return;
  const obj = buscarObjetivo(0.5, 700) || buscarObjetivo(-1, 900);
  jugador.cohetes--; jugador.cdCohete = 0.45;
  const m = proto('cohete', () => crearCoheteModelo(false)).clone();
  const origen = new THREE.Vector3(jugador.lado ? 1.2 : -1.2, -0.7, -1.2); avioneta.localToWorld(origen);
  m.position.copy(origen); escena.add(m);
  cohetes.push({ m, pos: m.position, dir: jugador.adelante.clone(), vel: jugador.vel + 40, obj, vida: 4, humo: 0 });
  Sonido.cohete();
}
function actualizarCohetes(dt) {
  for (let i = cohetes.length - 1; i >= 0; i--) {
    const c = cohetes[i]; c.vida -= dt; c.vel = Math.min(185, c.vel + 120 * dt);
    if (c.obj && !c.obj.cayendo && enemigos.includes(c.obj)) {
      _a.subVectors(c.obj.pos, c.pos).normalize(); const ang = c.dir.angleTo(_a), max = 3.2 * dt;
      if (ang > 1e-4) c.dir.lerp(_a, Math.min(1, max / ang)).normalize();
    }
    c.pos.addScaledVector(c.dir, c.vel * dt); c.m.lookAt(_b.copy(c.pos).add(c.dir));
    c.humo -= dt; if (c.humo <= 0) { c.humo = 0.03; emitir(c.pos, 0xdddddd, _pv.set(0, 1, 0), 0.7, 0.4, 1.6, 0, 0.7); }
    let fin = c.vida <= 0 || c.pos.y < altura(c.pos.x, c.pos.z);
    for (const e of enemigos) { if (!e.cayendo && c.pos.distanceTo(e.pos) < e.radio + 1.5) { golpe(e, 8, c.pos); fin = true; break; } }
    if (fin) { explosion(c.pos, 0.9); escena.remove(c.m); cohetes.splice(i, 1); }
  }
}
// ---- Misiles enemigos (persiguen al jugador; se pueden derribar a tiros) ----
const misiles = [];
function lanzarMisilEnemigo(pos, dir) {
  const m = proto('misil', () => crearCoheteModelo(true)).clone();
  m.position.copy(pos).addScaledVector(dir, 5); escena.add(m);
  misiles.push({ m, pos: m.position, dir: dir.clone(), vel: 60, vida: 7, humo: 0 });
  Sonido.tono(300, 600, 0.3, 0.06, 'sawtooth');
}
function explotarMisil(mi) { explosion(mi.pos, 0.8); escena.remove(mi.m); const i = misiles.indexOf(mi); if (i >= 0) misiles.splice(i, 1); }
function actualizarMisiles(dt) {
  for (let i = misiles.length - 1; i >= 0; i--) {
    const mi = misiles[i]; mi.vida -= dt; mi.vel = Math.min(82, mi.vel + 15 * dt);
    _a.subVectors(jugador.pos, mi.pos).normalize(); const ang = mi.dir.angleTo(_a), max = 1.25 * dt;
    if (ang > 1e-4) mi.dir.lerp(_a, Math.min(1, max / ang)).normalize();
    mi.pos.addScaledVector(mi.dir, mi.vel * dt); mi.m.lookAt(_b.copy(mi.pos).add(mi.dir));
    mi.humo -= dt; if (mi.humo <= 0) { mi.humo = 0.04; emitir(mi.pos, 0xb98cff, _pv.set(0, 0.5, 0), 0.6, 0.35, 1.2, 0, 0.6); }
    if (!jugador.muerto && mi.pos.distanceTo(jugador.pos) < 3.6) { danioJugador(15); explotarMisil(mi); continue; }
    if (mi.vida <= 0 || mi.pos.y < altura(mi.pos.x, mi.pos.z)) explotarMisil(mi);
  }
}
// ---- Premios: huesitos, cajas de cohetes y estrellas ----
const premios = [];
function crearPremio(tipo, pos) {
  const m = proto('premio_' + tipo, () => crearPremioModelo(tipo)).clone();
  m.position.copy(pos); escena.add(m);
  premios.push({ tipo, m, pos: m.position, base: pos.y, f: rand(0, 6) });
}
function actualizarPremios(dt) {
  for (let i = premios.length - 1; i >= 0; i--) {
    const p = premios[i]; p.f += dt; p.m.rotation.y += dt * 1.8; p.pos.y = p.base + Math.sin(p.f * 2) * 1.2;
    if (!jugador.muerto && p.pos.distanceTo(jugador.pos) < 8) {
      if (p.tipo === 'hueso') { jugador.vida = Math.min(100, jugador.vida + 25); Nucita.decir('¡Un huesito! ¡Ñam ñam!', 'hueso', 3); Nucita.celebrar = Math.max(Nucita.celebrar, 1.2); }
      else if (p.tipo === 'caja') { jugador.cohetes = Math.min(12, jugador.cohetes + 3); aviso('+3 cohetes 🚀', 1.2); }
      else { juego.puntos += 100; popup(p.pos, '+100 ⭐'); }
      Sonido.premio();
      for (let k = 0; k < 10; k++) emitir(p.pos, 0xfff27a, _pv.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(12), 0.5, 0.5, 0.1);
      escena.remove(p.m); premios.splice(i, 1);
    }
  }
}
// ---- Ladrido Sónico de Nucita ----
const onda = new THREE.Mesh(G.esfera, new THREE.MeshBasicMaterial({ color: 0xffe9f4, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
onda.visible = false; escena.add(onda); let tOnda = 0;
function ladridoSonico() {
  if (juego.estado !== 'jugando' || jugador.muerto || juego.intro > 0) return;
  if (jugador.carga < 1) { Nucita.decir('¡Aún no estoy lista!', 'noLista', 3, false); return; }
  jugador.carga = 0; tOnda = 0.7; onda.visible = true; onda.position.copy(jugador.pos);
  Sonido.ladrido(3); Sonido.ruido(0.8, 0.5, 300, 'lowpass', 60);
  Nucita.ladrar = 1.2; Nucita.decir('¡GUAU GUAU GUAU!', null, 0, false);
  for (const e of enemigos) {
    if (e.cayendo || e.pos.distanceTo(jugador.pos) > 170) continue;
    e.aturdido = e.jefe ? 1.5 : 3.5; e.ojos.forEach(o => o.material = matOjoAturdido);
  }
  for (const b of balasE) if (b.activa && b.pos.distanceTo(jugador.pos) < 170) soltar(b);
  for (let i = misiles.length - 1; i >= 0; i--) if (misiles[i].pos.distanceTo(jugador.pos) < 170) explotarMisil(misiles[i]);
}
function actualizarOnda(dt) {
  if (tOnda <= 0) return;
  tOnda -= dt; const k = 1 - tOnda / 0.7;
  onda.position.copy(jugador.pos); onda.scale.setScalar(4 + k * 165); onda.material.opacity = 0.45 * (1 - k);
  if (tOnda <= 0) onda.visible = false;
}
// ---- Portal del tiempo (fin del prólogo) ----
const portal = new THREE.Group();
const aroPortal = new THREE.Mesh(new THREE.TorusGeometry(18, 1.6, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
const aroPortal2 = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.6, 6, 40), new THREE.MeshBasicMaterial({ color: 0x5ff8ff }));
const discoPortal = new THREE.Mesh(new THREE.CircleGeometry(15.5, 32), new THREE.MeshBasicMaterial({ map: texPortal, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
portal.add(aroPortal, aroPortal2, discoPortal); portal.visible = false; escena.add(portal);
function abrirPortal() {
  juego.fase = 'portal';
  portal.position.copy(jugador.pos).addScaledVector(jugador.adelante, 320);
  portal.position.y = Math.max(jugador.pos.y, altura(portal.position.x, portal.position.z) + 70);
  portal.visible = true; Sonido.portal();
  aviso('¡Un portal del tiempo!', 2.5);
  Nucita.decir('¡Petunia escapó por el portal! ¡Entremos!', null, 0);
  globoJefe('¡Jijiji! ¡Nos vemos en 1741!');
}
function actualizarPortal(dt) {
  if (!portal.visible) return;
  portal.lookAt(jugador.pos);
  discoPortal.rotation.z += dt * 2.5; aroPortal.scale.setScalar(1 + Math.sin(tiempo * 4) * 0.04);
  if (cuadro % 3 === 0) { const an = rand(0, 6.28); _pa.set(Math.cos(an) * 18, Math.sin(an) * 18, 0); portal.localToWorld(_pa); emitir(_pa, elegir([0xff4fd8, 0x5ff8ff, 0xffffff]), _pv.set(rand(-4, 4), rand(-4, 4), rand(-4, 4)), 0.8, 0.8, 0.2); }
  if (juego.fase === 'portal' && !jugador.muerto && jugador.pos.distanceTo(portal.position) < 16) {
    juego.fase = 'fin'; juego.tFin = 0.9; Sonido.portal();
    $('tiempoFlash').style.opacity = 1; setTimeout(() => $('tiempoFlash').style.opacity = 0, 1300);
    Nucita.decir('¡Guaaau! ¡Viajamos en el tiempo!', null, 0);
  }
}

// =====================================================================
// 11. ENEMIGOS Y JEFES
// =====================================================================
const enemigos = [];
const DATOS_ENEMIGO = {
  basico: { ia: 'basico', vida: 3, vel: 40, giro: 1.3, radio: 3.4, puntos: 100 },
  rapido: { ia: 'rapido', vida: 3, vel: 58, giro: 2.0, radio: 3.1, puntos: 150 },
  kamikaze: { ia: 'kamikaze', vida: 2, vel: 70, giro: 2.4, radio: 3.1, puntos: 120 },
  galeon: { ia: 'barco', vida: 10, vel: 7, giro: 0, radio: 8.5, puntos: 250, bala: 'canon' },
  globo: { ia: 'globo', vida: 4, vel: 7, giro: 0.6, radio: 6.5, puntos: 150 },
  biplanoE: { ia: 'basico', vida: 3, vel: 36, giro: 1.2, radio: 3.8, puntos: 100 },
  hidroavion: { ia: 'rapido', vida: 3, vel: 48, giro: 1.6, radio: 3.8, puntos: 150 },
  jetE: { ia: 'basico', vida: 4, vel: 62, giro: 1.3, radio: 3.8, puntos: 120 },
  jetR: { ia: 'rapido', vida: 4, vel: 80, giro: 1.9, radio: 3.6, puntos: 170 },
  dron: { ia: 'kamikaze', vida: 2, vel: 60, giro: 2.6, radio: 2.8, puntos: 120 },
  robot: { ia: 'basico', vida: 4, vel: 50, giro: 1.8, radio: 3.0, puntos: 150, bala: 'laser' },
  ornitoptero: { ia: 'rapido', vida: 3, vel: 42, giro: 1.7, radio: 3.8, puntos: 140 },
  dirigible: { ia: 'basico', vida: 6, vel: 22, giro: 0.7, radio: 5.5, puntos: 180, bala: 'canon' },
  helicopteroChico: { ia: 'basico', vida: 5, vel: 34, giro: 1.1, radio: 4.5, puntos: 160 },
  robotJet: { ia: 'rapido', vida: 4, vel: 78, giro: 2.0, radio: 3.6, puntos: 180, bala: 'laser' }
};
const enParte = (o, raiz) => { for (let p = o; p && p !== raiz; p = p.parent) if (p.name.startsWith('p_')) return true; return false; };
function prepararEnemigo(m, pos, datos) {
  m.position.copy(pos); escena.add(m);
  const ojos = [], giran = [], mats = [], todos = [], aletean = [], chimeneas = []; let escudoMesh = null, llama = null;
  m.traverse(o => {
    if (o.userData.ojo) ojos.push(o);
    if (o.name === 'gira') giran.push({ obj: o, eje: 'z', vel: 30 });
    if (o.name === 'giraY') giran.push({ obj: o, eje: 'y', vel: 24 });
    if (o.name === 'giraX') giran.push({ obj: o, eje: 'x', vel: 30 });
    if (o.name === 'giraLento') giran.push({ obj: o, eje: 'y', vel: 0.8 });
    if (o.name === 'escudo') escudoMesh = o;
    if (o.name === 'llama') llama = o;
    if (o.name === 'aleteaI' || o.name === 'aleteaD') aletean.push({ obj: o, s: o.name === 'aleteaI' ? -1 : 1 });
    if (o.name === 'chimenea') chimeneas.push(o);
    // material propio para poder iluminarlo en blanco al recibir un disparo
    if (o.isMesh && (o.material.isMeshPhongMaterial || o.material.isMeshLambertMaterial) && !o.material.transparent) {
      o.material = o.material.clone(); todos.push(o.material); if (!enParte(o, m)) mats.push(o.material);
    }
  });
  const e = Object.assign({
    mesh: m, pos: m.position, dir: new THREE.Vector3().subVectors(jugador.pos, pos).setY(0).normalize(),
    cd: rand(1.5, 3.5), misilCd: rand(6, 10), aturdido: 0, cayendo: false, alabeo: 0, ojos, giran, mats, todos, escudoMesh, llama, aletean, chimeneas, tChim: 0,
    modo: 'formacion', tModo: rand(2, 5), formacion: new THREE.Vector3(rand(-40, 40), rand(-10, 20), rand(-40, 40)),
    humo: 0, jefe: false, velCaida: new THREE.Vector3(), giroCaida: 0, tCaida: 0, tFlash: 0, velActual: 0, bala: 'normal',
    ancla: pos.clone(), ang: rand(0, 6.28), f: rand(0, 6)
  }, datos);
  if (e.dir.lengthSq() < 0.5) e.dir.set(0, 0, 1);
  e.vidaMax = e.vida;
  enemigos.push(e); return e;
}
function aparecerEnemigo(tipo, pos, formacion) {
  const d = DATOS_ENEMIGO[tipo], dif = juego.dif;
  const e = prepararEnemigo(proto('enemigo_' + tipo, () => crearEnemigo(tipo)).clone(), pos, {
    tipo, ia: d.ia, vel: d.vel * (1 + dif * 0.08), giro: d.giro, vida: Math.ceil(d.vida * (1 + dif * 0.3)), radio: d.radio, puntos: d.puntos, bala: d.bala || 'normal'
  });
  if (formacion) e.formacion.copy(formacion);
  if (e.ia === 'barco') { e.altBarco = 1.5; e.radioGiro = rand(25, 55); e.ancla.y = 0; }
  if (e.ia === 'globo') e.radioGiro = rand(15, 35);
  return e;
}
// Busca un punto de mar cerca (para los barcos)
function puntoAgua(base, minD, maxD) {
  for (let i = 0; i < 80; i++) {
    const an = rand(0, 6.28), d = rand(minD, maxD), x = base.x + Math.cos(an) * d, z = base.z + Math.sin(an) * d;
    if (Math.hypot(x - juego.centro.x, z - juego.centro.z) > juego.limite - 80) continue;
    let ok = true; for (const [ox, oz] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]]) if (juego.fAltura(x + ox, z + oz) > -3) { ok = false; break; }
    if (ok) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(juego.centro.x + 420, 0, juego.centro.z);
}
function lanzarOleada(o) {
  const base = _a.copy(jugador.pos).addScaledVector(jugador.adelante, 380).clone();
  base.y = Math.max(jugador.pos.y, altura(base.x, base.z) + 60);
  let i = 0;
  for (const tipo in o) for (let k = 0; k < cantidadEnemigos(o[tipo]); k++, i++) {
    const ia = DATOS_ENEMIGO[tipo].ia;
    if (ia === 'barco') { aparecerEnemigo(tipo, puntoAgua(jugador.pos, 220, 520)); continue; }
    const p = base.clone().add(new THREE.Vector3(rand(-90, 90), rand(-15, 25), rand(-70, 70)));
    p.y = Math.max(p.y, altura(p.x, p.z) + (ia === 'globo' ? rand(55, 95) : 40));
    aparecerEnemigo(tipo, p, new THREE.Vector3((i % 3 - 1) * 18, (i % 2) * 6, Math.floor(i / 3) * 15));
  }
  Sonido.robot();
}
function aparecerJefe() {
  const J = NIVELES[juego.nivel].jefe;
  let pos;
  if (J.ia === 'barco') pos = puntoAgua(jugador.pos, 250, 450);
  else { pos = jugador.pos.clone().addScaledVector(jugador.adelante, 420); pos.y = Math.max(jugador.pos.y + 30, altura(pos.x, pos.z) + 80); }
  const e = prepararEnemigo(proto('jefe_' + J.tipo, () => crearModeloJefe(J.tipo)).clone(), pos, {
    tipo: 'jefe', ia: J.ia, jefe: true, vel: J.ia === 'barco' ? 6 : 40, giro: 0.9, vida: Math.round(J.vida * (modoDificil ? 1.4 : 1)), radio: J.ia === 'barco' ? 17 : (J.tipo === 'zepelin' || J.tipo === 'fortaleza' ? 13 : 11), puntos: 1000,
    cd: 2.5, misilCd: 6, escoltas: false, misiles: !!J.misiles, bala: J.bala, orbita: J.orbita || 160, alto: J.alto || 30, fase: 1, partes: [], escudo: false
  });
  if (J.ia === 'barco') { e.altBarco = 4; e.radioGiro = 60; e.ancla.y = 0; }
  if (J.ia === 'nave') { // partes que se destruyen por separado
    e.escudo = true;
    e.mesh.traverse(o => {
      if (o.name !== 'p_canon' && o.name !== 'p_ala') return;
      const ca = o.name === 'p_canon', mats = [];
      o.traverse(q => { if (q.isMesh && q.material.emissive) mats.push(q.material); });
      const p = {
        mesh: o, pos: new THREE.Vector3(), parte: true, padre: e, tipoParte: ca ? 'canon' : 'ala', vida: ca ? 22 : 30, radio: ca ? 4.5 : 7.5, puntos: 300,
        cayendo: false, ojos: [], giran: [], mats, todos: [], dir: e.dir, velActual: 0, cd: rand(1.5, 3), aturdido: 0, tFlash: 0
      };
      p.vidaMax = p.vida; o.getWorldPosition(p.pos);
      e.partes.push(p); enemigos.push(p);
    });
  }
  juego.jefe = e;
  $('jefeNombre').textContent = J.nombre; H.jefeCaja.classList.remove('oculto');
  aviso('¡Cuidado! ¡' + J.nombre + '!', 2.5); globoJefe(J.frases[0]);
  Nucita.decir(J.ia === 'nave' ? '¡Es Petunia! ¡Rompe los cañones y las alas!' : '¡Grrr! ¡Un jefe!', null, 0); Sonido.robot();
}
function flash(e, on) { for (const m of e.mats) m.emissive.setHex(on ? 0x777777 : 0x000000); }
function golpe(e, danio, donde) {
  if (e.escudo) {
    for (let k = 0; k < 3; k++) emitir(donde || e.pos, 0x5ff8ff, _pv.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(14), 0.3, 0.4, 0.05);
    if (cuadro % 4 === 0) Sonido.escudo();
    Nucita.decir('¡Tiene escudo! ¡Primero los cañones y las alas!', 'escudo', 7);
    return;
  }
  e.vida -= danio; e.tFlash = 0.07; flash(e, true);
  for (let k = 0; k < 5; k++) emitir(donde || e.pos, 0xfff2a8, _pv.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(16), 0.25, 0.35, 0.05, 10);
  marcarImpacto(false); Sonido.impacto();
  if (e.vida <= 0) derribar(e);
}
function revisarNave(B) {
  const vivos = B.partes.filter(p => p.vida > 0), canones = vivos.filter(p => p.tipoParte === 'canon');
  if (B.fase === 1 && canones.length === 0) { B.fase = 2; globoJefe('¡Mis cañones! ¡Alas, disparen misiles!'); }
  if (vivos.length === 0 && B.escudo) {
    B.fase = 3; B.escudo = false; if (B.escudoMesh) B.escudoMesh.visible = false;
    globoJefe('¡Sin escudo! ¡Robots, a mí!'); aviso('¡El escudo cayó! ¡Dispara al núcleo!', 2.5);
    Nucita.decir('¡Ahora sí! ¡Al núcleo rosado!', null, 0);
    for (let k = 0; k < 4; k++) aparecerEnemigo(k < 2 ? 'robot' : 'dron', B.pos.clone().add(new THREE.Vector3(rand(-40, 40), rand(-5, 15), rand(-40, 40))));
  }
}
function derribar(e) {
  if (e.cayendo) return;
  marcarImpacto(true);
  if (e.parte) { // una parte de la nave de Petunia
    e.cayendo = true; e.mesh.visible = false;
    explosion(e.pos, 1.8); escombros(e.pos, 1.5);
    juego.puntos += e.puntos; juego.derribados++; popup(e.pos, '+' + e.puntos);
    const i = enemigos.indexOf(e); if (i >= 0) enemigos.splice(i, 1);
    revisarNave(e.padre); return;
  }
  e.cayendo = true; e.tCaida = 0; e.velCaida.copy(e.dir).multiplyScalar(e.vel * 0.6);
  e.giroCaida = rand(2, 4) * (Math.random() < 0.5 ? 1 : -1);
  explosion(e.pos, e.jefe ? 2.5 : 1.1); escombros(e.pos, e.jefe ? 2 : 1);
  let pts = e.puntos;
  if (!e.jefe) { // combos: derribos seguidos dan más puntos
    juego.combo = juego.tCombo > 0 ? juego.combo + 1 : 1; juego.tCombo = 3.5;
    if (juego.combo >= 2) { pts = Math.round(pts * (1 + (juego.combo - 1) * 0.5)); aviso('¡Combo x' + juego.combo + '!', 1); }
  }
  juego.puntos += pts; juego.derribados++; popup(e.pos, '+' + pts);
  if (e.jefe) {
    juego.jefe = null; H.jefeCaja.classList.add('oculto');
    globoJefe(NIVELES[juego.nivel].jefe.frases[1]);
    Nucita.celebrar = 4.5; Nucita.decir('¡Guau guau! ¡Lo logramos!', null, 0);
    juego.fase = 'fin'; juego.tFin = 4.5;
    for (let k = 0; k < 3; k++) crearPremio(elegir(['estrella', 'hueso']), e.pos.clone().add(new THREE.Vector3(rand(-15, 15), 10, rand(-15, 15))).setY(Math.max(e.pos.y, 20) + 10));
  } else {
    if (Math.random() < 0.3) { const pp = e.pos.clone(); pp.y = Math.max(pp.y, altura(pp.x, pp.z) + 25); crearPremio(jugador.vida < 60 && Math.random() < 0.6 ? 'hueso' : elegir(['caja', 'estrella', 'hueso']), pp); }
    if (Math.random() < 0.25) Nucita.decir(elegir(['¡Guau! ¡Uno menos!', '¡Bien hecho!', '¡Toma eso, robot!']), 'derribo', 4);
  }
}
function quitarEnemigo(i) {
  const e = enemigos[i]; escena.remove(e.mesh); enemigos.splice(i, 1);
  for (const m of e.todos) m.dispose();
  if (e.partes) for (const p of e.partes) { const k = enemigos.indexOf(p); if (k >= 0) enemigos.splice(k, 1); }
}
const _eObj = new THREE.Vector3(), _eDes = new THREE.Vector3(), _eAnt = new THREE.Vector3(), _eTmp = new THREE.Vector3(), _ePrev = new THREE.Vector3();
function actualizarParte(e, dt) {
  e.mesh.getWorldPosition(e.pos);
  if (e.tFlash > 0) { e.tFlash -= dt; if (e.tFlash <= 0) flash(e, false); }
  if (e.aturdido > 0) { e.aturdido -= dt; return; }
  const dist = e.pos.distanceTo(jugador.pos);
  e.cd -= dt;
  if (e.cd <= 0 && dist < 380 && !jugador.muerto) {
    _eTmp.subVectors(jugador.pos, e.pos).normalize();
    if (e.tipoParte === 'canon') { for (let k = 0; k < 3; k++) dispararEnemigo(e.pos, _eTmp, 0.02 + k * 0.025, 'laser'); e.cd = rand(1.5, 2.3) / (1 + juego.dif * 0.15); }
    else { lanzarMisilEnemigo(e.pos, _eTmp); e.cd = rand(6, 9); }
  }
}
function actualizarEnemigos(dt) {
  const P = jugador.pos;
  for (let i = enemigos.length - 1; i >= 0; i--) {
    const e = enemigos[i];
    if (!e) continue;
    if (e.parte) { actualizarParte(e, dt); continue; }
    if (e.tFlash > 0) { e.tFlash -= dt; if (e.tFlash <= 0) flash(e, false); }
    for (const r of e.giran) r.obj.rotation[r.eje] += dt * r.vel;
    if (e.aletean.length) { const amp = e.jefe ? 0.32 : 0.7, vel = e.jefe ? 2.6 : 9; for (const w of e.aletean) w.obj.rotation.z = w.s * Math.sin(tiempo * vel + e.f) * amp * (e.cayendo ? 0.2 : 1); }
    if (e.chimeneas.length && !e.cayendo) { e.tChim -= dt; if (e.tChim <= 0) { e.tChim = 0.15; for (const ch of e.chimeneas) { ch.getWorldPosition(_eTmp); _eTmp.y += 3; emitir(_eTmp, 0x444444, _pv.set(rand(-1, 1), 4, rand(-1, 1)), 1.6, 1.2, 4, 0, 0.7); } } }
    if (e.llama) e.llama.scale.set(rand(0.3, 0.45), rand(0.7, 1.2), rand(0.3, 0.45));
    // --- derribado ---
    if (e.cayendo) {
      e.tCaida += dt;
      if (e.ia === 'barco') { // se hunde
        e.pos.y -= (e.jefe ? 1.4 : 1.8) * dt; e.mesh.rotateX(0.12 * dt); e.mesh.rotateZ(0.08 * dt);
        e.humo -= dt; if (e.humo <= 0) { e.humo = 0.06; humo(_eTmp.copy(e.pos).setY(Math.max(e.pos.y, 0) + 4), e.jefe ? 3 : 1.5); if (Math.random() < 0.06) explosion(_eTmp, 1, false); }
        if (e.tCaida > (e.jefe ? 9 : 7)) quitarEnemigo(i);
        continue;
      }
      if (e.ia === 'globo') { e.velCaida.y -= 8 * dt; e.mesh.scale.y = Math.max(0.3, e.mesh.scale.y - dt * 0.4); }
      else { e.velCaida.y -= 30 * dt; e.mesh.rotateZ(e.giroCaida * dt); e.mesh.rotateX(0.6 * dt); }
      e.pos.addScaledVector(e.velCaida, dt);
      e.humo -= dt; if (e.humo <= 0) { e.humo = e.jefe ? 0.02 : 0.04; humo(e.pos, e.jefe ? 3 : 1); if (e.jefe && Math.random() < 0.08) explosion(e.pos, 1.5); }
      if (e.pos.y < altura(e.pos.x, e.pos.z) + 1 || e.tCaida > 7) { explosion(e.pos, e.jefe ? 3.5 : 1.2); quitarEnemigo(i); }
      continue;
    }
    // humo cuando está dañado
    if (e.vida < e.vidaMax * 0.5) { e.humo -= dt; if (e.humo <= 0) { e.humo = 0.12; humo(e.pos, e.jefe ? 2 : 0.7); } }
    const dist = e.pos.distanceTo(P);
    _ePrev.copy(e.pos);
    if (e.aturdido > 0) { e.aturdido -= dt; if (e.aturdido <= 0) e.ojos.forEach(o => o.material = matOjo); }
    // --- barcos: navegan en círculos sobre el mar y disparan cañonazos ---
    if (e.ia === 'barco') {
      e.ang += dt * e.vel / e.radioGiro * (e.aturdido > 0 ? 0.3 : 1);
      e.pos.set(e.ancla.x + Math.cos(e.ang) * e.radioGiro, e.altBarco + Math.sin(tiempo * 1.2 + e.f) * 0.3, e.ancla.z + Math.sin(e.ang) * e.radioGiro);
      e.dir.set(-Math.sin(e.ang), 0, Math.cos(e.ang));
      e.mesh.lookAt(_eTmp.copy(e.pos).add(e.dir)); e.mesh.rotateZ(Math.sin(tiempo * 0.9 + e.f) * 0.05);
      e.velActual = e.vel;
      if (e.aturdido <= 0) {
        e.cd -= dt;
        if (e.cd <= 0 && dist < 340) {
          _eTmp.subVectors(P, e.pos).addScaledVector(jugador.adelante, jugador.vel * dist / 115 * 0.5).normalize();
          const n = e.jefe ? 5 : 2, ori = _eObj.copy(e.pos); ori.y += e.jefe ? 4 : 1.5;
          for (let k = 0; k < n; k++) dispararEnemigo(ori, _eTmp, 0.03 + k * 0.02, 'canon');
          e.cd = (e.jefe ? rand(2.0, 2.8) : rand(2.6, 3.8)) / (1 + juego.dif * 0.2);
        }
        if (e.jefe) revisarEscoltas(e);
      }
      continue;
    }
    // --- elegir hacia dónde volar ---
    if (e.aturdido > 0) {
      _eObj.copy(e.pos).addScaledVector(e.dir, 50); _eObj.x += Math.sin(tiempo * 5) * 10;
    } else if (e.ia === 'globo') {
      e.ang += dt * 0.25;
      _eObj.set(e.ancla.x + Math.cos(e.ang) * e.radioGiro, e.ancla.y + Math.sin(tiempo * 0.7 + e.f) * 6, e.ancla.z + Math.sin(e.ang) * e.radioGiro);
    } else if (e.ia === 'jefe' || e.ia === 'nave') {
      e.ang += dt * (e.ia === 'nave' ? 0.15 : 0.22);
      _eObj.set(P.x + Math.cos(e.ang) * e.orbita, P.y + e.alto + Math.sin(tiempo * 0.5) * 15, P.z + Math.sin(e.ang) * e.orbita);
    } else if (e.ia === 'basico') {
      e.tModo -= dt;
      if (e.tModo <= 0) { e.modo = e.modo === 'ataque' ? 'formacion' : 'ataque'; e.tModo = e.modo === 'ataque' ? rand(4, 7) : rand(3, 5); }
      if (e.modo === 'ataque') _eObj.copy(P); else _eObj.copy(juego.lider).add(e.formacion);
    } else if (e.ia === 'rapido') {
      _eObj.copy(P).addScaledVector(jugador.adelante, dist < 45 ? 10 : -30); _eObj.y += 4;
    } else { // kamikaze: apunta a donde estará el avión
      _eObj.copy(P).addScaledVector(jugador.adelante, jugador.vel * Math.min(dist / e.vel, 1.5));
    }
    const hS = altura(e.pos.x, e.pos.z);
    _eDes.subVectors(_eObj, e.pos).normalize();
    if (e.pos.y < hS + (e.jefe ? 50 : 28)) { _eDes.y = Math.max(_eDes.y, 0.6); _eDes.normalize(); }
    _eAnt.copy(e.dir);
    const ang = e.dir.angleTo(_eDes), max = e.giro * dt * (e.aturdido > 0 ? 0.3 : 1);
    if (ang > 1e-4) e.dir.lerp(_eDes, Math.min(1, max / ang)).normalize();
    let vel = e.vel; if (e.ia === 'rapido' && dist > 120) vel *= 1.3; if (e.aturdido > 0) vel *= 0.5;
    if (e.ia === 'globo') { e.pos.lerp(_eObj, 1 - Math.exp(-0.25 * dt)); e.dir.y = 0; if (e.dir.lengthSq() < 0.01) e.dir.set(0, 0, 1); e.dir.normalize(); }
    else e.pos.addScaledVector(e.dir, vel * dt);
    e.velActual = _ePrev.distanceTo(e.pos) / Math.max(dt, 1e-3);
    if (e.ia === 'globo') {
      _eTmp.subVectors(P, e.pos).setY(0).normalize();
      e.mesh.lookAt(_c.copy(e.pos).add(_eTmp)); e.mesh.rotateZ(Math.sin(tiempo * 0.8 + e.f) * 0.05);
    } else {
      const giroY = (_eAnt.z * e.dir.x - _eAnt.x * e.dir.z) / Math.max(dt, 1e-3);
      e.alabeo = lerp(e.alabeo, clamp(-giroY * 0.9, -1.1, 1.1), 1 - Math.exp(-4 * dt));
      e.mesh.lookAt(_eTmp.copy(e.pos).add(e.dir));
      e.mesh.rotateZ((e.ia === 'nave' || e.ia === 'jefe' ? e.alabeo * 0.3 : e.alabeo) + (e.aturdido > 0 ? Math.sin(tiempo * 12) * 0.5 : 0));
    }
    // --- disparar ---
    if (e.aturdido <= 0) {
      e.cd -= dt;
      _eTmp.subVectors(P, e.pos).divideScalar(Math.max(dist, 0.001));
      if (e.ia === 'jefe') {
        if (e.cd <= 0 && dist < 340) {
          const origen = _a.copy(e.pos).addScaledVector(e.dir, 12);
          for (let k = 0; k < 5; k++) dispararEnemigo(origen, _eTmp, 0.03 + k * 0.025, e.bala);
          e.cd = rand(1.6, 2.4) / (1 + juego.dif * 0.25);
        }
        if (e.misiles) { e.misilCd -= dt; if (e.misilCd <= 0 && dist < 420) { lanzarMisilEnemigo(e.pos, _eTmp); e.misilCd = rand(6, 9); } }
        revisarEscoltas(e);
      } else if (e.ia === 'nave') {
        if (e.fase === 3 && e.cd <= 0 && dist < 420) { // sin escudo: anillo de láseres + ráfaga
          for (let k = 0; k < 10; k++) { const an = k / 10 * PI * 2; dispararEnemigo(e.pos, _c.set(Math.cos(an), rand(-0.2, 0.2), Math.sin(an)).normalize(), 0, 'laser'); }
          for (let k = 0; k < 4; k++) dispararEnemigo(e.pos, _eTmp, 0.02 + k * 0.02, 'laser');
          e.cd = rand(2.2, 3);
        }
      } else if (e.ia === 'globo') {
        if (e.cd <= 0 && dist < 260) { dispararEnemigo(_c.copy(e.pos).setY(e.pos.y - 8), _eTmp, 0.06, 'normal'); e.cd = rand(1.6, 2.6) / (1 + juego.dif * 0.2); }
      } else if (e.ia !== 'kamikaze') {
        if (e.cd <= 0 && dist < 270 && e.dir.dot(_eTmp) > 0.93) { dispararEnemigo(e.pos, _eTmp, 0.05 / (1 + juego.dif * 0.5), e.bala); e.cd = rand(1.2, 2.2) / (1 + juego.dif * 0.25); }
        if (e.ia === 'rapido' && NIVELES[juego.nivel].misiles && juego.dif >= 1) { e.misilCd -= dt; if (e.misilCd <= 0 && dist < 300) { lanzarMisilEnemigo(e.pos, e.dir); e.misilCd = rand(9, 14); } }
      }
    }
    if (e.ia === 'kamikaze' && !jugador.muerto && dist < 5.5) { danioJugador(18); explosion(e.pos, 1.4); quitarEnemigo(i); continue; }
    if (e.pos.y < hS + 2) derribar(e);
  }
}
function revisarEscoltas(e) {
  if (e.escoltas || e.vida > e.vidaMax * 0.5) return;
  e.escoltas = true; globoJefe('¡Refuerzos, bip bop!');
  for (const t of NIVELES[juego.nivel].jefe.escoltas) {
    if (DATOS_ENEMIGO[t].ia === 'barco') aparecerEnemigo(t, puntoAgua(e.pos, 60, 200));
    else { const p = e.pos.clone().add(new THREE.Vector3(rand(-30, 30), rand(10, 25), rand(-30, 30))); p.y = Math.max(p.y, altura(p.x, p.z) + 50); aparecerEnemigo(t, p); }
  }
}
// Control de oleadas, del jefe y del portal
function actualizarOleadas(dt) {
  const N = NIVELES[juego.nivel], P = jugador.pos;
  const a = tiempo * 0.22;
  juego.lider.set(P.x + Math.cos(a) * 170, 0, P.z + Math.sin(a) * 170);
  juego.lider.y = Math.max(P.y + 20, altura(juego.lider.x, juego.lider.z) + 50);
  juego.tCombo -= dt;
  const vivos = enemigos.filter(e => !e.cayendo).length;
  if (juego.fase === 'oleadas' && vivos === 0) {
    juego.tOleada -= dt;
    if (juego.tOleada <= 0) {
      juego.oleada++;
      if (juego.oleada < N.oleadas.length) {
        lanzarOleada(N.oleadas[juego.oleada]);
        aviso(`¡Oleada ${juego.oleada + 1} de ${N.oleadas.length}!`, 2);
        setT(H.ole, `Oleada ${juego.oleada + 1} de ${N.oleadas.length}`);
        Nucita.decir(N.oleadas[juego.oleada].galeon ? '¡Barcos piratas en el mar!' : '¡Guau! ¡Robots a la vista!', null, 0);
        if (juego.oleada > 0 && N.burlas) setTimeout(() => { if (juego.estado === 'jugando') globoJefe(N.burlas[(juego.oleada - 1) % N.burlas.length]); }, 2200);
        juego.tOleada = 3;
      } else if (N.portal) { setT(H.ole, '¡Al portal!'); abrirPortal(); }
      else { juego.fase = 'jefe'; setT(H.ole, '¡Jefe!'); aparecerJefe(); }
    }
  } else if (juego.fase === 'fin') {
    juego.tFin -= dt; if (juego.tFin <= 0) nivelCompletado();
  }
}
function contarFaltan() {
  const N = NIVELES[juego.nivel]; let n = enemigos.filter(e => !e.cayendo).length;
  for (let k = juego.oleada + 1; k < N.oleadas.length; k++) for (const t in N.oleadas[k]) n += cantidadEnemigos(N.oleadas[k][t]);
  if (juego.fase === 'oleadas' && N.jefe) n += 1;
  return n;
}

// =====================================================================
// 12. NUCITA, LA COPILOTO
// =====================================================================
const Nucita = {
  globo: $('globoNucita'), tGlobo: 0, cds: {}, ladrar: 0, celebrar: 0, asustada: false, tSusto: 0,
  decir(txt, clave, cd = 5, ladrar = true) {
    if (clave) { if ((this.cds[clave] || 0) > tiempo) return; this.cds[clave] = tiempo + cd; }
    this.globo.textContent = txt; this.tGlobo = 2.6;
    if (ladrar) { Sonido.ladrido(2); this.ladrar = Math.max(this.ladrar, 0.6); }
  },
  asustar() { this.tSusto = 2; },
  actualizar(dt) {
    this.ladrar -= dt; this.celebrar -= dt; this.tSusto -= dt;
    this.asustada = juego.estado === 'jugando' && (jugador.vida < 30 || this.tSusto > 0);
    this.tGlobo -= dt;
    if (this.tGlobo > 0 && juego.estado === 'jugando') {
      nucita.userData.cab.getWorldPosition(_cv); _cv.y += 0.6; _cv.project(camara);
      if (_cv.z < 1) {
        this.globo.style.left = clamp((_cv.x * 0.5 + 0.5) * innerWidth, 90, innerWidth - 90) + 'px';
        this.globo.style.top = clamp((-_cv.y * 0.5 + 0.5) * innerHeight, 70, innerHeight - 30) + 'px';
        this.globo.style.opacity = 1;
      } else this.globo.style.opacity = 0;
    } else this.globo.style.opacity = 0;
  },
  vigilar() { // avisos automáticos
    if (jugador.muerto) return;
    if (jugador.vida < 30) this.decir('¡Poca vida!', 'vida', 10);
    for (const e of enemigos) {
      if (e.cayendo || e.parte || e.ia === 'barco') continue;
      _a.subVectors(e.pos, jugador.pos); const d = _a.length();
      if (d < 75 && _a.dot(jugador.adelante) / d < -0.6) { this.decir('¡Robot atrás!', 'atras', 7); break; }
    }
    for (const mi of misiles) if (mi.pos.distanceTo(jugador.pos) < 180) { this.decir('¡Misil!', 'misil', 5); Sonido.tono(880, 880, 0.1, 0.06); break; }
    if (juego.fase === 'portal') {
      _a.subVectors(portal.position, jugador.pos); const ang = angDif(Math.atan2(-_a.x, -_a.z), jugador.yaw);
      if (Math.abs(ang) > 0.5) this.decir(ang > 0 ? '¡El portal está a la izquierda!' : '¡El portal está a la derecha!', 'portal', 4);
    }
  }
};
function animarNucita(dt) {
  const u = nucita.userData, t = tiempo, N = Nucita;
  const viento = juego.estado === 'menu' ? 0.35 : clamp(jugador.vel / 55, 0.3, 1.5) * (avioneta.userData.cerrada ? 0.35 : 1);
  u.lengua.rotation.x = 0.15 + Math.sin(t * 10) * 0.18; u.lengua.scale.y = 1 + Math.sin(t * 10) * 0.12;
  let cx = 0, cy = Math.sin(t * 0.9) * 0.25, cz = Math.sin(t * 1.4) * 0.12;
  if (N.ladrar > 0) { cx = -Math.abs(Math.sin(t * 28)) * 0.28; cy = 0.5; }
  if (N.asustada) { cx = 0.25; cz = 0; }
  u.cab.rotation.set(lerp(u.cab.rotation.x, cx, 0.25), lerp(u.cab.rotation.y, cy, 0.1), cz);
  const oBase = N.asustada ? 0.8 : 0.12;
  u.orejas.forEach((o, i) => { const s = i ? 1 : -1; o.rotation.z = s * (oBase + Math.sin(t * 13 + i * 1.7) * 0.08 * viento); o.rotation.x = 0.25 * viento + Math.sin(t * 9 + i) * 0.05; });
  u.bufanda.forEach((sg, i) => {
    sg.rotation.y = Math.sin(t * 12 - i * 0.9) * 0.28 * viento + (i === 0 ? 0.5 : 0);
    sg.rotation.x = Math.sin(t * 9 - i * 1.1) * 0.16 * viento + (i === 0 ? -0.15 : 0);
  });
  u.cola.rotation.z = Math.sin(t * (N.celebrar > 0 ? 26 : 12)) * (N.asustada ? 0.1 : 0.55);
  if (N.celebrar > 0) { u.cuerpo.position.y = Math.abs(Math.sin(t * 9)) * 0.25; u.cuerpo.rotation.y += dt * 6; }
  else { u.cuerpo.position.y = 0; const r = Math.atan2(Math.sin(u.cuerpo.rotation.y), Math.cos(u.cuerpo.rotation.y)); u.cuerpo.rotation.y = lerp(r, 0, 0.1); }
  u.cuerpo.position.x = N.asustada ? Math.sin(t * 45) * 0.015 : 0;
}

// =====================================================================
// 13. HUD Y PANTALLAS
// =====================================================================
const H = {
  vida: $('bVida'), txtVida: $('txtVida'), coh: $('txtCohetes'), lad: $('bLadrido'), txtLad: $('txtLadrido'),
  cal: $('bCalor'), pts: $('txtPuntos'), falt: $('txtFaltan'), niv: $('txtNivel'), anio: $('txtAnio'), ole: $('txtOleada'),
  radar: $('radar'), jefeCaja: $('jefeCaja'), jefeBar: $('bJefe'), aviso: $('aviso'), tip: $('tip'),
  mira: $('mira'), impacto: $('impacto'), adelanto: $('adelanto'), fijado: $('fijado'), marcaPortal: $('marcaPortal'),
  globoJ: $('globoJefe'), tLadrido: $('tLadrido'), reloj: $('txtReloj')
};
function setT(el, v) { if (el._t !== v) { el._t = v; el.textContent = v; } }
function aviso(txt, dur = 2.2) { H.aviso.textContent = txt; H.aviso.style.opacity = 1; clearTimeout(aviso._t); aviso._t = setTimeout(() => H.aviso.style.opacity = 0, dur * 1000); }
function globoJefe(txt) { H.globoJ.textContent = '🌸🤖 ' + txt; H.globoJ.style.opacity = 1; clearTimeout(globoJefe._t); globoJefe._t = setTimeout(() => H.globoJ.style.opacity = 0, 3200); }
function marcarImpacto(mata) {
  H.impacto.classList.toggle('mata', mata); H.impacto.classList.add('ver');
  clearTimeout(marcarImpacto._t); marcarImpacto._t = setTimeout(() => H.impacto.classList.remove('ver', 'mata'), mata ? 260 : 110);
}
// Barritas de vida sobre los enemigos y puntos que flotan
const barras = [], pops = []; let idxPop = 0;
for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'hpE'; d.innerHTML = '<i></i>'; $('capaBarras').appendChild(d); barras.push(d); }
for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'pop'; $('capaPuntos').appendChild(d); pops.push(d); }
function popup(pos, txt) {
  _cv.copy(pos).project(camara); if (_cv.z > 1) return;
  const d = pops[idxPop]; idxPop = (idxPop + 1) % pops.length;
  d.textContent = txt; d.style.left = ((_cv.x * 0.5 + 0.5) * innerWidth) + 'px'; d.style.top = ((-_cv.y * 0.5 + 0.5) * innerHeight) + 'px';
  d.classList.remove('anim'); void d.offsetWidth; d.classList.add('anim');
}
const rctx = H.radar.getContext('2d');
function dibujarRadar() {
  const W = 104, c = W / 2, R = 48, esc = R / 500;
  rctx.clearRect(0, 0, W, W);
  rctx.strokeStyle = 'rgba(120,255,170,.35)'; rctx.lineWidth = 1;
  rctx.beginPath(); rctx.arc(c, c, R * 0.5, 0, 7); rctx.stroke();
  rctx.beginPath(); rctx.moveTo(c, 4); rctx.lineTo(c, W - 4); rctx.moveTo(4, c); rctx.lineTo(W - 4, c); rctx.stroke();
  const fy = jugador.yaw, fx = -Math.sin(fy), fz = -Math.cos(fy), rx = Math.cos(fy), rz = -Math.sin(fy);
  const punto = (x, z, col, tam) => {
    const dx = x - jugador.pos.x, dz = z - jugador.pos.z; let lx = (dx * rx + dz * rz) * esc, lf = (dx * fx + dz * fz) * esc;
    const d = Math.hypot(lx, lf); if (d > R) { lx *= R / d; lf *= R / d; }
    rctx.fillStyle = col; rctx.beginPath(); rctx.arc(c + lx, c - lf, tam, 0, 7); rctx.fill();
  };
  premios.forEach(p => punto(p.pos.x, p.pos.z, '#7dff9b', 2));
  misiles.forEach(m => punto(m.pos.x, m.pos.z, '#ffd23f', 2));
  enemigos.forEach(e => { if (!e.cayendo && !e.parte) punto(e.pos.x, e.pos.z, e.jefe ? '#ff3fa4' : (e.ia === 'barco' ? '#ff9f40' : '#ff4d4d'), e.jefe ? 5 : 3); });
  if (portal.visible) punto(portal.position.x, portal.position.z, '#5ff8ff', 5);
  rctx.fillStyle = '#fff'; rctx.beginPath(); rctx.moveTo(c, c - 6); rctx.lineTo(c - 4, c + 4); rctx.lineTo(c + 4, c + 4); rctx.fill();
}
function proyectar(pos, el) {
  _cv.copy(pos).project(camara);
  if (_cv.z < 1 && Math.abs(_cv.x) < 1.1 && Math.abs(_cv.y) < 1.1) {
    el.style.left = ((_cv.x * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((-_cv.y * 0.5 + 0.5) * innerHeight) + 'px'; return true;
  }
  return false;
}
// Coloca un elemento en pantalla deslizándolo suavemente hacia su lugar (para que la mira no tiemble)
function proyectarSuave(pos, el, st, k) {
  _cv.copy(pos).project(camara);
  if (!(_cv.z < 1 && Math.abs(_cv.x) < 1.1 && Math.abs(_cv.y) < 1.1)) { st.ok = false; return false; }
  const x = (_cv.x * 0.5 + 0.5) * innerWidth, y = (-_cv.y * 0.5 + 0.5) * innerHeight;
  if (st.ok) { st.x = lerp(st.x, x, k); st.y = lerp(st.y, y, k); } else { st.x = x; st.y = y; }
  st.ok = true; el.style.left = st.x + 'px'; el.style.top = st.y + 'px'; return true;
}
const stMira = { ok: false, x: 0, y: 0 }, stAdel = { ok: false, x: 0, y: 0, obj: null };
function actualizarHUD(dt) {
  const J = jugador, kS = 1 - Math.exp(-16 * dt);
  H.vida.style.width = J.vida + '%'; setT(H.txtVida, String(Math.ceil(J.vida)));
  setT(H.coh, String(J.cohetes));
  H.lad.style.width = (J.carga * 100) + '%'; setT(H.txtLad, J.carga >= 1 ? (ES_TACTIL ? '¡LISTO!' : '¡LISTO! Q') : '');
  H.cal.style.width = (J.calor * 100) + '%'; H.cal.style.opacity = J.sobrecalentado ? (Math.sin(tiempo * 20) > 0 ? 1 : 0.3) : 1;
  setT(H.reloj, '⏱ ' + fmtTiempo(reloj)); H.reloj.classList.toggle('urgente', reloj < 120);
  setT(H.pts, String(juego.puntos)); setT(H.falt, juego.fase === 'portal' ? '¡Portal!' : String(contarFaltan()));
  if (juego.jefe) {
    const B = juego.jefe; let v = Math.max(0, B.vida), m = B.vidaMax;
    for (const p of B.partes || []) { v += Math.max(0, p.vida); m += p.vidaMax; }
    H.jefeBar.style.width = (v / m * 100) + '%';
  }
  // mira: se pone roja cuando hay un enemigo justo enfrente
  const verMira = !J.muerto && proyectarSuave(_a.copy(J.pos).addScaledVector(J.adelante, 150), H.mira, stMira, kS);
  H.mira.style.display = verMira ? 'block' : 'none';
  if (verMira) { H.impacto.style.left = H.mira.style.left; H.impacto.style.top = H.mira.style.top; }
  const enfrente = buscarObjetivo(0.992, 460);
  H.mira.classList.toggle('enMira', !!enfrente);
  // rombo de adelanto: dónde apuntar para pegarle al enemigo que se mueve
  const objA = buscarObjetivo(0.9, 520);
  let verA = false;
  if (objA !== stAdel.obj) { stAdel.ok = false; stAdel.obj = objA; }
  if (objA) { const origen = _b.copy(J.pos); puntoAdelantado(objA, origen, J.av.balaVel + J.vel, _c); verA = proyectarSuave(_c, H.adelanto, stAdel, 1 - Math.exp(-12 * dt)); }
  H.adelanto.classList.toggle('oculto', !verA);
  const obj = J.cohetes > 0 ? buscarObjetivo(0.5, 700) : null;
  H.fijado.classList.toggle('oculto', !(obj && proyectar(obj.pos, H.fijado)));
  H.marcaPortal.classList.toggle('oculto', !(portal.visible && proyectar(portal.position, H.marcaPortal)));
  // barritas de vida de los enemigos cercanos
  const cerca = enemigos.filter(e => !e.cayendo && !e.jefe && e.pos.distanceTo(J.pos) < 380).sort((a, b) => a.pos.distanceToSquared(J.pos) - b.pos.distanceToSquared(J.pos));
  barras.forEach((d, i) => {
    const e = cerca[i]; let ver = false;
    if (e) { _d.copy(e.pos); _d.y += e.radio + 1; ver = proyectar(_d, d); if (ver) d.firstChild.style.width = (Math.max(0, e.vida) / e.vidaMax * 100) + '%'; }
    d.style.display = ver ? 'block' : 'none';
  });
  if (ES_TACTIL) { const p = J.carga * 100; H.tLadrido.style.background = `conic-gradient(rgba(255,143,200,.85) ${p}%, rgba(10,25,60,.55) ${p}%)`; }
  if (cuadro % 2 === 0) dibujarRadar();
}
function actualizarTutorial(dt) {
  if (!juego.tutorial.length) return;
  juego.tTut -= dt;
  if (juego.tTut <= 0) {
    H.tip.textContent = juego.tutorial.shift(); H.tip.style.opacity = 1; juego.tTut = 3.6;
    clearTimeout(actualizarTutorial._t); actualizarTutorial._t = setTimeout(() => H.tip.style.opacity = 0, 3300);
  }
}

// ---- Mapa de Colombia entre niveles ----
const COLOMBIA = [[-71.3, 12.4], [-72.3, 11.8], [-73.3, 11.3], [-74.2, 11.1], [-74.9, 11.0], [-75.5, 10.5], [-75.7, 9.6], [-76.2, 9.3], [-76.8, 8.6], [-77.4, 8.7], [-77.9, 7.3], [-77.4, 6.6], [-77.5, 5.6], [-77.3, 4.0], [-77.6, 3.2], [-78.6, 2.4], [-79.0, 1.6], [-78.2, 0.9], [-77.3, 0.7], [-76.3, 0.4], [-75.3, -0.1], [-74.3, -0.9], [-73.6, -1.3], [-72.9, -2.4], [-71.8, -2.2], [-70.3, -3.8], [-69.9, -4.2], [-69.6, -1.0], [-69.4, -0.6], [-70.0, 0.5], [-69.3, 1.0], [-68.2, 1.8], [-67.4, 2.2], [-67.8, 3.3], [-67.4, 4.0], [-67.6, 5.8], [-67.4, 6.2], [-69.0, 6.2], [-70.1, 6.9], [-71.0, 7.0], [-72.0, 7.4], [-72.4, 7.9], [-72.5, 8.6], [-72.8, 9.1], [-73.1, 9.3], [-73.0, 9.8], [-72.9, 10.4], [-72.3, 11.1], [-71.9, 11.6], [-71.3, 11.9]];
const cvMapa = $('canvasMapa'), mctx = cvMapa.getContext('2d');
const lonlat = (lon, lat) => [(lon + 80) / 13.5 * 300, (13.2 - lat) / 17.8 * 360];
function dibujarMapa(desde, hasta, k) {
  const W = 300, Hh = 360, x = mctx;
  const fondo = x.createLinearGradient(0, 0, 0, Hh); fondo.addColorStop(0, '#2a86c9'); fondo.addColorStop(1, '#165d94');
  x.fillStyle = fondo; x.fillRect(0, 0, W, Hh);
  x.beginPath(); COLOMBIA.forEach(([lo, la], i) => { const [px, py] = lonlat(lo, la); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath();
  x.fillStyle = '#6fbf5a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#fff3c4'; x.stroke();
  // ruta del viaje (hasta el nivel actual)
  x.setLineDash([6, 6]); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath();
  NIVELES.forEach((n, i) => { if (i > hasta) return; const [px, py] = lonlat(n.mapa[0], n.mapa[1]); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke(); x.setLineDash([]);
  x.font = 'bold 12px Trebuchet MS, sans-serif';
  const vistas = new Set();
  NIVELES.forEach((n, i) => {
    if (vistas.has(n.ciudad)) return; vistas.add(n.ciudad);
    const [px, py] = lonlat(n.mapa[0], n.mapa[1]), activa = NIVELES[hasta] && NIVELES[hasta].ciudad === n.ciudad;
    x.fillStyle = activa ? '#ff4fa0' : '#ffd166';
    x.beginPath(); x.arc(px, py, activa ? 7 : 5, 0, 7); x.fill(); x.lineWidth = 2; x.strokeStyle = '#222'; x.stroke();
    x.textAlign = n.etiqueta === 'right' ? 'right' : 'left'; const tx = px + (n.etiqueta === 'right' ? -10 : 10);
    x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(n.ciudad, tx, py + 4); x.fillStyle = '#fff'; x.fillText(n.ciudad, tx, py + 4);
  });
  // la avioneta avanzando
  const A = NIVELES[Math.max(desde, 0)].mapa, B = (NIVELES[hasta] || NIVELES[Math.max(desde, 0)]).mapa;
  const [ax, ay] = lonlat(A[0], A[1]), [bx, by] = lonlat(B[0], B[1]);
  const kk = desde < 0 ? 1 : k * k * (3 - 2 * k), px = lerp(ax, bx, kk), py = lerp(ay, by, kk) - Math.sin(kk * PI) * 18;
  const ang = (desde < 0 || (ax === bx && ay === by)) ? -PI / 2 : Math.atan2(by - ay, bx - ax);
  x.save(); x.translate(px, py - (ax === bx && ay === by ? 12 + Math.sin(k * PI * 4) * 4 : 0)); x.rotate(ang);
  x.fillStyle = '#ffc933'; x.strokeStyle = '#7a3b00'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(12, 0); x.lineTo(-8, -3); x.lineTo(-8, 3); x.closePath(); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(3, -11); x.lineTo(6, -11); x.lineTo(6, 11); x.lineTo(3, 11); x.closePath(); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(-6, -5); x.lineTo(-4, -5); x.lineTo(-4, 5); x.lineTo(-6, 5); x.closePath(); x.fill(); x.stroke();
  x.restore();
  // año grande en una esquina
  if (NIVELES[hasta]) { x.font = '900 34px Trebuchet MS, sans-serif'; x.textAlign = 'right'; x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeText(NIVELES[hasta].anio, W - 10, Hh - 14); x.fillStyle = '#ffd166'; x.fillText(NIVELES[hasta].anio, W - 10, Hh - 14); }
}
let mapaAnim = 0, mapaTimers = [];
function mostrarMapa(desde, hasta, alTerminar) {
  juego.estado = 'mapa'; mostrarPantalla('pMapa');
  const N = NIVELES[hasta];
  $('tituloMapa').textContent = `${N.ciudad} · ${N.anio}`;
  $('subMapa').textContent = `${N.titulo} — vuelas ${AVIONES[N.avion].nombre}`;
  $('lineaTiempo').innerHTML = NIVELES.map((n, i) => `<span class="${i < hasta ? 'hecho' : (i === hasta ? 'ahora' : '')}">${n.anio}</span>`).join('');
  const cont = $('lineas'); cont.innerHTML = '';
  mapaTimers.forEach(clearTimeout); mapaTimers = [];
  N.dialogo.forEach((l, i) => {
    const d = document.createElement('div'); const esN = l[0] === 'Nucita';
    d.className = 'linea ' + (esN ? 'nucita' : 'petunia');
    d.innerHTML = `<span class="quien">${esN ? '🐶 NUCITA' : '🌸🤖 PETUNIA'}</span>`; d.appendChild(document.createTextNode(l[1]));
    cont.appendChild(d);
    mapaTimers.push(setTimeout(() => { d.classList.add('ver'); if (esN) Sonido.ladrido(1); else Sonido.robot(); }, 600 + i * 1600));
  });
  const t0 = performance.now(); cancelAnimationFrame(mapaAnim);
  const paso = () => { const k = clamp((performance.now() - t0) / 3000, 0, 1); dibujarMapa(desde, hasta, k); if (k < 1 && juego.estado === 'mapa') mapaAnim = requestAnimationFrame(paso); };
  paso();
  $('btnVamos').onclick = () => {
    cancelAnimationFrame(mapaAnim); mapaTimers.forEach(clearTimeout);
    if (desde >= 0) { Sonido.portal(); $('tiempoFlash').style.opacity = 1; setTimeout(() => $('tiempoFlash').style.opacity = 0, 700); }
    alTerminar();
  };
}

// ---- Cambiar de pantalla ----
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('oculto', p.id !== id));
  $('hud').classList.toggle('oculto', id !== null);
  $('tactil').classList.toggle('oculto', !(id === null && ES_TACTIL));
}
function nivelAlcanzado() { return clamp(Guardado.get('nivel', 0), 0, NIVELES.length - 1); }
function guardarRecord() { if (juego.puntos > Guardado.get('record', 0)) Guardado.set('record', juego.puntos); }

function prepararMenu() {
  const av = Guardado.get('avatar', 'nina');
  $('avNina').classList.toggle('sel', av === 'nina'); $('avNino').classList.toggle('sel', av === 'nino');
  $('dfNormal').classList.toggle('sel', !modoDificil); $('dfDificil').classList.toggle('sel', modoDificil);
  const lista = $('listaNiveles'); lista.innerHTML = ''; const alc = nivelAlcanzado();
  NIVELES.forEach((n, i) => {
    const b = document.createElement('button'); b.innerHTML = `${i === 0 ? 'Prólogo' : i}. ${n.ciudad} <b>${n.anio}</b>${i > alc ? ' 🔒' : ''}`;
    b.disabled = i > alc; b.onclick = () => empezar(i); lista.appendChild(b);
  });
  const rec = Guardado.get('record', 0), mt = Guardado.get('mejorTiempo', 0);
  $('txtRecord').textContent = (rec ? `🏆 Mejor puntaje: ${rec}` : '') + (mt ? ` · ⚡ Mejor tiempo: ${fmtTiempo(mt)}` : '');
  $('txtTiempoMenu').textContent = `⏱ Tiempo para salvar la historia: ${fmtTiempo(reloj)} de 20:00`;
  $('btnJugar').textContent = alc > 0 ? `¡A volar! (${NIVELES[alc].ciudad} ${NIVELES[alc].anio}) ✈️` : '¡A volar! ✈️';
}
const cacheEscenarios = {}; let grupoNivel = null;
function montarEscenario(i) {
  const N = NIVELES[i], E = ESCENARIOS[N.escenario];
  if (grupoNivel) {
    escena.remove(grupoNivel);
    // el escenario anterior se libera (menos el de Cúcuta 2030, que usa el menú)
    for (const k in cacheEscenarios) if (cacheEscenarios[k] === grupoNivel && k !== N.escenario && k !== 'cucuta2030') { liberarEscenario(grupoNivel); delete cacheEscenarios[k]; }
  }
  if (!cacheEscenarios[N.escenario]) { alturaEnObra = E.altura; cacheEscenarios[N.escenario] = E.construir(); }
  grupoNivel = cacheEscenarios[N.escenario]; escena.add(grupoNivel);
  pintarCielo(N.cielo[0], N.cielo[1]);
  escena.fog.color.setHex(N.niebla); escena.fog.near = N.nieblaRango[0]; escena.fog.far = N.nieblaRango[1];
  luzCielo.intensity = N.luz[0]; sol.intensity = N.luz[1];
  encenderVentanas(!!N.noche); matPajaro.color.setHex(N.pajaros || 0x2a2a2a);
  juego.fAltura = E.altura; juego.solidos = grupoNivel.userData.solidos || (() => -1e9); juego.agua = N.agua; juego.centro.set(N.centro[0], 0, N.centro[1]); juego.limite = N.limite;
}
function limpiarNivel() {
  while (enemigos.length) quitarEnemigo(enemigos.length - 1);
  cohetes.forEach(c => escena.remove(c.m)); cohetes.length = 0;
  misiles.forEach(m => escena.remove(m.m)); misiles.length = 0;
  premios.forEach(p => escena.remove(p.m)); premios.length = 0;
  balasJ.forEach(soltar); balasE.forEach(soltar);
  particulas.forEach(p => { p.vida = 0; p.m.visible = false; });
  tOnda = 0; onda.visible = false; juego.jefe = null; portal.visible = false;
  H.jefeCaja.classList.add('oculto'); H.tip.style.opacity = 0; H.globoJ.style.opacity = 0;
  barras.forEach(d => d.style.display = 'none');
}
function estacionarAvioneta() {
  Object.assign(jugador, { yaw: 0, pitch: 0, roll: 0, vel: 0, muerto: false, entrada: { x: 0, y: 0 } });
  jugador.pos.set(0, 1.8, 22); aplicarOrientacion(); avioneta.visible = true;
}
function irAlMenu() {
  sala.visible = false; limpiarNivel(); montarEscenario(0); ponerAvion(2030); estacionarAvioneta();
  juego.estado = 'menu'; mostrarPantalla('pInicio'); prepararMenu(); Sonido.motor(0, false);
  Nucita.celebrar = 0; Nucita.tSusto = 0; camara.fov = 65;
  ajustarVista();
}
function cargarNivel(i) {
  limpiarNivel(); juego.nivel = i; const N = NIVELES[i]; juego.dif = N.dif + (modoDificil ? 0.8 : 0); montarEscenario(i); ponerAvion(N.avion);
  const AV = jugador.av;
  Object.assign(jugador, {
    vida: 100, cohetes: 6, calor: 0, sobrecalentado: false, carga: 0.5, invul: 0, cdBala: 0, cdCohete: 0,
    muerto: false, vel: N.despegue ? 0 : AV.vel, velObj: AV.vel, pitch: 0, roll: 0, entrada: { x: 0, y: 0 },
    yaw: N.despegue ? 0 : Math.atan2(-(juego.centro.x - N.inicio.x), -(juego.centro.z - N.inicio.z))
  });
  jugador.pos.set(N.inicio.x, N.inicio.y, N.inicio.z); aplicarOrientacion(); avioneta.visible = true;
  juego.intro = N.despegue ? 3.6 : 0; juego.fase = 'oleadas'; juego.oleada = -1; juego.tOleada = N.despegue ? 9 : 3;
  juego.derribados = 0; juego.temblor = 0; juego.combo = 0; juego.tCombo = 0;
  setT(H.niv, N.ciudad + (modoDificil ? ' · 😈' : '')); setT(H.anio, String(N.anio)); setT(H.ole, '¡Prepárate!');
  srand(i * 99 + 5);
  for (let k = 0; k < 12; k++) {
    const a = rr(0, 6.28), r = rr(80, 600), x = juego.centro.x + Math.cos(a) * r, z = juego.centro.z + Math.sin(a) * r;
    crearPremio(elegirR(['hueso', 'caja', 'estrella', 'estrella']), new THREE.Vector3(x, altura(x, z) + rr(30, 90), z));
  }
  juego.tutorial = i === 0 ? (ES_TACTIL ? TUT_TACTIL : TUT_PC).slice() : []; juego.tTut = 1;
  Nucita.cds = {}; Nucita.celebrar = 0; Nucita.tSusto = 0;
  if (piloto) piloto.visible = juego.camaraModo !== 'dentro';
  aviso(`${N.ciudad} · ${N.anio}`, 2.6); calibrarGiro();
  actualizarCamara(1); camara.position.copy(_cv);
}
function iniciarNivel(i) {
  cargarNivel(i); juego.puntosInicio = juego.puntos;
  juego.estado = 'jugando'; mostrarPantalla(null); ajustarVista();
  if (i > 0) setTimeout(() => { if (juego.estado === 'jugando') Nucita.decir('¡' + nombrePiloto() + ', ahora volamos ' + AVIONES[NIVELES[i].avion].nombre + '!', null, 0); }, 1500);
}
function empezar(i) {
  Sonido.iniciar(); pantallaCompleta(); juego.puntos = 0;
  mostrarMapa(i === 0 ? -1 : i - 1, i, () => iniciarNivel(i));
}
function pausar() {
  if (juego.estado !== 'jugando') return;
  juego.estado = 'pausa'; mostrarPantalla('pPausa'); Sonido.motor(0, false); guardarReloj();
  tactil.fuego = tactil.acel = false; raton.izq = false;
}
function reanudar() { if (juego.estado !== 'pausa') return; juego.estado = 'jugando'; mostrarPantalla(null); }
function nivelCompletado() {
  Sonido.motor(0, false); guardarReloj();
  Guardado.set('nivel', Math.max(Guardado.get('nivel', 0), Math.min(juego.nivel + 1, NIVELES.length - 1))); guardarRecord();
  if (juego.nivel === NIVELES.length - 1) { mostrarFinal(); return; }
  juego.estado = 'nivelOk';
  const N = NIVELES[juego.nivel], sig = NIVELES[juego.nivel + 1];
  $('tituloNivelOk').textContent = N.portal ? '¡Entraste al portal!' : '¡Misión cumplida!';
  $('resNivel').innerHTML = (N.portal ? `Petunia huyó al pasado. ¡Rumbo a ${sig.ciudad} en ${sig.anio}! 🌀` : `${N.ciudad} ${N.anio} está a salvo 🎉. Petunia escapó a ${sig.ciudad} ${sig.anio}.`) +
    `<br>🤖 Derribos: <b>${juego.derribados}</b> · ⭐ Puntos: <b>${juego.puntos}</b> · ⏱ Quedan: <b>${fmtTiempo(reloj)}</b>` +
    `<div class="dato">💡 <b>¿Sabías que...?</b> ${N.dato}</div><div class="dato nuc">🐶 Nucita: ${N.final}</div>`;
  mostrarPantalla('pNivel');
}
function gameOver() {
  juego.estado = 'gameover'; guardarRecord(); guardarReloj();
  $('resGO').textContent = `⭐ Puntos: ${juego.puntos}`; mostrarPantalla('pGameOver');
}
function mostrarFinal() {
  juego.estado = 'final'; guardarRecord();
  const usado = TIEMPO_TOTAL - reloj, mt = Guardado.get('mejorTiempo', 0);
  if (!mt || usado < mt) Guardado.set('mejorTiempo', usado);
  reloj = TIEMPO_TOTAL; guardarReloj();
  $('finTitulo').textContent = '¡Colombia está a salvo!';
  $('finTexto').innerHTML = `Nucita y ${nombrePiloto()} persiguieron a Petunia desde 1741 hasta 2030 y derrotaron a su equipo de robots sobre Cúcuta. 🐶✈️<br>La historia de Colombia quedó como debía ser.<br>⭐ Puntos: <b>${juego.puntos}</b> · ⏱ Tiempo: <b>${fmtTiempo(usado)}</b>`;
  mostrarPantalla('pFinal');
}
function pantallaCompleta() {
  if (!ES_TACTIL) return; const d = document.documentElement;
  try {
    const r = (d.requestFullscreen || d.webkitRequestFullscreen || function () { }).call(d);
    if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { });
  } catch (e) { }
}
// Vista del menú: el avión se ve a la derecha del panel
function ajustarVista() {
  renderer.setSize(innerWidth, innerHeight); camara.aspect = innerWidth / innerHeight;
  if (juego.estado === 'menu') camara.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
  else camara.clearViewOffset();
  camara.updateProjectionMatrix();
  $('girar').classList.toggle('oculto', !(ES_TACTIL && innerHeight > innerWidth));
}
window.addEventListener('resize', ajustarVista);

// ---- Sala del hangar: una plataforma flotando en el cielo con un gran reloj del tiempo ----
const sala = new THREE.Group(); sala.position.set(0, 420, 5000); sala.visible = false; escena.add(sala);
parte(G.cil, 0x23283a, [0, -2.6, 0], [11, 0.6, 11], sala);
parte(new THREE.TorusGeometry(11, 0.18, 6, 48), matB(0x5ff8ff), [0, -2.3, 0], null, sala, [PI / 2, 0, 0]);
parte(new THREE.TorusGeometry(13, 0.12, 6, 48), matB(0xff4fd8), [0, -2.9, 0], null, sala, [PI / 2, 0, 0]);
const relojSala = grupo(sala, [0, 6, -22]);
parte(new THREE.TorusGeometry(14, 0.5, 8, 48), matB(0xffd166), [0, 0, 0], null, relojSala);
for (let k = 0; k < 12; k++) { const a = k / 12 * PI * 2; parte(G.caja, matB(0xffd166), [Math.cos(a) * 12, Math.sin(a) * 12, 0], [0.5, 1.6, 0.3], relojSala, [0, 0, a - PI / 2]); }
const manecillas = [grupo(relojSala), grupo(relojSala)];
parte(G.caja, matB(0xffffff), [0, 4.5, 0.3], [0.5, 9, 0.2], manecillas[0]); parte(G.caja, matB(0xffffff), [0, 3, 0.4], [0.7, 6, 0.2], manecillas[1]);
function ponerCieloSala() { pintarCielo(0x120a35, 0x7a3fa0); escena.fog.color.setHex(0x3a2060); escena.fog.near = 300; escena.fog.far = 2500; luzCielo.intensity = 0.95; sol.intensity = 0.9; }
function mostrarAvionSala(ep) {
  ponerAvion(ep); jugador.pos.copy(sala.position); jugador.pitch = 0; jugador.roll = 0; jugador.vel = 0; avioneta.visible = true; aplicarOrientacion();
}
function girarSala(dt) {
  jugador.yaw += dt * 0.5; aplicarOrientacion();
  manecillas[0].rotation.z -= dt * 1.2; manecillas[1].rotation.z -= dt * 0.1;
  camara.position.set(sala.position.x + 6, sala.position.y + 2.6, sala.position.z + 9);
  camara.lookAt(sala.position.x, sala.position.y - 1.6, sala.position.z);
}
// ---- Hangar del tiempo: ver los aviones de cada época ----
let hgIdx = 0;
function abrirHangar() {
  Sonido.iniciar(); limpiarNivel(); juego.estado = 'hangar'; sala.visible = true; ponerCieloSala();
  camara.clearViewOffset(); camara.fov = 55; camara.updateProjectionMatrix();
  mostrarPantalla('pHangar'); verHangar(0);
}
function verHangar(i) {
  hgIdx = (i + EPOCAS.length) % EPOCAS.length; const ep = EPOCAS[hgIdx], AV = AVIONES[ep];
  mostrarAvionSala(ep);
  $('hgNombre').textContent = AV.corto; $('hgAnio').textContent = 'Año ' + ep + ` · ${hgIdx + 1} de ${EPOCAS.length}`; $('hgDesc').textContent = AV.desc;
  $('hgDonde').textContent = 'Lo vuelas en: ' + NIVELES.filter(n => n.avion === ep).map(n => `${n.ciudad} ${n.anio}`).join(' y ');
  Sonido.tono(500, 900, 0.12, 0.08, 'triangle');
}

// ---- Intro de cine ----
const intro = { i: -1, t: 0, nave: null, flor: null, robots: [], ini: [], textoT: 0, despues: null, hIdx: -1 };
function textoIntro(txt) {
  const el = $('introTexto'); clearInterval(intro.textoT); el.textContent = ''; let k = 0;
  intro.textoT = setInterval(() => { k += 2; el.textContent = txt.slice(0, k); if (k >= txt.length) clearInterval(intro.textoT); }, 40);
}
const PORTAL_INTRO = new THREE.Vector3(-60, 130, -330), NAVE_A = new THREE.Vector3(520, 150, -520), NAVE_B = new THREE.Vector3(60, 120, -120);
const _iA = new THREE.Vector3();
const ESCENAS_INTRO = [
  { dur: 6, txt: 'Año 2030. Cúcuta, la ciudad de los árboles, duerme tranquila...',
    ini() { intro.nave.visible = false; intro.robots.forEach(r => r.visible = false); portal.visible = false; },
    cam(t, k) { camara.position.set(lerp(-380, -140, k), lerp(150, 85, k), lerp(380, 160, k)); camara.lookAt(0, 15, 0); } },
  { dur: 6.5, txt: 'Pero en el cielo apareció Petunia: una máquina malvada con un ejército de robots voladores.',
    ini() { intro.nave.visible = true; Sonido.robot(); Sonido.explosion(true); },
    cam(t, k) { intro.nave.position.lerpVectors(NAVE_A, NAVE_B, suave(0, 1, k)); intro.nave.lookAt(NAVE_B.x, NAVE_B.y, NAVE_B.z + (k > 0.98 ? 0 : 0)); camara.position.set(40, 55, 170); camara.lookAt(intro.nave.position); } },
  { dur: 7, txt: '¡Petunia se robó una máquina del tiempo! Quiere viajar al pasado y cambiar la historia de Colombia.',
    ini() {
      portal.visible = true; portal.position.copy(PORTAL_INTRO); portal.lookAt(70, 90, 80); Sonido.portal();
      intro.ini = intro.robots.map((r, i) => { r.visible = true; return NAVE_B.clone().add(new THREE.Vector3(rand(-30, 30), rand(-15, 15), rand(10, 40))); });
    },
    cam(t, k) {
      const kn = suave(0, 0.6, k); intro.nave.position.lerpVectors(NAVE_B, PORTAL_INTRO, kn); intro.nave.lookAt(PORTAL_INTRO); intro.nave.visible = kn < 0.97;
      intro.robots.forEach((r, i) => { const kk = clamp((k - 0.15 - i * 0.08) / 0.55, 0, 1); r.position.lerpVectors(intro.ini[i], PORTAL_INTRO, kk); r.lookAt(PORTAL_INTRO); r.visible = kk < 0.97; });
      camara.position.set(70, 90, 80); camara.lookAt(-30, 125, -230);
    } },
  { dur: 6.5, txt: 'En un patio de Cúcuta, alguien lo vio todo: Nucita, una perrita blanca muy valiente.',
    ini() { portal.visible = false; intro.nave.visible = false; intro.robots.forEach(r => r.visible = false); Nucita.ladrar = 1.5; Sonido.ladrido(3); },
    cam(t, k) { _iA.copy(jugador.pos).add(new THREE.Vector3(0.45, 1.1, -0.1)); const a = 0.3 + k * 0.6; camara.position.set(_iA.x + Math.sin(a) * 3.3, _iA.y + 0.9, _iA.z - Math.cos(a) * 3.3); camara.lookAt(_iA); } },
  { dur: 5.5, txt: '¡Guau! Nucita tiene un plan: la avioneta del patio también tiene una máquina del tiempo.',
    ini() { Nucita.celebrar = 3; Sonido.ladrido(2); },
    cam(t, k) { camara.position.set(lerp(-12, -5, k), lerp(7, 4, k), lerp(40, 30, k)); camara.lookAt(jugador.pos.x, jugador.pos.y + 1, jugador.pos.z); } },
  { dur: EPOCAS.length * 2.1, txt: 'En cada época, la máquina convierte el avión en uno de ese año:',
    ini() { sala.visible = true; ponerCieloSala(); intro.hIdx = -1; $('introAvion').classList.remove('oculto'); },
    cam(t, k, dt) {
      const idx = Math.min(EPOCAS.length - 1, Math.floor(t / 2.1));
      if (idx !== intro.hIdx) { intro.hIdx = idx; const ep = EPOCAS[idx]; mostrarAvionSala(ep); $('introAvionNombre').textContent = AVIONES[ep].corto; $('introAvionAnio').textContent = ep; Sonido.tono(500, 900, 0.12, 0.08, 'triangle'); }
      girarSala(dt);
    } },
  { dur: 7.5, txt: 'Tienes 20 minutos para alcanzar a Petunia en todas las épocas. Si el tiempo se acaba, la historia cambia... ¡y hay que empezar de nuevo!',
    ini() { sala.visible = false; $('introAvion').classList.add('oculto'); montarEscenario(7); ponerAvion(2030); estacionarAvioneta(); Sonido.jet = true; Sonido.motor(40, true); },
    cam(t, k) { camara.position.set(lerp(7, 4, k), lerp(3.5, 2.6, k), jugador.pos.z - lerp(9, 13, k)); camara.lookAt(jugador.pos.x, jugador.pos.y + 1, jugador.pos.z); } }
];
function empezarIntro(despues) {
  Sonido.iniciar(); pantallaCompleta();
  limpiarNivel(); montarEscenario(7); ponerAvion(2030); estacionarAvioneta();
  if (!intro.nave) {
    intro.nave = crearModeloJefe('naveP');
    intro.nave.traverse(o => { if (o.name === 'escudo') o.visible = false; if (o.name === 'giraLento') intro.flor = o; });
    for (let k = 0; k < 6; k++) intro.robots.push(proto('enemigo_robot', () => crearEnemigo('robot')).clone());
  }
  escena.add(intro.nave); intro.robots.forEach(r => escena.add(r));
  juego.estado = 'intro'; mostrarPantalla('pIntro'); $('introAvion').classList.add('oculto');
  camara.clearViewOffset(); camara.fov = 60; camara.updateProjectionMatrix();
  intro.despues = despues; intro.i = -1; intro.t = 0; siguienteEscena();
}
function siguienteEscena() {
  intro.i++; intro.t = 0;
  if (intro.i >= ESCENAS_INTRO.length) { finIntro(); return; }
  const E = ESCENAS_INTRO[intro.i]; E.ini(); textoIntro(E.txt);
}
function actualizarIntro(dt) {
  const E = ESCENAS_INTRO[intro.i]; if (!E) return;
  intro.t += dt; const k = clamp(intro.t / E.dur, 0, 1);
  if (intro.flor) intro.flor.rotation.y += dt * 0.8;
  if (portal.visible) { discoPortal.rotation.z += dt * 2.5; aroPortal.scale.setScalar(1 + Math.sin(tiempo * 4) * 0.04); }
  E.cam(intro.t, k, dt);
  if (intro.t >= E.dur) siguienteEscena();
}
function finIntro() {
  if (juego.estado !== 'intro') return;
  clearInterval(intro.textoT); Guardado.set('introVista', true);
  escena.remove(intro.nave); intro.robots.forEach(r => escena.remove(r)); portal.visible = false; sala.visible = false;
  $('introAvion').classList.add('oculto'); Sonido.motor(0, false);
  juego.estado = 'menu';
  const d = intro.despues; intro.despues = null; if (d) d(); else irAlMenu();
}

// ---- Botones ----
function elegirAvatar(tipo) { Guardado.set('avatar', tipo); ponerPiloto(tipo); prepararMenu(); Sonido.iniciar(); Sonido.ladrido(1); Nucita.ladrar = 0.6; verPiloto = 3; }
let verPiloto = 0;
$('avNina').onclick = () => elegirAvatar('nina');
$('avNino').onclick = () => elegirAvatar('nino');
function elegirModo(d) { modoDificil = d; Guardado.set('dificil', d); prepararMenu(); Sonido.iniciar(); if (d) Sonido.robot(); else Sonido.ladrido(1); }
$('dfNormal').onclick = () => elegirModo(false);
$('dfDificil').onclick = () => elegirModo(true);
$('btnJugar').onclick = () => { const n = nivelAlcanzado(); if (n === 0 && !Guardado.get('introVista', false)) empezarIntro(() => empezar(0)); else empezar(n); };
$('btnIntro').onclick = () => empezarIntro(null);
$('btnHangar').onclick = abrirHangar;
$('btnSaltar').onclick = finIntro;
$('hgAnt').onclick = () => verHangar(hgIdx - 1);
$('hgSig').onclick = () => verHangar(hgIdx + 1);
$('hgVolver').onclick = irAlMenu;
$('btnControles').onclick = () => $('panelControles').classList.toggle('oculto');
$('panelControles').innerHTML = `<b>PC</b><br>W/S o ↑↓: subir y bajar · A/D o ←→: girar<br>Shift: acelerar · Ctrl o X: frenar<br>Espacio o clic izquierdo: disparar<br>E o clic derecho: cohete · Q: Ladrido Sónico<br>C: cambiar cámara · P o Esc: pausa<br>
<b>Celular</b> (en horizontal)<br>Joystick izquierdo: dirigir · 🔥 disparar · 🚀 cohete<br>🐶 ladrido · ⚡ acelerar · 🎥 cámara · o activa el giroscopio<br>
<b>Apuntar</b>: dispara al rombo verde 🔷, que marca dónde estará el enemigo`;
if (ES_TACTIL) { $('filaGiro').classList.remove('oculto'); $('chkGiro').checked = Guardado.get('giro', false); giro.activo = $('chkGiro').checked; }
$('chkGiro').onchange = e => activarGiro(e.target.checked);
if (!ES_TACTIL) { $('filaMouse').classList.remove('oculto'); $('chkMouse').checked = dirigirMouse; }
$('chkMouse').onchange = e => { dirigirMouse = e.target.checked; Guardado.set('mouse', dirigirMouse); };
$('btnEmpezarDeNuevo').onclick = irAlMenu;
$('btnContinuar').onclick = reanudar;
$('btnCalibrar').onclick = () => { calibrarGiro(); aviso('Giroscopio calibrado', 1.2); };
$('btnReiniciar').onclick = () => { juego.puntos = juego.puntosInicio; iniciarNivel(juego.nivel); };
$('btnReintentar').onclick = () => { juego.puntos = juego.puntosInicio; iniciarNivel(juego.nivel); };
['btnMenu1', 'btnMenu2', 'btnMenu3', 'btnMenu4'].forEach(id => $(id).onclick = irAlMenu);
$('btnSiguiente').onclick = () => { const sig = juego.nivel + 1; mostrarMapa(juego.nivel, sig, () => iniciarNivel(sig)); };

// =====================================================================
// 14. BUCLE PRINCIPAL
// =====================================================================
let tiempo = 0, cuadro = 0, ultimo = performance.now();
function actualizarMenu(dt) {
  const a = 0.35 + Math.sin(tiempo * 0.3) * 0.7, f = _a.set(jugador.pos.x + 0.35, jugador.pos.y + 1.1, jugador.pos.z - 0.2);
  _b.set(f.x + Math.sin(a) * 5.4, f.y + 2.0 + Math.sin(tiempo * 0.4) * 0.2, f.z - Math.cos(a) * 5.4);
  if (verPiloto > 0 && piloto) { // al elegir piloto, la cámara se acerca para verlo bien
    verPiloto -= dt; piloto.userData.cabeza.getWorldPosition(_c);
    _d.set(_c.x + 0.7, _c.y + 0.45, _c.z - 1.15); _c.y -= 0.1;
    const k = suave(0, 0.6, Math.min(verPiloto, 3 - verPiloto)); _b.lerp(_d, k); f.lerp(_c, k);
  }
  camara.position.copy(_b); camara.lookAt(f);
}
function actualizarJuego(dt) {
  actualizarJugador(dt);
  if (juego.estado !== 'jugando') return;
  actualizarOleadas(dt);
  if (juego.estado !== 'jugando') return;
  actualizarEnemigos(dt);
  actualizarBalas(dt);
  actualizarCohetes(dt);
  actualizarMisiles(dt);
  actualizarPremios(dt);
  actualizarOnda(dt);
  actualizarPortal(dt);
  if (cuadro % 10 === 0) Nucita.vigilar();
  actualizarTutorial(dt);
  actualizarCamara(dt);
  actualizarReloj(dt);
  if (juego.estado !== 'jugando') return;
  actualizarHUD(dt);
}
function bucle() {
  requestAnimationFrame(bucle);
  const ahora = performance.now(), dt = Math.min((ahora - ultimo) / 1000, 0.05); ultimo = ahora;
  tiempo += dt; cuadro++;
  if (juego.estado === 'jugando') actualizarJuego(dt);
  else if (juego.estado === 'menu') actualizarMenu(dt);
  else if (juego.estado === 'intro') actualizarIntro(dt);
  else if (juego.estado === 'hangar') girarSala(dt);
  if (grupoNivel && grupoNivel.userData.animar && (juego.estado === 'jugando' || juego.estado === 'menu' || juego.estado === 'intro')) grupoNivel.userData.animar(dt);
  animarAvioneta(dt); Nucita.actualizar(dt); actualizarParticulas(dt); actualizarPajaros(dt);
  cielo.position.copy(camara.position);
  renderer.render(escena, camara);
}
ponerPiloto(Guardado.get('avatar', 'nina'));
irAlMenu();
bucle();
