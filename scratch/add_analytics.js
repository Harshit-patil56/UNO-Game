import fs from 'fs';
import path from 'path';

const files = [
  'c:/Hackthon/UNO/frontend/index.html',
  'c:/Hackthon/UNO/frontend/about.html',
  'c:/Hackthon/UNO/frontend/privacy.html',
  'c:/Hackthon/UNO/frontend/terms.html',
  'c:/Hackthon/UNO/frontend/contact.html',
  'c:/Hackthon/UNO/frontend/404.html',
  'c:/Hackthon/UNO/frontend/500.html'
];

const gaTag = `    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-0WEBRN8YMC"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-0WEBRN8YMC');
    </script>`;

files.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the tag is already present
    if (content.includes('G-0WEBRN8YMC')) {
      console.log(`Google Analytics is already added to ${path.basename(filePath)}`);
      return;
    }
    
    // Insert after <head> or after <meta charset="UTF-8" />
    if (content.includes('<meta charset="UTF-8" />')) {
      content = content.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n' + gaTag);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Added Google Analytics to ${path.basename(filePath)} after charset meta tag`);
    } else if (content.includes('<head>')) {
      content = content.replace('<head>', '<head>\n' + gaTag);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Added Google Analytics to ${path.basename(filePath)} after head tag`);
    } else {
      console.log(`Could not find head or charset tag in ${path.basename(filePath)}`);
    }
  } else {
    console.log(`File not found: ${filePath}`);
  }
});
