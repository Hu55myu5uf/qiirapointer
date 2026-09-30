const fs = require('fs');
const path = require('path');

const walkSync = function(dir, filelist) {
  const files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      filelist = walkSync(fullPath, filelist);
    } else {
      if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
        filelist.push(fullPath);
      }
    }
  });
  return filelist;
};

const dirsToScan = [
  path.join(__dirname, 'src', 'screens'),
  path.join(__dirname, 'src', 'components')
];

let files = [];
dirsToScan.forEach(dir => {
  if (fs.existsSync(dir)) {
    if (fs.statSync(dir).isDirectory()) {
      files = files.concat(walkSync(dir));
    } else {
      files.push(dir);
    }
  }
});

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('COLORS.')) {
    content = content.replace(/COLORS\./g, 'colors.');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed JSX COLORS in:', file);
  }
});

console.log('Done fixing COLORS');
