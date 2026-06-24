import fs from 'fs';
import path from 'path';

const files = [
  'c:/Hackthon/UNO/frontend/src/App.tsx',
  'c:/Hackthon/UNO/frontend/about.html',
  'c:/Hackthon/UNO/frontend/privacy.html',
  'c:/Hackthon/UNO/frontend/terms.html',
  'c:/Hackthon/UNO/frontend/contact.html',
  'c:/Hackthon/UNO/frontend/404.html',
  'c:/Hackthon/UNO/frontend/500.html'
];

files.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    console.log(`\n=== Scanning ${path.basename(filePath)} ===`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Find button-like elements or tags
      if (line.includes('btn-3d') || line.includes('<button') || line.includes('border-[#0f172a]') && (line.includes('button') || line.includes('btn') || line.includes('btn-3d-front'))) {
        console.log(`${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
