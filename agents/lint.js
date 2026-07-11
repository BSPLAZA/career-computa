// lint.js: artifact gates enforced in code. Em-dash lint and the hard 300-char note cap.

// Em dash U+2014, horizontal bar U+2015, and the two-hyphen imitation. En dash U+2013 also
// swept when used as a dash. Replacement keeps meaning: ", " between words, "-" in ranges.
const EM_DASH_RE = /[\u2014\u2015]/;
export function hasEmDash(text) {
  return EM_DASH_RE.test(String(text));
}

export function stripEmDashes(text) {
  let s = String(text);
  // spaced dash reads as a comma pause
  s = s.replace(/\s*[\u2014\u2015]\s*/g, ', ');
  // en dash between digits is a range: keep as hyphen
  s = s.replace(/(\d)\s*\u2013\s*(\d)/g, '$1-$2');
  // any other en dash used as a dash
  s = s.replace(/\s*\u2013\s*/g, ', ');
  return s;
}

export const NOTE_CHAR_CAP = 300;

// Hard cap for connection notes. Truncates at a word boundary if the model overran.
export function enforceNoteCap(text, cap = NOTE_CHAR_CAP) {
  const s = String(text).trim();
  if (s.length <= cap) return { text: s, truncated: false };
  let cut = s.slice(0, cap);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > cap * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[,;:\s]+$/, '');
  if (cut.length > cap) cut = cut.slice(0, cap);
  return { text: cut, truncated: true };
}

// Run the em-dash lint over an artifact before finalize. Returns cleaned text plus gate result.
export function lintArtifact(text) {
  const dirty = hasEmDash(text) || /\u2013/.test(String(text));
  const cleaned = dirty ? stripEmDashes(text) : String(text);
  return {
    text: cleaned,
    gate: { gate: 'no_em_dashes', pass: !hasEmDash(cleaned), note: dirty ? 'em/en dashes replaced' : undefined },
  };
}
