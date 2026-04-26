/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   UTILITIES/PINYIN.JS
   ============================================================ */

const TM = {
  ā:1, á:2, ǎ:3, à:4,
  ē:1, é:2, ě:3, è:4,
  ī:1, í:2, ǐ:3, ì:4,
  ō:1, ó:2, ǒ:3, ò:4,
  ū:1, ú:2, ǔ:3, ù:4,
  ǖ:1, ǘ:2, ǚ:3, ǜ:4,
};

export function tone(s) {
  for (const c of s) if (TM[c] !== undefined) return TM[c];
  return 0;
}

export function splitPinyin(word) {
  const syllables = word.match(
    /[bpmfdtnlgkhjqxzcsryw]{0,2}[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜaeiouü]+(?:ng?|r)?/gi,
  );
  return syllables || [word];
}

export function colorPy(str) {
  return str
    .split(/(\s+|[,\.!?·。，！？、；：\(\)]+)/)
    .map((p) => {
      if (!p) return "";
      if (/^[\s,\.!?·。，！？、；：\(\)]+$/.test(p)) return p;
      return splitPinyin(p)
        .map((syl) => `<span class="py t${tone(syl)}">${syl}</span>`)
        .join("");
    })
    .join("");
}

export function hz(s) { return `<span class="hz">${s}</span>`; }
export function py(s) { return colorPy(s); }

const _TONE_MAP = {
  ā:"a", á:"a", ǎ:"a", à:"a",
  ē:"e", é:"e", ě:"e", è:"e",
  ī:"i", í:"i", ǐ:"i", ì:"i",
  ō:"o", ó:"o", ǒ:"o", ò:"o",
  ū:"u", ú:"u", ǔ:"u", ù:"u",
  ǖ:"u", ǘ:"u", ǚ:"u", ǜ:"u", ü:"u",
};

const _TONED = {
  a:["ā","á","ǎ","à"], e:["ē","é","ě","è"],
  i:["ī","í","ǐ","ì"], o:["ō","ó","ǒ","ò"],
  u:["ū","ú","ǔ","ù"], ü:["ǖ","ǘ","ǚ","ǜ"],
};

const _VOWELS = new Set("aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ");
const _FINAL  = new Set(["n","g","r"]);

export function _stripTones(s) {
  return s.split("").map((c) => _TONE_MAP[c] || c).join("");
}

function _hasToneNum(tok) {
  return /[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][1-4]/i.test(tok);
}

function _applyTone(syl, num) {
  const n = parseInt(num) - 1;
  if (n < 0 || n > 3) return syl;
  const s = syl.replace("v", "ü");
  if (/a/.test(s)) return s.replace("a", _TONED.a[n]);
  if (/e/.test(s)) return s.replace("e", _TONED.e[n]);
  if (/ou/.test(s)) return s.replace("o", _TONED.o[n]);
  if (/uo/.test(s)) return s.replace("o", _TONED.o[n]);
  if (/ui/.test(s)) return s.replace("i", _TONED.i[n]);
  if (/iu/.test(s)) return s.replace("u", _TONED.u[n]);
  for (const v of [...s].reverse()) {
    if (_TONED[v])
      return s.slice(0, s.lastIndexOf(v)) + _TONED[v][n] + s.slice(s.lastIndexOf(v) + 1);
  }
  return s;
}

function _numToTone(str) {
  let s = str.replace(/v([1-4])/g, "ü$1").replace(/v(?=[^1-4]|$)/g, "ü");
  return s.replace(
    /([bpmfdtnlgkhjqxzcsryw]{0,2})([aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng?|r)?)([1-4])/gi,
    (_, c, v, n) => c + _applyTone(v, n),
  );
}

function _isSylBoundary(after) {
  if (!after) return true;
  if (_VOWELS.has(after)) return false;
  if (_FINAL.has(after)) return false;
  return true;
}

function _tokenizeInput(str) {
  if (str.includes(" ")) return str.trim().split(/\s+/).filter(Boolean);
  return str.match(/[bpmfdtnlgkhjqxzcsryw]{0,2}[aeiouüv]+(?:ng?|r)?[1-4]?/gi) || [str];
}

export function _buildQueryTokens(input) {
  return _tokenizeInput(input.toLowerCase()).map((tok) => {
    if (_hasToneNum(tok)) return { toned: _numToTone(tok).toLowerCase(), free: null };
    else return { toned: null, free: _stripTones(tok) };
  });
}

export function _matchPinyinTokens(pyDB, queryTokens) {
  const dbClean = pyDB.toLowerCase().replace(/\s+/g, "");
  const dbStrip = _stripTones(dbClean);
  let pos = 0;
  for (const tok of queryTokens) {
    const q   = tok.toned ? tok.toned.replace(/\s+/g, "") : tok.free;
    const src = tok.toned ? dbClean : dbStrip;
    let found = false, i = pos;
    while (true) {
      const p = src.indexOf(q, i);
      if (p === -1) break;
      if (p >= pos && _isSylBoundary(src[p + q.length])) { pos = p + q.length; found = true; break; }
      i = p + 1;
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Mengubah string pinyin tanpa nada menjadi Regex Postgres
 * Contoh: "wo jia" -> "w[oōóǒò]\s*j[iīíǐì][aāáǎà]"
 */
export function _getPinyinRegex(query) {
  const clean = _stripTones(query.toLowerCase());
  const vowelMap = {
    a: "[aāáǎà]",
    e: "[eēéěè]",
    i: "[iīíǐì]",
    o: "[oōóǒò]",
    u: "[uūúǔù]",
    v: "[vüǖǘǚǜ]",
    ü: "[vüǖǘǚǜ]",
  };
  let re = "";
  for (const char of clean) {
    if (vowelMap[char]) re += vowelMap[char];
    else if (char === " ") re += "\\s*";
    else re += char;
  }
  return re;
}
