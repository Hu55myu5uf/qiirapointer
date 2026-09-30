const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'App.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add import for useTheme and ThemeProvider
content = `import { useTheme, ThemeProvider } from './src/context/ThemeContext';\n` + content;

// 2. Remove COLORS import from theme.ts
content = content.replace(/import\s+{[^}]*COLORS[^}]*}\s+from\s+['"][^'"]*theme['"];?\n?/, (match) => {
  let newMatch = match.replace(/COLORS,? ?/, '');
  if (newMatch.match(/{\s*}/)) {
    return ''; // all imports removed
  }
  return newMatch;
});

// 3. Inject useTheme into functional components
const components = ['AuthStack', 'HomeStack', 'ClientTabs', 'ClientMessagesStack', 'VendorMessagesStack', 'VendorTabs', 'AdminTabs'];
components.forEach(comp => {
  const regex = new RegExp(`function\\s+${comp}\\(\\)\\s*{`);
  content = content.replace(regex, `function ${comp}() {\n  const { colors } = useTheme();`);
});

// 4. Replace COLORS. with colors.
content = content.replace(/COLORS\./g, 'colors.');

// 5. Wrap App with ThemeProvider. Rename App to MainApp, and export a new App that wraps it.
content = content.replace(/export default function App\(\) {/, `function MainApp() {\n  const { colors } = useTheme();`);

const wrapper = `
export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
`;
content += wrapper;

fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx refactored');
