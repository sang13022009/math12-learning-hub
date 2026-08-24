const fs = require('fs');

const source = fs.readFileSync('src/data.js', 'utf8');
const match = source.match(/RAW_COURSE\s*=\s*String\.raw`([\s\S]*?)`;\s*$/m);
if (!match) throw new Error('Cannot locate RAW_COURSE template literal');

const lines = match[1].split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const chapters = lines.filter(x => x.startsWith('C|'));
const groups = lines.filter(x => x.startsWith('B|'));
const lessons = lines.filter(x => x.startsWith('L|'));

if (chapters.length !== 6) throw new Error(`Expected 6 chapters, got ${chapters.length}`);
if (groups.length < 25) throw new Error(`Expected >=25 groups, got ${groups.length}`);
if (lessons.length < 90) throw new Error(`Expected >=90 lessons, got ${lessons.length}`);

const resourceToken = /^[VDHSA]=https?:\/\//;
for (const line of lessons) {
  const parts = line.split('|');
  const firstResource = parts.findIndex((p, i) => i > 0 && resourceToken.test(p));
  if (firstResource < 0) throw new Error(`Lesson has no resource: ${line}`);
  for (const token of parts.slice(firstResource)) {
    if (!resourceToken.test(token)) throw new Error(`Malformed resource token: ${token} in ${line}`);
    const url = token.slice(2);
    try { new URL(url); } catch { throw new Error(`Invalid URL: ${url}`); }
  }
}

console.log(JSON.stringify({ chapters: chapters.length, groups: groups.length, lessons: lessons.length }, null, 2));
