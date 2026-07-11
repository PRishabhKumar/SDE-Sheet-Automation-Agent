// Unicode Mathematical Bold Sans-Serif character ranges:
// Uppercase A-Z: U+1D5D4 to U+1D5ED  (decimal: 120276 to 120301)
// Lowercase a-z: U+1D5EE to U+1D607  (decimal: 120302 to 120327)
// Digits 0-9:    U+1D7EC to U+1D7F5  (decimal: 120812 to 120821)

const BOLD_MAP = new Map();

// Build A-Z map
for (let i = 0; i < 26; i++) {
  BOLD_MAP.set(String.fromCharCode(65 + i), String.fromCodePoint(0x1D5D4 + i));
}

// Build a-z map
for (let i = 0; i < 26; i++) {
  BOLD_MAP.set(String.fromCharCode(97 + i), String.fromCodePoint(0x1D5EE + i));
}

// Build 0-9 map
for (let i = 0; i < 10; i++) {
  BOLD_MAP.set(String.fromCharCode(48 + i), String.fromCodePoint(0x1D7EC + i));
}

/**
 * Converts an ASCII string to Unicode Bold Sans-Serif.
 * Non-ASCII characters (spaces, hyphens, parentheses) are preserved as-is.
 *
 * Example: toBold("M Coloring Problem") → "𝗠 𝗖𝗼𝗹𝗼𝗿𝗶𝗻𝗴 𝗣𝗿𝗼𝗯𝗹𝗲𝗺"
 */
function toBold(str) {
  return str
    .split('')
    .map((char) => BOLD_MAP.get(char) ?? char)
    .join('');
}

export { toBold };