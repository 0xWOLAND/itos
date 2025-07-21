# Braille Stippling Art Generator

Convert images into Unicode Braille character art using various stippling algorithms.

## Features

- **Multiple Conversion Methods**:
  - Threshold: Simple binary conversion
  - Floyd-Steinberg: Error diffusion dithering
  - Poisson Disk: Organic stippling distribution

- **Adjustable Parameters**:
  - Threshold (0-255)
  - Contrast adjustment
  - Scale factor

- **User-Friendly Interface**:
  - Drag & drop image upload
  - Real-time preview
  - Copy to clipboard

## Usage

### Development

```bash
npm run dev
# or
node server.js
```

Then open http://localhost:8080

### Production

Serve the `public/` directory with any static file server.

## Project Structure

```
├── public/          # Static files
│   └── index.html   # Main HTML file
├── src/
│   ├── css/         # Stylesheets
│   │   └── styles.css
│   └── js/          # JavaScript
│       └── app.js   # Main application logic
├── server.js        # Development server
└── package.json     # NPM configuration
```

## Algorithm Details

### Braille Encoding

Each Unicode Braille character represents a 2×4 grid of dots:

```
1 4
2 5
3 6
7 8
```

The dots are encoded as bits in a byte, with the Unicode character being `U+2800 + bitmask`.

### Conversion Methods

1. **Threshold**: Converts pixels darker than threshold to dots
2. **Floyd-Steinberg**: Distributes quantization error to neighboring pixels
3. **Poisson Disk**: Ensures minimum distance between dots with density based on darkness

## Browser Support

Works in all modern browsers with support for:
- Canvas API
- File API
- Unicode rendering