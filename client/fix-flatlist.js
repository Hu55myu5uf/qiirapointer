const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'screens');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

files.forEach(f => {
    const filePath = path.join(dir, f);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Fix FlatList tags that are missing self-closing />
    // Pattern: <FlatList ...> where the tag spans multiple lines and ends with just >
    // We need to find <FlatList ... > and convert to <FlatList ... />
    // Only if there's no </FlatList> in the file (meaning it should be self-closing)
    const flatListOpen = (content.match(/<FlatList[\s>]/g) || []).length;
    const flatListClose = (content.match(/<\/FlatList>/g) || []).length;
    const flatListSelfClose = (content.match(/<FlatList[^>]*\/>/g) || []).length;

    if (flatListOpen > flatListClose + flatListSelfClose) {
        // Need to fix - find FlatList blocks that end with just >  instead of />
        // Match <FlatList followed by any content up to > (not preceded by /) 
        content = content.replace(/<FlatList([\s\S]*?)([^\/])(\s*)>/g, (match, attrs, lastChar, ws) => {
            // Make sure we're not already self-closing
            if (match.endsWith('/>')) return match;
            return `<FlatList${attrs}${lastChar}${ws}/>`;
        });
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed FlatList in:', f);
    }
});

console.log('FlatList fix pass done');
