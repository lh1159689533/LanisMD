/**
 * 文件类型图标映射
 *
 * 按后缀映射 SVG 图标，覆盖常见文件类型 + 1 个 fallback 通用图标。
 */

// --- SVG 图标定义 ---

const svgPdf = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#E53935"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#FFCDD2"/><text x="12" y="17" text-anchor="middle" font-size="6" font-weight="bold" fill="white" font-family="system-ui">PDF</text></svg>`;

const svgWord = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#1565C0"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#BBDEFB"/><text x="12" y="17" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui">DOC</text></svg>`;

const svgExcel = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#2E7D32"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#C8E6C9"/><text x="12" y="17" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui">XLS</text></svg>`;

const svgPpt = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#D84315"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#FFCCBC"/><text x="12" y="17" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui">PPT</text></svg>`;

const svgVideo = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#6A1B9A"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#E1BEE7"/><polygon points="10,10 10,18 16,14" fill="white"/></svg>`;

const svgAudio = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#00838F"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#B2EBF2"/><text x="12" y="17" text-anchor="middle" font-size="8" fill="white" font-family="system-ui">&#9835;</text></svg>`;

const svgCode = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#37474F"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#B0BEC5"/><text x="12" y="17" text-anchor="middle" font-size="7" fill="#4FC3F7" font-family="monospace">&lt;/&gt;</text></svg>`;

const svgText = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#546E7A"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#CFD8DC"/><line x1="8" y1="12" x2="16" y2="12" stroke="white" stroke-width="1.5"/><line x1="8" y1="15" x2="14" y2="15" stroke="white" stroke-width="1.5"/><line x1="8" y1="18" x2="12" y2="18" stroke="white" stroke-width="1.5"/></svg>`;

const svgArchive = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#F57C00"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#FFE0B2"/><text x="12" y="17" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui">ZIP</text></svg>`;

const svgImage = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#AD1457"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#F8BBD0"/><circle cx="10" cy="13" r="2" fill="white"/><polyline points="8,19 11,15 13,17 16,13 17,19" fill="white" opacity="0.8"/></svg>`;

const svg3D = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#4527A0"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#D1C4E9"/><text x="12" y="17" text-anchor="middle" font-size="6" font-weight="bold" fill="white" font-family="system-ui">3D</text></svg>`;

const svgData = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#1B5E20"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#C8E6C9"/><text x="12" y="17" text-anchor="middle" font-size="5" font-weight="bold" fill="white" font-family="system-ui">DB</text></svg>`;

const svgFont = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#424242"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#E0E0E0"/><text x="12" y="17" text-anchor="middle" font-size="9" font-weight="bold" fill="white" font-family="serif">A</text></svg>`;

const svgEmail = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#0277BD"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#B3E5FC"/><path d="M8 12l4 3 4-3" stroke="white" stroke-width="1.5" fill="none"/><rect x="8" y="12" width="8" height="6" rx="1" stroke="white" stroke-width="1.5" fill="none"/></svg>`;

const svgBook = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#4E342E"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#D7CCC8"/><text x="12" y="17" text-anchor="middle" font-size="8" fill="white" font-family="serif">B</text></svg>`;

const svgGeneric = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7z" fill="#78909C"/><path d="M13 2l6 6h-4c-1.1 0-2-.9-2-2V2z" fill="#CFD8DC"/></svg>`;

// --- 后缀映射表 ---

const iconMap: Record<string, string> = {
  // PDF
  pdf: svgPdf,
  // Word
  docx: svgWord, docm: svgWord, dotx: svgWord, dotm: svgWord, rtf: svgWord, odt: svgWord,
  // Excel
  xlsx: svgExcel, xlsm: svgExcel, ods: svgExcel,
  // PPT
  pptx: svgPpt, pptm: svgPpt, odp: svgPpt,
  // Video
  mp4: svgVideo, webm: svgVideo, m3u8: svgVideo, flv: svgVideo, m2ts: svgVideo,
  // Audio
  mp3: svgAudio, wav: svgAudio, flac: svgAudio, midi: svgAudio,
  // Code
  js: svgCode, ts: svgCode, py: svgCode, go: svgCode, rs: svgCode,
  rb: svgCode, swift: svgCode, kt: svgCode, vue: svgCode, css: svgCode,
  html: svgCode, react: svgCode,
  // Text
  txt: svgText, md: svgText, json: svgText, jsonc: svgText, json5: svgText,
  yaml: svgText, toml: svgText, ini: svgText, ipynb: svgText,
  proto: svgText, hcl: svgText, tex: svgText, gv: svgText, http: svgText,
  // Archive
  zip: svgArchive, rar: svgArchive, '7z': svgArchive, tar: svgArchive,
  gz: svgArchive, tgz: svgArchive, bz2: svgArchive, xz: svgArchive,
  // Image / Design
  psd: svgImage, ai: svgImage, eps: svgImage,
  // 3D
  gltf: svg3D, glb: svg3D, obj: svg3D, stl: svg3D, fbx: svg3D,
  dae: svg3D, '3mf': svg3D, usdz: svg3D,
  dxf: svg3D, dwg: svg3D, step: svg3D, ifc: svg3D, gds: svg3D, oas: svg3D, oasis: svg3D,
  // Data
  sqlite: svgData, wasm: svgData, parquet: svgData, avro: svgData,
  // Font
  ttf: svgFont, otf: svgFont, woff: svgFont, woff2: svgFont,
  // Email
  eml: svgEmail, msg: svgEmail, mbox: svgEmail,
  // Book
  epub: svgBook, ofd: svgBook, xps: svgBook,
  // Geo / Diagram
  geojson: svgData, kml: svgData, kmz: svgData, gpx: svgData, shp: svgData,
  drawio: svgCode, excalidraw: svgCode,
  // Web archive
  webarchive: svgGeneric,
};

/**
 * 根据文件名获取对应的 SVG 图标
 */
export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return iconMap[ext] || svgGeneric;
}
