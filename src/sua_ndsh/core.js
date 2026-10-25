// ===== LÕI XỬ LÝ XML Ở MỨC BYTE — không parse/serialize, giữ nguyên 100% byte ngoài giá trị NOI_DUNG_SH =====
(function (root) {
  const enc = (s) => new TextEncoder().encode(s);
  const T = {
    open: enc('<NGUOI_LX>'), close: enc('</NGUOI_LX>'),
  };
  const tagO = (n) => enc('<' + n + '>');
  const tagC = (n) => enc('</' + n + '>');
  const dec = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

  function find(buf, pat, from, to) {
    to = to === undefined ? buf.length : to;
    const f = pat[0], L = pat.length;
    let i = from;
    while (true) {
      i = buf.indexOf(f, i);
      if (i < 0 || i + L > to) return -1;
      let ok = true;
      for (let k = 1; k < L; k++) if (buf[i + k] !== pat[k]) { ok = false; break; }
      if (ok) return i;
      i++;
    }
  }

  // Lấy mọi lần xuất hiện <TAG>...</TAG> trong [a,b)
  function tagAll(buf, name, a, b) {
    const o = tagO(name), c = tagC(name), out = [];
    let p = a;
    while (true) {
      const s = find(buf, o, p, b);
      if (s < 0) break;
      const vs = s + o.length;
      const e = find(buf, c, vs, b);
      if (e < 0) throw new Error('Thẻ <' + name + '> không có thẻ đóng tại byte ' + s);
      out.push({ start: vs, end: e, text: dec.decode(buf.subarray(vs, e)) });
      p = e + c.length;
    }
    return out;
  }

  // Quét toàn bộ hồ sơ <NGUOI_LX>
  function scan(buf) {
    const recs = [];
    let p = 0;
    while (true) {
      const s = find(buf, T.open, p);
      if (s < 0) break;
      const e = find(buf, T.close, s + T.open.length);
      if (e < 0) throw new Error('Khối <NGUOI_LX> tại byte ' + s + ' không có thẻ đóng — file XML hỏng?');
      const cmt = tagAll(buf, 'SO_CMT', s, e);
      const nds = tagAll(buf, 'NOI_DUNG_SH', s, e);
      const ten = tagAll(buf, 'HO_VA_TEN', s, e);
      const stt = tagAll(buf, 'SO_TT', s, e);
      const sbd = tagAll(buf, 'SO_BAO_DANH', s, e);
      const khoa = tagAll(buf, 'MA_KHOA_HOC', s, e);
      const gplx = tagAll(buf, 'SO_GPLX_DA_CO', s, e);
      const r = {
        idx: recs.length, bs: s, be: e + T.close.length,
        cccd: cmt.length ? cmt[0].text.trim() : '',
        ten: ten.length ? ten[0].text.trim() : '',
        stt: stt.length ? stt[0].text.trim() : '',
        sbd: sbd.length ? sbd[0].text.trim() : '',
        khoa: khoa.length ? khoa[0].text.trim() : '',
        gplx: gplx.length ? gplx[0].text.trim() : '',
        nds: nds.length === 1 ? nds[0] : null,
        err: '',
      };
      if (cmt.length !== 1) r.err = 'Có ' + cmt.length + ' thẻ SO_CMT trong hồ sơ';
      else if (nds.length !== 1) r.err = 'Có ' + nds.length + ' thẻ <NOI_DUNG_SH>…</NOI_DUNG_SH> trong hồ sơ (có thể là thẻ tự đóng) — không sửa';
      else if (!/^\d+$/.test(nds[0].text)) r.err = 'Giá trị NOI_DUNG_SH không phải số thuần: "' + nds[0].text + '"';
      r.oldVal = r.nds ? r.nds.text : '';
      recs.push(r);
      p = e + T.close.length;
    }
    return recs;
  }

  // patches: [{start,end,val}] — val là chuỗi chữ số
  function applyPatches(buf, patches) {
    patches = patches.slice().sort((a, b) => a.start - b.start);
    const parts = []; let last = 0, total = 0;
    for (const pt of patches) {
      if (!/^\d{1,3}$/.test(pt.val)) throw new Error('Giá trị mới không hợp lệ: ' + pt.val);
      if (pt.start < last) throw new Error('Vùng sửa chồng lấn');
      parts.push(buf.subarray(last, pt.start));
      parts.push(enc(pt.val));
      last = pt.end;
    }
    parts.push(buf.subarray(last));
    for (const x of parts) total += x.length;
    const out = new Uint8Array(total); let o = 0;
    for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  }

  function eqBytes(a, aS, aE, b, bS, bE) {
    if (aE - aS !== bE - bS) return false;
    for (let i = 0; i < aE - aS; i++) if (a[aS + i] !== b[bS + i]) return false;
    return true;
  }

  // Kiểm tra độc lập: quét lại file mới, so từng byte ngoài vùng giá trị NOI_DUNG_SH
  function verify(orig, out, expect /* Map idx -> giá trị mong đợi */) {
    const A = scan(orig), B = scan(out);
    const problems = [];
    if (A.length !== B.length) problems.push('Số hồ sơ khác nhau: gốc ' + A.length + ', mới ' + B.length);
    const n = Math.min(A.length, B.length);
    let changed = 0;
    // So byte giữa các vùng giá trị
    let pa = 0, pb = 0;
    for (let i = 0; i < n; i++) {
      const a = A[i], b = B[i];
      if (a.cccd !== b.cccd) problems.push('Hồ sơ #' + (i + 1) + ' CCCD lệch: ' + a.cccd + ' / ' + b.cccd);
      if (!a.nds || !b.nds) continue;
      if (!eqBytes(orig, pa, a.nds.start, out, pb, b.nds.start)) { problems.push('Có byte khác ngoài NOI_DUNG_SH trước hồ sơ #' + (i + 1)); }
      const want = expect.has(i) ? expect.get(i) : a.nds.text;
      if (b.nds.text !== want) problems.push('Hồ sơ #' + (i + 1) + ' (' + a.cccd + ') giá trị ' + b.nds.text + ' ≠ mong đợi ' + want);
      if (b.nds.text !== a.nds.text) changed++;
      pa = a.nds.end; pb = b.nds.end;
    }
    if (!eqBytes(orig, pa, orig.length, out, pb, out.length)) problems.push('Có byte khác ở phần cuối file');
    const bomA = orig[0] === 0xEF && orig[1] === 0xBB && orig[2] === 0xBF;
    const bomB = out[0] === 0xEF && out[1] === 0xBB && out[2] === 0xBF;
    if (bomA !== bomB) problems.push('BOM UTF-8 bị thay đổi');
    return { ok: problems.length === 0, problems, changed, records: B.length };
  }

  // Chuẩn hóa CCCD từ ô Excel
  function normCccd(v) {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? String(Math.round(v)) : String(v);
    s = s.replace(/[\s'’.\-]/g, '').trim();
    if (!/^\d+$/.test(s)) return '';
    if (s.length === 11) s = '0' + s;      // Excel mất số 0 đầu của CCCD 12 số
    if (s.length === 8) s = '0' + s;       // CMND 9 số
    return (s.length === 12 || s.length === 9) ? s : '';
  }

  function normName(s) {
    return String(s || '').normalize('NFC').toUpperCase().replace(/\s+/g, ' ').trim();
  }
  // Chuẩn hóa chữ nội dung sát hạch để tra bảng mã: bỏ khoảng trắng, hoa/thường, đuôi ngày kiểu "H-28/10/2023"
  function normLabel(s) {
    return String(s || '').normalize('NFC').toUpperCase()
      .replace(/[\s\-–:]*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '')
      .replace(/SÁT HẠCH/g, 'SH').replace(/\s+/g, '').replace(/[.,;]+$/, '');
  }

  // Ngữ cảnh quanh 1 vị trí byte: hồ sơ nào, thẻ nào, đoạn chữ ngắn
  function context(buf, recs, pos) {
    let rec = null;
    for (let lo = 0, hi = recs.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (recs[m].be <= pos) lo = m + 1; else if (recs[m].bs > pos) hi = m - 1; else { rec = recs[m]; break; } }
    let tag = '', k = pos;
    for (let n = 0; k >= 0 && n < 4000; k--, n++) if (buf[k] === 0x3C && k < pos) { const cl = buf[k + 1] === 0x2F; let s0 = k + (cl ? 2 : 1), e = s0; while (e < buf.length && /[A-Za-z0-9_:]/.test(String.fromCharCode(buf[e]))) e++; tag = (cl ? '/' : '') + dec.decode(buf.subarray(s0, e)); break; }
    return { rec, tag };
  }
  const snip = (buf, p) => dec.decode(buf.subarray(Math.max(0, p - 12), Math.min(buf.length, p + 28))).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const countPair = (buf, a, b) => { let n = 0; for (let i = 0; i + 1 < buf.length; i++) if (buf[i] === a && buf[i + 1] === b) n++; return n; };

  // So sánh file gốc với file đã sửa: liệt kê thay đổi NOI_DUNG_SH và mọi khác biệt khác (nếu có)
  function compare(a, b, maxOther) {
    maxOther = maxOther || 50;
    const A = scan(a), B = scan(b);
    const bom = u => u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF;
    const res = { A, B, nds: [], other: [], otherCount: 0, structural: [], aligned: false,
      bomA: bom(a), bomB: bom(b), crlfA: countPair(a, 13, 10), crlfB: countPair(b, 13, 10), sizeA: a.length, sizeB: b.length };
    if (res.bomA !== res.bomB) res.structural.push(res.bomA ? 'File đã sửa bị MẤT ký tự BOM đầu file (thường do Notepad / trình soạn thảo lưu lại)' : 'File đã sửa bị THÊM ký tự BOM đầu file');
    if (res.crlfA !== res.crlfB) res.structural.push(`Kiểu xuống dòng bị đổi: gốc có ${res.crlfA} lần CRLF, file sửa có ${res.crlfB} (thường do trình soạn thảo lưu lại)`);
    const aligned = A.length === B.length && A.every((r, i) => r.cccd === B[i].cccd && r.nds && B[i].nds);
    res.aligned = aligned;
    if (aligned) {
      let pa = 0, pb = 0;
      const seg = (aE, bE) => {
        if (eqBytes(a, pa, aE, b, pb, bE)) return;
        res.otherCount++;
        if (res.other.length >= maxOther) return;
        let k = 0; const L = Math.min(aE - pa, bE - pb); while (k < L && a[pa + k] === b[pb + k]) k++;
        const c = context(a, A, pa + k);
        res.other.push({ rec: c.rec, tag: c.tag, at: pa + k, a: snip(a, pa + k), b: snip(b, pb + k) });
      };
      for (let i = 0; i < A.length; i++) {
        seg(A[i].nds.start, B[i].nds.start);
        if (A[i].nds.text !== B[i].nds.text) res.nds.push({ rec: A[i], old: A[i].nds.text, neu: B[i].nds.text });
        pa = A[i].nds.end; pb = B[i].nds.end;
      }
      seg(a.length, b.length);
    } else {
      if (A.length !== B.length) res.structural.push(`Số hồ sơ khác nhau: gốc ${A.length}, file sửa ${B.length}`);
      const mA = new Map(A.map(r => [r.cccd, r])), mB = new Map(B.map(r => [r.cccd, r]));
      const miss = A.filter(r => !mB.has(r.cccd)), add = B.filter(r => !mA.has(r.cccd));
      if (miss.length) res.structural.push(`${miss.length} hồ sơ có trong file gốc nhưng MẤT trong file sửa: ` + miss.slice(0, 10).map(r => r.ten + ' (' + r.cccd + ')').join('; '));
      if (add.length) res.structural.push(`${add.length} hồ sơ mới xuất hiện trong file sửa: ` + add.slice(0, 10).map(r => r.ten + ' (' + r.cccd + ')').join('; '));
      if (!miss.length && !add.length && A.length === B.length) res.structural.push('Thứ tự hồ sơ hoặc thẻ NOI_DUNG_SH bị thay đổi');
      for (const r of A) { const q = mB.get(r.cccd); if (q && r.nds && q.nds && r.nds.text !== q.nds.text) res.nds.push({ rec: r, old: r.nds.text, neu: q.nds.text }); }
    }
    res.onlyNds = aligned && res.otherCount === 0 && res.structural.length === 0;
    return res;
  }

  const api = { find, scan, applyPatches, verify, normCccd, normName, normLabel, compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
