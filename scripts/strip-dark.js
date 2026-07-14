// Script to strip dark: prefixed Tailwind classes from all tsx files
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function findTsxFiles(dir) {
    let results = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            results = results.concat(findTsxFiles(full));
        } else if (item.endsWith('.tsx')) {
            results.push(full);
        }
    }
    return results;
}

// Regex to match dark: prefixed class tokens
// Pattern: dark:classname-value or dark:hover:classname-value etc.
// These appear as space-separated tokens inside className strings
const darkClassRegex = /\s*dark:[^\s"'`{}]+/g;

let totalFiles = 0;
let modifiedFiles = 0;

const files = findTsxFiles(srcDir);
for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    if (content.includes('dark:')) {
        const newContent = content.replace(darkClassRegex, '');
        if (newContent !== content) {
            fs.writeFileSync(file, newContent, 'utf-8');
            modifiedFiles++;
            console.log('Cleaned:', path.relative(srcDir, file));
        }
        totalFiles++;
    }
}

console.log(`\nDone. Scanned ${files.length} files, modified ${modifiedFiles} files.`);
