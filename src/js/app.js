import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.20/+esm';

const BRAILLE = {'0,0':1,'0,1':2,'0,2':4,'1,0':8,'1,1':16,'1,2':32,'0,3':64,'1,3':128};
const [drop, input, out] = ['dropzone','fileInput','output'].map(id => document.getElementById(id));
let img = null;

const sizes = {Small: 1.0, Medium: 2.5, Large: 4.0};
const cfg = {size: sizes.Medium, method: 'Flow', color: 'Mono', brightness: 0.2, copy: () => navigator.clipboard.writeText(out.textContent)};
const ui = {sizeLabel: 'Medium', method: cfg.method, color: cfg.color, brightness: cfg.brightness, copy: cfg.copy};

const gui = new GUI();
['sizeLabel','method','color'].forEach((k,i) => 
  gui.add(ui, k, i ? [['Flow','Scatter'],['Mono','Color']][i-1] : Object.keys(sizes))
    .name(k[0].toUpperCase() + k.slice(1).replace('Label',''))
    .onChange(v => { cfg[i ? k : 'size'] = i ? v : sizes[v]; img && convert(); })
);
gui.add(ui, 'brightness', 0, 1).onChange(v => { cfg.brightness = v; img && convert(); });
gui.add(ui, 'copy');
gui.close();

drop.onclick = () => input.click();

const setupDropzone = (el) => {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('dragover');
    out.style.borderColor = '#00E100';
  });
  
  el.addEventListener('dragleave', () => {
    el.classList.remove('dragover');
    out.style.borderColor = '';
  });
  
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    out.style.borderColor = '';
    handleDrop(e);
  });
};

setupDropzone(drop);
setupDropzone(out);

input.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    load(file);
  }
});

const load = f => {
  const r = new FileReader();
  r.onload = e => {
    const i = new Image();
    i.onload = () => { img = i; convert(); };
    i.src = e.target.result;
  };
  r.readAsDataURL(f);
};

const handleDrop = e => {
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) return load(file);
  
  const html = e.dataTransfer.getData('text/html');
  const src = html && new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.src;
  const url = src || e.dataTransfer.getData('text/plain');
  
  if (url) fetch(url).then(r => r.blob()).then(load).catch(() => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => { img = i; convert(); };
    i.src = url;
  });
};

const otsu = (g, w, h) => {
  const hist = Array(256).fill(0);
  g.forEach(v => hist[v]++);
  let sum = 0, sB = 0, wB = 0, max = 0, t = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = w * h - wB;
    if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB, mF = (sum - sB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > max) { max = v; t = i; }
  }
  return t;
};

const stretch = g => {
  const s = [...g].sort((a,b) => a - b);
  const [min, max] = [s[~~(s.length * 0.01)], s[~~(s.length * 0.99)]];
  if (max == min) return g;
  const scale = 255 / (max - min);
  for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, ~~((g[i] - min) * scale)));
  return g;
};

const convert = () => {
  if (!img) return;
  
  const out = document.getElementById('output');
  const [oW, oH] = [out.offsetWidth, out.offsetHeight];
  const scale = Math.min((oW - 20) / (img.width * 0.6), (oH - 20) / (img.height * 6)) * cfg.size;
  
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  [cvs.width, cvs.height] = [~~(img.width * scale * 0.75), ~~(img.height * scale)];
  ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
  
  let data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
  const gray = new Uint8Array(cvs.width * cvs.height);
  
  const br = 0.5 + cfg.brightness * 2.5; // Scale 0-1 to 0.5-2
  if (cfg.color === 'Mono') {
    const grayData = ctx.createImageData(cvs.width, cvs.height);
    for (let i = 0; i < data.length; i += 4) {
      const g = Math.min(255, (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * br);
      grayData.data[i] = grayData.data[i + 1] = grayData.data[i + 2] = g;
      grayData.data[i + 3] = data[i + 3];
      gray[i / 4] = g;
    }
    ctx.putImageData(grayData, 0, 0);
    data = grayData.data;
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * br);
      data[i + 1] = Math.min(255, data[i + 1] * br);
      data[i + 2] = Math.min(255, data[i + 2] * br);
      gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  
  stretch(gray);
  const threshold = otsu(gray, cvs.width, cvs.height);
  for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
  
  const dots = cfg.method === 'Flow' ? dither(gray, cvs.width, cvs.height, threshold) : poisson(gray, cvs.width, cvs.height);
  const txt = toBraille(dots, data, cvs.width, cvs.height, cfg.color);
  
  const lines = txt.trim().split('\n');
  const [h, w] = [lines.length, Math.max(...lines.map(l => (l.match(/>(.)</g) || []).length))];
  
  const test = document.createElement('span');
  test.style.cssText = 'font-family:"IBM Plex Mono",monospace;font-size:10px;position:absolute;visibility:hidden';
  test.textContent = '⠿';
  document.body.appendChild(test);
  const charRatio = test.offsetWidth / test.offsetHeight;
  document.body.removeChild(test);
  
  const fontSize = Math.min((oW - 20) / (w * charRatio), (oH - 20) / h);
  
  out.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;"><pre style="font-family: 'IBM Plex Mono', monospace; font-size: ${fontSize}px; line-height: ${fontSize}px; margin: 0; padding: 10px; text-align: center;">${txt}</pre></div>`;
  
  drop.style.display = 'none';
};

const dither = (g, w, h, t) => {
  const err = new Float32Array(g), dots = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = err[i], pix = old < t ? 0 : 255;
      err[i] = pix;
      if (!pix) dots.push({x, y});
      const e = old - pix;
      if (x < w - 1) err[i + 1] += e * 7 / 16;
      if (y < h - 1) {
        if (x > 0) err[i + w - 1] += e * 3 / 16;
        err[i + w] += e * 5 / 16;
        if (x < w - 1) err[i + w + 1] += e / 16;
      }
    }
  }
  return dots;
};

const poisson = (g, w, h) => {
  const dots = [], [rMin, rMax] = [0.8, 3], cell = rMin / Math.sqrt(2);
  const [gW, gH] = [Math.ceil(w / cell), Math.ceil(h / cell)];
  const grid = Array(gW * gH).fill(-1), active = [];
  
  const radius = (x, y) => rMin + (rMax - rMin) * Math.pow(g[~~y * w + ~~x] / 255, 1.5);
  
  let [dVal, dPt] = [255, {x: w/2, y: h/2}];
  for (let y = 0; y < h; y += 10)
    for (let x = 0; x < w; x += 10)
      if (g[y * w + x] < dVal) [dVal, dPt] = [g[y * w + x], {x, y}];
  
  grid[~~(dPt.y / cell) * gW + ~~(dPt.x / cell)] = 0;
  dots.push(dPt);
  active.push(0);
  
  while (active.length) {
    const idx = ~~(Math.random() * active.length);
    const pt = dots[active[idx]], r = radius(pt.x, pt.y);
    let found = false;
    
    for (let n = 0; n < 30; n++) {
      const a = Math.random() * Math.PI * 2;
      const d = r + Math.random() * r;
      const c = {x: pt.x + Math.cos(a) * d, y: pt.y + Math.sin(a) * d};
      
      if (c.x >= 0 && c.x < w && c.y >= 0 && c.y < h) {
        if (Math.random() < (1 - g[~~c.y * w + ~~c.x] / 255) * 0.95) {
          const cR = radius(c.x, c.y);
          if (valid(c, dots, grid, gW, gH, cell, cR)) {
            grid[~~(c.y / cell) * gW + ~~(c.x / cell)] = dots.length;
            dots.push(c);
            active.push(dots.length - 1);
            found = true;
            break;
          }
        }
      }
    }
    if (!found) active.splice(idx, 1);
  }
  return dots;
};

const valid = (c, dots, grid, gW, gH, cell, r) => {
  const [gX, gY, sR] = [~~(c.x / cell), ~~(c.y / cell), Math.ceil(r / cell)];
  for (let dy = -sR; dy <= sR; dy++) {
    for (let dx = -sR; dx <= sR; dx++) {
      const [nX, nY] = [gX + dx, gY + dy];
      if (nX >= 0 && nX < gW && nY >= 0 && nY < gH) {
        const nIdx = nY * gW + nX;
        if (grid[nIdx] != -1) {
          const n = dots[grid[nIdx]];
          if (Math.sqrt((c.x - n.x) ** 2 + (c.y - n.y) ** 2) < r) return false;
        }
      }
    }
  }
  return true;
};

const toBraille = (dots, data, w, h, mode) => {
  const [bW, bH] = [Math.ceil(w / 2), Math.ceil(h / 4)];
  const grid = Array(bH).fill().map(() => Array(bW).fill().map(() => ({b: 0, r: 0, g: 0, bl: 0, n: 0})));
  
  dots.forEach(d => {
    const [cX, cY] = [~~(d.x / 2), ~~(d.y / 4)];
    const key = `${~~d.x % 2},${~~d.y % 4}`;
    if (cY < bH && cX < bW && BRAILLE[key]) grid[cY][cX].b |= BRAILLE[key];
  });
  
  for (let y = 0; y < bH; y++) {
    for (let x = 0; x < bW; x++) {
      const c = grid[y][x];
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const [px, py] = [x * 2 + dx, y * 4 + dy];
          if (px < w && py < h) {
            const i = (py * w + px) * 4;
            c.r += data[i];
            c.g += data[i + 1];
            c.bl += data[i + 2];
            c.n++;
          }
        }
      }
      if (c.n) [c.r, c.g, c.bl] = [c.r, c.g, c.bl].map(v => ~~(v / c.n));
    }
  }
  
  return grid.map(row => row.map(c => {
    const gray = mode === 'Mono' ? ~~(c.r * 0.7) : null;
    return mode === 'Mono' 
      ? `<span style="color:rgb(${gray},${gray},${gray})">${String.fromCharCode(0x2800 + c.b)}</span>`
      : `<span style="color:rgb(${c.r},${c.g},${c.bl})">${String.fromCharCode(0x2800 + c.b)}</span>`;
  }).join('')).join('\n');
};