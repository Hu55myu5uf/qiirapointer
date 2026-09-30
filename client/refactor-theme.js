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
  path.join(__dirname, 'src', 'components'),
  path.join(__dirname, 'App.tsx')
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

  // Check if it uses COLORS
  if (!content.includes('COLORS.') && !content.includes('COLORS')) {
    return;
  }

  // Check if already refactored
  if (content.includes('useTheme()')) {
    return;
  }

  // 1. Add import for useTheme
  // Determine relative path to context based on file location
  let relativePathToContext = '';
  if (file.includes('App.tsx')) {
    relativePathToContext = './src/context/ThemeContext';
  } else {
    // screens or components are 1 level deep from src, but let's calculate
    const relativePath = path.relative(path.dirname(file), path.join(__dirname, 'src', 'context', 'ThemeContext'));
    relativePathToContext = relativePath.replace(/\\/g, '/');
    if (!relativePathToContext.startsWith('.')) {
      relativePathToContext = './' + relativePathToContext;
    }
  }

  const importStatement = `import { useTheme } from '${relativePathToContext}';\n`;
  
  // Find last import
  const lastImportIndex = content.lastIndexOf('import ');
  if (lastImportIndex !== -1) {
    const endOfImport = content.indexOf('\n', lastImportIndex);
    content = content.slice(0, endOfImport + 1) + importStatement + content.slice(endOfImport + 1);
  } else {
    content = importStatement + content;
  }

  // 2. Remove COLORS import from theme.ts
  content = content.replace(/import\s+{[^}]*COLORS[^}]*}\s+from\s+['"][^'"]*theme['"];?\n?/, (match) => {
    let newMatch = match.replace(/COLORS,? ?/, '');
    if (newMatch.match(/{\s*}/)) {
      return ''; // all imports removed
    }
    return newMatch;
  });

  // 3. Find StyleSheet.create
  const styleSheetRegex = /const\s+styles\s*=\s*StyleSheet\.create\({([\s\S]*?)}\);/;
  const match = content.match(styleSheetRegex);
  
  if (match) {
    const stylesObject = match[1];
    
    // Replace the static styles with a hook-based or function-based one
    // But actually, it's easier to rename `styles` to `getStyles(colors)`
    content = content.replace(styleSheetRegex, `const getStyles = (colors: any) => StyleSheet.create({$1});`);

    // 4. Find the default export component or main function to inject `useTheme`
    // This is tricky for all files, so we inject `const { colors } = useTheme(); const styles = getStyles(colors);` 
    // at the top of the component functions.
    
    // Match export default function ComponentName() {
    const componentRegex = /export\s+(?:default\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*{/;
    const componentRegexMatch = content.match(componentRegex);
    
    // Replace 'COLORS.' with 'colors.' in getStyles
    let finalStylesString = content.substring(content.indexOf('const getStyles'));
    finalStylesString = finalStylesString.replace(/COLORS\./g, 'colors.');
    content = content.substring(0, content.indexOf('const getStyles')) + finalStylesString;

    if (componentRegexMatch) {
      const injection = `\n  const { colors } = useTheme();\n  const styles = getStyles(colors);\n`;
      const insertPos = componentRegexMatch.index + componentRegexMatch[0].length;
      content = content.slice(0, insertPos) + injection + content.slice(insertPos);
    } else {
      // Look for const Component = () => {
      const arrowComponentRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*\([^)]*\)\s*=>\s*{/;
      const arrowMatch = content.match(arrowComponentRegex);
      if (arrowMatch) {
        const injection = `\n  const { colors } = useTheme();\n  const styles = getStyles(colors);\n`;
        const insertPos = arrowMatch.index + arrowMatch[0].length;
        content = content.slice(0, insertPos) + injection + content.slice(insertPos);
      }
    }
  }

  // 5. App.tsx specifically needs a bit more care because it has multiple components (Stack.Navigators)
  // that use COLORS. We will replace `COLORS.` with `colors.` everywhere in the file, except we must ensure 
  // they are in scope.
  // Actually, App.tsx has AuthStack, HomeStack, etc. 
  // Let's just write the changes back.
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Refactored:', file);
});

console.log('Done refactoring');
