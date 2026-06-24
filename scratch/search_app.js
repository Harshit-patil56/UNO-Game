import fs from 'fs';

const content = fs.readFileSync('c:/Hackthon/UNO/frontend/src/App.tsx', 'utf8');
const lines = content.split('\n');

const queries = ['socket.on', 'connect_error', 'disconnect', 'error', 'view', 'setView'];

queries.forEach(query => {
  console.log(`=== Matches for "${query}" ===`);
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(query.toLowerCase())) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  });
});
