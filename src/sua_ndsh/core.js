// ===== LÕI XỬ LÝ XML Ở MỨC BYTE — không parse/serialize, giữ nguyên 100% byte ngoài giá trị NOI_DUNG_SH và ANH_CHAN_DUNG được chọn sửa =====
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

  // Chỉ lấy vị trí (không giải mã chữ) — dùng cho ảnh base64 dài
  function tagRanges(buf, name, a, b) {
    const o = tagO(name), c = tagC(name), out = [];
    let p = a;
    while (true) {
      const s = find(buf, o, p, b);
      if (s < 0) break;
      const vs = s + o.length, e = find(buf, c, vs, b);
      if (e < 0) throw new Error('Thẻ <' + name + '> không có thẻ đóng tại byte ' + s);
      out.push({ start: vs, end: e });
      p = e + c.length;
    }
    return out;
  }
  const ANH = 'ANH_CHAN_DUNG';
  // Các vùng được phép sửa trong 1 hồ sơ, theo thứ tự trong file
  const fields = r => [r.nds ? ['nds', r.nds] : null, r.anh ? ['anh', r.anh] : null].filter(Boolean).sort((x, y) => x[1].start - y[1].start);

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
      const ngs = tagAll(buf, 'NGAY_SINH', s, e), gts = tagAll(buf, 'GIOI_TINH', s, e);   // chỉ đọc — để kiểm tra số CCCD
      const anh = tagRanges(buf, ANH, s, e);
      const r = {
        idx: recs.length, bs: s, be: e + T.close.length,
        cccd: cmt.length ? cmt[0].text.trim() : '',
        ten: ten.length ? ten[0].text.trim() : '',
        stt: stt.length ? stt[0].text.trim() : '',
        sbd: sbd.length ? sbd[0].text.trim() : '',
        khoa: khoa.length ? khoa[0].text.trim() : '',
        gplx: gplx.length ? gplx[0].text.trim() : '',
        ns: ngs.length ? ngs[0].text.trim() : '', gt: gts.length ? ({ M:'M', F:'F' })[gts[0].text.trim().toUpperCase()] || '' : '',
        nds: nds.length === 1 ? nds[0] : null,
        anh: anh.length === 1 && anh[0].end > anh[0].start ? anh[0] : null,
        anhErr: anh.length === 1 ? (anh[0].end > anh[0].start ? '' : 'Thẻ ảnh trống') : anh.length ? 'Có ' + anh.length + ' thẻ ' + ANH : 'Không có thẻ ảnh ' + ANH,
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

  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
  // patches: [{start,end,val,kind}] — kind 'nds' (mặc định): chuỗi chữ số; kind 'anh': base64 trên 1 dòng (đúng như file gốc)
  function applyPatches(buf, patches) {
    patches = patches.slice().sort((a, b) => a.start - b.start);
    const parts = []; let last = 0, total = 0;
    for (const pt of patches) {
      if ((pt.kind || 'nds') === 'nds') { if (!/^\d{1,3}$/.test(pt.val)) throw new Error('Giá trị mới không hợp lệ: ' + pt.val); }
      else if (pt.kind === 'anh') { if (typeof pt.val !== 'string' || pt.val.length < 100 || pt.val.length % 4 || !B64.test(pt.val)) throw new Error('Dữ liệu ảnh mới không phải base64 hợp lệ'); }
      else throw new Error('Loại sửa không hợp lệ');
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

  // Kiểm tra độc lập: quét lại file mới, so từng byte ngoài các vùng được sửa (NOI_DUNG_SH, ANH_CHAN_DUNG)
  // expect: Map idx -> mã NDSH mong đợi; expectAnh: Map idx -> chuỗi base64 ảnh mong đợi
  function verify(orig, out, expect, expectAnh) {
    expectAnh = expectAnh || new Map();
    const A = scan(orig), B = scan(out);
    const problems = [];
    if (A.length !== B.length) problems.push('Số hồ sơ khác nhau: gốc ' + A.length + ', mới ' + B.length);
    const n = Math.min(A.length, B.length);
    let changed = 0, changedAnh = 0;
    let pa = 0, pb = 0;
    for (let i = 0; i < n; i++) {
      const a = A[i], b = B[i];
      if (a.cccd !== b.cccd) problems.push('Hồ sơ #' + (i + 1) + ' CCCD lệch: ' + a.cccd + ' / ' + b.cccd);
      const fa = fields(a), fb = fields(b);
      if (fa.map(x => x[0]).join() !== fb.map(x => x[0]).join()) { problems.push('Hồ sơ #' + (i + 1) + ' thay đổi cấu trúc thẻ'); continue; }
      for (let k = 0; k < fa.length; k++) {
        const [kind, ra] = fa[k], rb = fb[k][1];
        if (!eqBytes(orig, pa, ra.start, out, pb, rb.start)) problems.push('Có byte khác ngoài vùng được sửa ở hồ sơ #' + (i + 1));
        if (kind === 'nds') {
          const want = expect.has(i) ? expect.get(i) : a.nds.text;
          if (b.nds.text !== want) problems.push('Hồ sơ #' + (i + 1) + ' (' + a.cccd + ') giá trị ' + b.nds.text + ' ≠ mong đợi ' + want);
          if (b.nds.text !== a.nds.text) changed++;
        } else {
          if (expectAnh.has(i)) {
            const w = enc(expectAnh.get(i));
            if (!eqBytes(w, 0, w.length, out, rb.start, rb.end)) problems.push('Hồ sơ #' + (i + 1) + ' (' + a.cccd + ') ảnh mới không đúng dữ liệu đã chuẩn bị');
            else changedAnh++;
          } else if (!eqBytes(orig, ra.start, ra.end, out, rb.start, rb.end)) problems.push('Hồ sơ #' + (i + 1) + ' (' + a.cccd + ') ảnh bị thay đổi ngoài ý muốn');
        }
        pa = ra.end; pb = rb.end;
      }
    }
    if (!eqBytes(orig, pa, orig.length, out, pb, out.length)) problems.push('Có byte khác ở phần cuối file');
    const bomA = orig[0] === 0xEF && orig[1] === 0xBB && orig[2] === 0xBF;
    const bomB = out[0] === 0xEF && out[1] === 0xBB && out[2] === 0xBF;
    if (bomA !== bomB) problems.push('BOM UTF-8 bị thay đổi');
    return { ok: problems.length === 0, problems, changed, changedAnh, records: B.length };
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

  /* Kiểm tra số CCCD có dấu hiệu sai — cùng quy tắc TOOLS BC1+BC2+SBD / Sổ Sát Hạch A1 */
  const PROV = new Set('001 002 004 006 008 010 011 012 014 015 017 019 020 022 024 025 026 027 030 031 033 034 035 036 037 038 040 042 044 045 046 048 049 051 052 054 056 058 060 062 064 066 067 068 070 072 074 075 077 079 080 082 083 084 086 087 089 091 092 093 094 095 096'.split(' '));
  function cccdIssues(id, ns, gt) {
    id = String(id || ''); if (/^\d{9}$/.test(id)) return [];
    if (!/^\d{12}$/.test(id)) return ['CCCD không đủ 12 số'];
    const out = [];
    if (!PROV.has(id.slice(0, 3))) out.push('mã tỉnh “' + id.slice(0, 3) + '” không tồn tại');
    if (!'0123'.includes(id[3])) { out.push('số thứ 4 là “' + id[3] + '” (chỉ có 0–3)'); return out; }
    const yr = (+id[3] < 2 ? 1900 : 2000) + +id.slice(4, 6), m = String(ns || '').match(/(19|20)\d{2}/), dy = m ? m[0] : '', now = new Date().getFullYear();
    if (yr > now) out.push('số CCCD cho năm sinh ' + yr + ' (không hợp lý)' + (dy ? ', dữ liệu ghi năm ' + dy : ''));
    else if (dy && +dy !== yr) out.push('năm sinh theo CCCD là ' + yr + ', dữ liệu ghi năm ' + dy);
    const g = (+id[3]) % 2 === 0 ? 'M' : 'F';
    if (gt && gt !== g) out.push('giới tính theo CCCD là ' + (g === 'M' ? 'Nam' : 'Nữ') + ' (số thứ 4 là “' + id[3] + '”), dữ liệu ghi ' + (gt === 'M' ? 'Nam' : 'Nữ'));
    return out;
  }
  function ccNear(a, b) { if (!a || !b || a.length !== b.length || a === b) return 0; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 2) return 0; return d; }

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
    const res = { A, B, nds: [], anh: [], other: [], otherCount: 0, structural: [], aligned: false,
      bomA: bom(a), bomB: bom(b), crlfA: countPair(a, 13, 10), crlfB: countPair(b, 13, 10), sizeA: a.length, sizeB: b.length };
    if (res.bomA !== res.bomB) res.structural.push(res.bomA ? 'File đã sửa bị MẤT ký tự BOM đầu file (thường do Notepad / trình soạn thảo lưu lại)' : 'File đã sửa bị THÊM ký tự BOM đầu file');
    if (res.crlfA !== res.crlfB) res.structural.push(`Kiểu xuống dòng bị đổi: gốc có ${res.crlfA} lần CRLF, file sửa có ${res.crlfB} (thường do trình soạn thảo lưu lại)`);
    const aligned = A.length === B.length && A.every((r, i) => r.cccd === B[i].cccd && r.nds && B[i].nds && fields(r).map(x => x[0]).join() === fields(B[i]).map(x => x[0]).join());
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
        const fa = fields(A[i]), fb = fields(B[i]);
        for (let k = 0; k < fa.length; k++) {
          const [kind, ra] = fa[k], rb = fb[k][1];
          seg(ra.start, rb.start);
          if (kind === 'nds') { if (A[i].nds.text !== B[i].nds.text) res.nds.push({ rec: A[i], old: A[i].nds.text, neu: B[i].nds.text }); }
          else if (!eqBytes(a, ra.start, ra.end, b, rb.start, rb.end)) res.anh.push({ rec: A[i], recB: B[i], a: ra, b: rb });
          pa = ra.end; pb = rb.end;
        }
      }
      seg(a.length, b.length);
    } else {
      if (A.length !== B.length) res.structural.push(`Số hồ sơ khác nhau: gốc ${A.length}, file sửa ${B.length}`);
      const mA = new Map(A.map(r => [r.cccd, r])), mB = new Map(B.map(r => [r.cccd, r]));
      const miss = A.filter(r => !mB.has(r.cccd)), add = B.filter(r => !mA.has(r.cccd));
      if (miss.length) res.structural.push(`${miss.length} hồ sơ có trong file gốc nhưng MẤT trong file sửa: ` + miss.slice(0, 10).map(r => r.ten + ' (' + r.cccd + ')').join('; '));
      if (add.length) res.structural.push(`${add.length} hồ sơ mới xuất hiện trong file sửa: ` + add.slice(0, 10).map(r => r.ten + ' (' + r.cccd + ')').join('; '));
      if (!miss.length && !add.length && A.length === B.length) res.structural.push('Thứ tự hồ sơ hoặc thẻ NOI_DUNG_SH bị thay đổi');
      for (const r of A) { const q = mB.get(r.cccd); if (q && r.nds && q.nds && r.nds.text !== q.nds.text) res.nds.push({ rec: r, old: r.nds.text, neu: q.nds.text });
        if (q && r.anh && q.anh && !eqBytes(a, r.anh.start, r.anh.end, b, q.anh.start, q.anh.end)) res.anh.push({ rec: r, recB: q, a: r.anh, b: q.anh }); }
    }
    res.onlyAllowed = aligned && res.otherCount === 0 && res.structural.length === 0;   // chỉ khác ở NOI_DUNG_SH và/hoặc ảnh
    res.onlyNds = res.onlyAllowed && res.anh.length === 0;
    return res;
  }

  // base64 nhanh cho dữ liệu lớn (ảnh)
  function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64')); }
  function fromB64(buf, r) { const s = dec.decode(buf.subarray(r.start, r.end)).trim(); if (typeof atob === 'function') { const t = atob(s), o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i); return o; } return new Uint8Array(Buffer.from(s, 'base64')); }

  const api = { find, scan, applyPatches, verify, normCccd, normName, normLabel, compare, cccdIssues, ccNear, toB64, fromB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
