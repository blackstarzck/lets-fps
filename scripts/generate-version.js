
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = Date.now().toString();
const content = JSON.stringify({ version, timestamp: new Date().toISOString() }, null, 2);

const publicDir = path.join(__dirname, '../public');
const filePath = path.join(publicDir, 'version.json');

// Ensure public dir exists
if (!fs.existsSync(publicDir)){
    fs.mkdirSync(publicDir);
}

fs.writeFileSync(filePath, content);

console.log(`[Version] Generated version.json: ${version}`);
