import fs from 'fs';

const content = fs.readFileSync('c:/Hackthon/UNO/frontend/src/App.tsx', 'utf8');

// Match everything starting with <button up to the closing >
// Note: We can just scan blocks of code.
// Let's do a simple scanner that extracts lines containing `<button` up to the next 8 lines.
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('<button')) {
    console.log(`\n--- Button starting at line ${idx + 1} ---`);
    for (let i = 0; i < 12; i++) {
      if (idx + i < lines.length) {
        console.log(`${idx + 1 + i}: ${lines[idx + i]}`);
      }
    }
  }
});
