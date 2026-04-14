const fs = require('fs');
const path = require('path');

const EXPRESSIONS_PATH = path.join(__dirname, '..', 'expressions.txt');

function parseLines(content) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function loadExpressions() {
  try {
    const content = fs.readFileSync(EXPRESSIONS_PATH, 'utf8');
    return parseLines(content);
  } catch {
    return [];
  }
}

function messageMatches(messageContent, expressions) {
  const lower = messageContent.toLowerCase();
  for (const expr of expressions) {
    if (!expr) continue;
    if (lower.includes(expr.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function watchExpressions(onChange) {
  try {
    fs.watch(EXPRESSIONS_PATH, { persistent: true }, (event) => {
      if (event === 'change' || event === 'rename') {
        onChange();
      }
    });
  } catch {
    // fichier absent au démarrage : ignoré
  }
}

module.exports = {
  loadExpressions,
  messageMatches,
  watchExpressions,
  EXPRESSIONS_PATH,
};
