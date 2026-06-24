import fs from 'fs';

const content = fs.readFileSync('c:/Hackthon/UNO/frontend/src/App.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('beta') || line.toLowerCase().includes('v1.')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
