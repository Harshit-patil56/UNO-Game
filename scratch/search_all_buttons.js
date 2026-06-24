import fs from 'fs';

const content = fs.readFileSync('c:/Hackthon/UNO/frontend/src/App.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('<button') && line.includes('border-')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
