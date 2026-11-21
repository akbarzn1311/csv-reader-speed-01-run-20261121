// Fast CSV reader matching csv-reader 1.0.0 semantics exactly.
// Single pass over the text, indexOf-based scanning, minimal allocations.
export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) i = 1;
  const errors = [];
  const records = [];
  let width = 0;
  let line = 1;

  // Value of text[start..end] with CRLF and lone CR read as LF; counts every
  // line break into `line`. Fast when the segment holds no CR or LF.
  function segValue(start, end) {
    const cr = text.indexOf('\r', start);
    if (cr === -1 || cr >= end) {
      let p = start;
      for (;;) {
        const nl = text.indexOf('\n', p);
        if (nl === -1 || nl >= end) break;
        line++;
        p = nl + 1;
      }
      return text.slice(start, end);
    }
    let out = '';
    let p = start;
    let segStart = start;
    while (p < end) {
      const ch = text.charCodeAt(p);
      if (ch === 13) {
        out += text.slice(segStart, p);
        out += '\n';
        line++;
        if (p + 1 < end && text.charCodeAt(p + 1) === 10) p += 2;
        else p += 1;
        segStart = p;
      } else {
        if (ch === 10) line++;
        p++;
      }
    }
    out += text.slice(segStart, end);
    return out;
  }

  // Unquoted field starting at pos (pos < n). Leaves `i` at the terminator
  // (',', LF, CR of a CRLF, or n). Handles stray CRs (slow path).
  function unquoted(pos, recLine, recRow) {
    let comma = text.indexOf(',', pos);
    let lf = text.indexOf('\n', pos);
    let cr = text.indexOf('\r', pos);
    let end = n;
    let term = 0;
    if (comma !== -1 && comma < end) { end = comma; term = 1; }
    if (lf !== -1 && lf < end) { end = lf; term = 2; }
    if (cr !== -1 && cr < end) { end = cr; term = 3; }
    if (term === 3 && !(end + 1 < n && text.charCodeAt(end + 1) === 10)) {
      return unquotedSlow(pos, recLine, recRow);
    }
    i = end;
    return text.slice(pos, end);
  }

  function unquotedSlow(pos, recLine, recRow) {
    let value = '';
    let p = pos;
    for (;;) {
      let comma = text.indexOf(',', p);
      let lf = text.indexOf('\n', p);
      let cr = text.indexOf('\r', p);
      let end = n;
      let term = 0;
      if (comma !== -1 && comma < end) { end = comma; term = 1; }
      if (lf !== -1 && lf < end) { end = lf; term = 2; }
      if (cr !== -1 && cr < end) { end = cr; term = 3; }
      if (term === 3) {
        if (end + 1 < n && text.charCodeAt(end + 1) === 10) {
          value += text.slice(p, end);
          i = end;
          return value;
        }
        value += text.slice(p, end);
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        p = end + 1;
        if (p >= n) { i = n; return value; }
        continue;
      }
      value += text.slice(p, end);
      i = end;
      return value;
    }
  }

  // Quoted field starting at pos (text[pos] === '"'). Leaves `i` at the
  // terminator. Returns the field value.
  function quoted(pos, recLine, recRow) {
    const lineBefore = line;
    let value = '';
    let p = pos + 1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        // The quote never closes: re-read as unquoted from the opening quote.
        // segValue() above already counted line breaks inside the tentative
        // quoted content; those are past where the unquoted re-read stops,
        // so undo that speculative counting (the re-read + record end count
        // the stopping line break exactly once).
        line = lineBefore;
        return unquoted(pos, recLine, recRow);
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        value += segValue(p, q);
        value += '"';
        p = q + 2;
        continue;
      }
      value += segValue(p, q);
      const js = q + 1;
      // Fast path: the char right after the closing quote is usually the field
      // terminator itself (',' / LF / CRLF / EOF) — no junk, no scan needed.
      if (js >= n) { i = n; return value; }
      const jc = text.charCodeAt(js);
      if (jc === 44) { i = js; return value; }
      if (jc === 10) { i = js; return value; }
      if (jc === 13 && js + 1 < n && text.charCodeAt(js + 1) === 10) { i = js; return value; }
      // Junk follows the closing quote: scan for the terminator.
      let comma = text.indexOf(',', js);
      let lf = text.indexOf('\n', js);
      let cr = text.indexOf('\r', js);
      let end = n;
      let term = 0;
      if (comma !== -1 && comma < end) { end = comma; term = 1; }
      if (lf !== -1 && lf < end) { end = lf; term = 2; }
      if (cr !== -1 && cr < end) { end = cr; term = 3; }
      if (term === 3 && !(end + 1 < n && text.charCodeAt(end + 1) === 10)) {
        const jv = unquotedSlow(js, recLine, recRow);
        if (jv.length > 0) {
          value += jv;
          errors.push({ code: 'quote_junk', line: recLine, row: recRow });
        }
        return value;
      }
      if (end > js) {
        value += text.slice(js, end);
        errors.push({ code: 'quote_junk', line: recLine, row: recRow });
      }
      i = end;
      return value;
    }
  }

  // ---- record loop ----
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === 10) { i++; line++; continue; }
    if (c === 13) {
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) { i += 2; line++; continue; }
      // Stray CR at a record start. Peek past the stray CRs: if a '"' follows,
      // the record's first field is unquoted (the '"' is literal), so start
      // the record here and let the field loop handle the CR via unquoted().
      let j = i;
      while (j < n && text.charCodeAt(j) === 13 && !(j + 1 < n && text.charCodeAt(j + 1) === 10)) j++;
      if (j >= n || text.charCodeAt(j) !== 34) {
        const row = header ? (records.length === 0 ? null : records.length - 1) : records.length;
        while (i < j) {
          errors.push({ code: 'stray_cr', line, row });
          i++;
        }
        continue;
      }
      // '"' follows the stray CR(s): fall through and start the record at i.
    }
    const recLine = line;
    const recRow = header ? (records.length === 0 ? null : records.length - 1) : records.length;
    const fields = [];
    let done = false;
    while (!done) {
      if (i >= n) { fields.push(''); done = true; break; }
      c = text.charCodeAt(i);
      if (c === 10) { fields.push(''); i++; line++; done = true; break; }
      if (c === 13) {
        if (i + 1 < n && text.charCodeAt(i + 1) === 10) { fields.push(''); i += 2; line++; done = true; break; }
        // Stray CR at a field start: the field is unquoted, so a '"' after
        // the CR is a literal character, not a quoted-field opener.
        // unquoted() drops the CR (emitting stray_cr) and reads the field.
        fields.push(unquoted(i, recLine, recRow));
      } else if (c === 34) fields.push(quoted(i, recLine, recRow));
      else fields.push(unquoted(i, recLine, recRow));
      if (i >= n) { done = true; break; }
      c = text.charCodeAt(i);
      if (c === 44) { i++; continue; }
      if (c === 10) { i++; line++; done = true; break; }
      i += 2; line++; done = true; break;
    }
    // pad / cut to the first record's width (the first record sets it)
    if (records.length > 0) {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.slice(width) });
        fields.length = width;
      }
    }
    records.push(fields);
    if (records.length === 1) width = fields.length;
  }

  let columns = null;
  let rows;
  if (header) {
    columns = records.length > 0 ? records[0] : [];
    rows = records.slice(1);
  } else {
    rows = records;
  }
  return { columns, rows, errors };
}
