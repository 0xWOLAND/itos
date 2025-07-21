// Braille character encoding
const BRAILLE_BITS = {
    '0,0': 0b00000001,
    '0,1': 0b00000010,
    '0,2': 0b00000100,
    '1,0': 0b00001000,
    '1,1': 0b00010000,
    '1,2': 0b00100000,
    '0,3': 0b01000000,
    '1,3': 0b10000000
};

// UI Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const output = document.getElementById('output');
const convertBtn = document.getElementById('convertBtn');
const copyBtn = document.getElementById('copyBtn');

let currentImage = null;

// File handling
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadImage(file);
    }
});

// Size button handling
let currentScale = 0.3;
let currentSize = 'small';
const sizeButtons = document.querySelectorAll('.size-btn');
sizeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        sizeButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentScale = parseFloat(e.target.dataset.scale);
        currentSize = e.target.textContent.toLowerCase();
    });
});

// Convert button
convertBtn.addEventListener('click', convertToBraille);

// Copy button
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(output.textContent);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = 'Copy to Clipboard';
    }, 2000);
});


function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            previewImg.src = e.target.result;
            preview.style.display = 'block';
            convertBtn.disabled = false;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Otsu's method for automatic threshold calculation
function calculateOtsuThreshold(grayscale, width, height) {
    // Calculate histogram
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < grayscale.length; i++) {
        histogram[grayscale[i]]++;
    }
    
    const total = width * height;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
        sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        
        wF = total - wB;
        if (wF === 0) break;
        
        sumB += t * histogram[t];
        
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        
        if (varBetween > varMax) {
            varMax = varBetween;
            threshold = t;
        }
    }
    
    return threshold;
}

// Histogram stretching for automatic contrast adjustment
function applyHistogramStretching(grayscale) {
    // Find min and max values (using 1% and 99% percentiles for robustness)
    const sorted = [...grayscale].sort((a, b) => a - b);
    const percentile1 = Math.floor(sorted.length * 0.01);
    const percentile99 = Math.floor(sorted.length * 0.99);
    
    const min = sorted[percentile1];
    const max = sorted[percentile99];
    
    // Avoid division by zero
    if (max === min) return grayscale;
    
    // Apply histogram stretching
    const scale = 255 / (max - min);
    for (let i = 0; i < grayscale.length; i++) {
        let value = (grayscale[i] - min) * scale;
        grayscale[i] = Math.max(0, Math.min(255, value));
    }
    
    return grayscale;
}

function convertToBraille() {
    if (!currentImage) return;
    
    const scale = currentScale;
    let threshold = 128;
    const method = document.querySelector('input[name="method"]:checked').value;
    const autoCalibrate = document.getElementById('autoCalibrate')?.checked ?? true;
    const colorMode = document.getElementById('colorMode')?.checked ?? false;
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Scale image preserving aspect ratio
    const targetWidth = Math.floor(currentImage.width * scale);
    const targetHeight = Math.floor(currentImage.height * scale);
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale
    const grayscale = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayscale[i / 4] = gray;
    }
    
    // Auto-calibrate if enabled
    if (autoCalibrate) {
        // Apply histogram stretching for automatic contrast enhancement
        applyHistogramStretching(grayscale);
        
        // Calculate optimal threshold using Otsu's method after contrast enhancement
        threshold = calculateOtsuThreshold(grayscale, canvas.width, canvas.height);
    }
    
    // Invert by default
    for (let i = 0; i < grayscale.length; i++) {
        grayscale[i] = 255 - grayscale[i];
    }
    
    // Generate dots based on method
    let dots;
    switch (method) {
        case 'dither':
            dots = floydSteinbergDither(grayscale, canvas.width, canvas.height, threshold);
            break;
        case 'poisson':
            dots = poissonDiskSampling(grayscale, canvas.width, canvas.height, threshold);
            break;
        default:
            dots = thresholdMethod(grayscale, canvas.width, canvas.height, threshold);
    }
    
    // Convert dots to Braille
    if (colorMode) {
        const brailleText = dotsToColorBraille(dots, data, canvas.width, canvas.height);
        output.innerHTML = `<pre style="font-family: monospace; font-size: 6px; line-height: 6px;">${brailleText}</pre>`;
    } else {
        const brailleText = dotsToBraille(dots, canvas.width, canvas.height);
        output.textContent = brailleText;
    }
    copyBtn.style.display = 'inline-block';
}

function thresholdMethod(grayscale, width, height, threshold) {
    const dots = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (grayscale[idx] < threshold) {
                dots.push({x, y});
            }
        }
    }
    return dots;
}

function floydSteinbergDither(grayscale, width, height, threshold) {
    const error = new Float32Array(grayscale);
    const dots = [];
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const oldPixel = error[idx];
            const newPixel = oldPixel < threshold ? 0 : 255;
            error[idx] = newPixel;
            
            if (newPixel === 0) {
                dots.push({x, y});
            }
            
            const err = oldPixel - newPixel;
            
            // Distribute error
            if (x < width - 1) error[idx + 1] += err * 7 / 16;
            if (y < height - 1) {
                if (x > 0) error[idx + width - 1] += err * 3 / 16;
                error[idx + width] += err * 5 / 16;
                if (x < width - 1) error[idx + width + 1] += err * 1 / 16;
            }
        }
    }
    
    return dots;
}

// Improved weighted Poisson disk sampling with variable radius
function poissonDiskSampling(grayscale, width, height) {
    const dots = [];
    const minRadius = 0.8; // Much smaller for higher density
    const maxRadius = 3;   // Reduced max for better coverage
    const cellSize = minRadius / Math.sqrt(2);
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = new Array(gridWidth * gridHeight).fill(-1);
    const active = [];
    const k = 30; // attempts before rejection
    
    // Helper to get variable radius based on image darkness
    function getVariableRadius(x, y) {
        const idx = Math.floor(y) * width + Math.floor(x);
        const gray = grayscale[idx] / 255;
        // Darker areas get smaller radius (more dots)
        return minRadius + (maxRadius - minRadius) * Math.pow(gray, 1.5); // Power curve for better distribution
    }
    
    // Start with darkest point in image
    let darkestValue = 255;
    let darkestPoint = {x: width/2, y: height/2};
    for (let y = 0; y < height; y += 10) {
        for (let x = 0; x < width; x += 10) {
            const idx = y * width + x;
            if (grayscale[idx] < darkestValue) {
                darkestValue = grayscale[idx];
                darkestPoint = {x, y};
            }
        }
    }
    
    // Add first point
    const gridIdx = Math.floor(darkestPoint.y / cellSize) * gridWidth + Math.floor(darkestPoint.x / cellSize);
    grid[gridIdx] = 0;
    dots.push(darkestPoint);
    active.push(0);
    
    // Process active list
    while (active.length > 0) {
        const randomIdx = Math.floor(Math.random() * active.length);
        const pointIdx = active[randomIdx];
        const point = dots[pointIdx];
        const pointRadius = getVariableRadius(point.x, point.y);
        
        let found = false;
        
        for (let n = 0; n < k; n++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = pointRadius + Math.random() * pointRadius;
            
            const candidate = {
                x: point.x + Math.cos(angle) * distance,
                y: point.y + Math.sin(angle) * distance
            };
            
            if (candidate.x >= 0 && candidate.x < width && 
                candidate.y >= 0 && candidate.y < height) {
                
                // Check if point should be placed based on darkness
                const gray = grayscale[Math.floor(candidate.y) * width + Math.floor(candidate.x)];
                const probability = 1 - (gray / 255);
                
                if (Math.random() < probability * 0.95) { // Higher probability for more dots
                    const candidateRadius = getVariableRadius(candidate.x, candidate.y);
                    
                    if (isValidPoint(candidate, dots, grid, gridWidth, gridHeight, cellSize, candidateRadius)) {
                        const newGridIdx = Math.floor(candidate.y / cellSize) * gridWidth + Math.floor(candidate.x / cellSize);
                        grid[newGridIdx] = dots.length;
                        dots.push(candidate);
                        active.push(dots.length - 1);
                        found = true;
                        break;
                    }
                }
            }
        }
        
        if (!found) {
            active.splice(randomIdx, 1);
        }
    }
    
    return dots;
}

function isValidPoint(candidate, dots, grid, gridWidth, gridHeight, cellSize, radius) {
    const gridX = Math.floor(candidate.x / cellSize);
    const gridY = Math.floor(candidate.y / cellSize);
    const searchRadius = Math.ceil(radius / cellSize);
    
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            const neighborX = gridX + dx;
            const neighborY = gridY + dy;
            
            if (neighborX >= 0 && neighborX < gridWidth && 
                neighborY >= 0 && neighborY < gridHeight) {
                const neighborIdx = neighborY * gridWidth + neighborX;
                if (grid[neighborIdx] !== -1) {
                    const neighbor = dots[grid[neighborIdx]];
                    const dist = Math.sqrt(
                        Math.pow(candidate.x - neighbor.x, 2) + 
                        Math.pow(candidate.y - neighbor.y, 2)
                    );
                    if (dist < radius) {
                        return false;
                    }
                }
            }
        }
    }
    
    return true;
}

function dotsToBraille(dots, width, height) {
    // Create 2D grid for Braille cells
    const brailleWidth = Math.ceil(width / 2);
    const brailleHeight = Math.ceil(height / 4);
    const brailleGrid = new Array(brailleHeight).fill(null).map(() => new Uint8Array(brailleWidth));
    
    // Map dots to Braille cells
    for (const dot of dots) {
        const cellX = Math.floor(dot.x / 2);
        const cellY = Math.floor(dot.y / 4);
        const dx = Math.floor(dot.x) % 2;
        const dy = Math.floor(dot.y) % 4;
        
        if (cellY < brailleHeight && cellX < brailleWidth) {
            const bitKey = `${dx},${dy}`;
            if (BRAILLE_BITS[bitKey] !== undefined) {
                brailleGrid[cellY][cellX] |= BRAILLE_BITS[bitKey];
            }
        }
    }
    
    // Convert to string
    let result = '';
    for (let y = 0; y < brailleHeight; y++) {
        for (let x = 0; x < brailleWidth; x++) {
            result += String.fromCharCode(0x2800 + brailleGrid[y][x]);
        }
        result += '\n';
    }
    
    return result;
}

// Color mode - convert dots to colored Braille using the same dot placement
function dotsToColorBraille(dots, imageData, width, height) {
    const brailleWidth = Math.ceil(width / 2);
    const brailleHeight = Math.ceil(height / 4);
    const brailleGrid = new Array(brailleHeight).fill(null).map(() => new Array(brailleWidth).fill(null));
    
    // Initialize cells with empty bitmasks and color data
    for (let y = 0; y < brailleHeight; y++) {
        for (let x = 0; x < brailleWidth; x++) {
            brailleGrid[y][x] = { bitmask: 0, r: 0, g: 0, b: 0, count: 0 };
        }
    }
    
    // Map dots to Braille cells
    for (const dot of dots) {
        const cellX = Math.floor(dot.x / 2);
        const cellY = Math.floor(dot.y / 4);
        const dx = Math.floor(dot.x) % 2;
        const dy = Math.floor(dot.y) % 4;
        
        if (cellY < brailleHeight && cellX < brailleWidth) {
            const bitKey = `${dx},${dy}`;
            if (BRAILLE_BITS[bitKey] !== undefined) {
                brailleGrid[cellY][cellX].bitmask |= BRAILLE_BITS[bitKey];
            }
        }
    }
    
    // Calculate average colors for each cell
    for (let y = 0; y < brailleHeight; y++) {
        for (let x = 0; x < brailleWidth; x++) {
            const cell = brailleGrid[y][x];
            
            // Sample colors from the cell area
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const px = x * 2 + dx;
                    const py = y * 4 + dy;
                    
                    if (px < width && py < height) {
                        const idx = (py * width + px) * 4;
                        cell.r += imageData[idx];
                        cell.g += imageData[idx + 1];
                        cell.b += imageData[idx + 2];
                        cell.count++;
                    }
                }
            }
            
            // Average the colors
            if (cell.count > 0) {
                cell.r = Math.floor(cell.r / cell.count);
                cell.g = Math.floor(cell.g / cell.count);
                cell.b = Math.floor(cell.b / cell.count);
            }
        }
    }
    
    // Build result string
    let result = '';
    for (let y = 0; y < brailleHeight; y++) {
        for (let x = 0; x < brailleWidth; x++) {
            const cell = brailleGrid[y][x];
            const brailleChar = String.fromCharCode(0x2800 + cell.bitmask);
            result += `<span style="color: rgb(${cell.r}, ${cell.g}, ${cell.b})">${brailleChar}</span>`;
        }
        result += '\n';
    }
    
    return result;
}