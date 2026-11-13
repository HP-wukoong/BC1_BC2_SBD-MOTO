/* ===== ẢNH CHÂN DUNG (thẻ <ANH_CHAN_DUNG>) — xem, soát, thay từng người / hàng loạt =====
   Bộ JPEG 2000: OpenJPEG 2.5.2 biên dịch WebAssembly (src/sua_ndsh/jp2), chạy trong luồng nền (Web Worker) để giao diện luôn mượt.
   Ảnh mới ghi theo SỐ ĐÔNG ảnh trong file: định dạng, wavelet, tỷ lệ nén, số mức, khối mã… lấy từ chính file XML đang mở. */
const JP2_WASM_B64 = '/*JP2WASM*/';

/* ---------- Bộ nạp JP2 WASM (dùng chung cho luồng nền và luồng chính) ---------- */
function makeJP2(bytes){
  let mem = null;
  const wasi = { fd_close:()=>0, environ_get:()=>0, environ_sizes_get:(a,b)=>{ const v=new DataView(mem.buffer); v.setUint32(a,0,true); v.setUint32(b,0,true); return 0; },
    fd_fdstat_get:()=>8, fd_seek:()=>70, fd_write:(fd,iov,n,nw)=>{ const v=new DataView(mem.buffer); let t=0; for(let i=0;i<n;i++) t+=v.getUint32(iov+8*i+4,true); v.setUint32(nw,t,true); return 0; },
    proc_exit:(c)=>{ throw new Error('proc_exit '+c); } };
  const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), { wasi_snapshot_preview1: wasi });
  const X = inst.exports; mem = X.memory; X._initialize();
  const cstr = p => { const u=new Uint8Array(mem.buffer); let e=p; while(u[e]) e++; return new TextDecoder().decode(u.subarray(p,e)); };
  return {
    decode(data){ const p=X.xalloc(data.length); new Uint8Array(mem.buffer).set(data,p); const rc=X.jp2_decode(p,data.length); X.xfree(p);
      if (rc) throw new Error('Giải mã JPEG 2000 lỗi: '+(cstr(X.last_error())||rc));
      const w=X.dec_info(0), h=X.dec_info(1);
      return { w, h, nc:X.dec_info(2), reversible:!!X.dec_info(3), levels:X.dec_info(4), layers:X.dec_info(5), prog:X.dec_info(6), cb:X.dec_info(7), mct:X.dec_info(8),
        rgba: new Uint8ClampedArray(mem.buffer.slice(X.dec_ptr(), X.dec_ptr()+w*h*4)) }; },
    encode(rgb, w, h, nc, ratio, levels, reversible, mct){ const p=X.xalloc(rgb.length); new Uint8Array(mem.buffer).set(rgb,p);
      const rc=X.jp2_encode(p,w,h,nc,ratio,levels,reversible?1:0,mct?1:0); X.xfree(p);
      if (rc) throw new Error('Mã hóa JPEG 2000 lỗi: '+(cstr(X.last_error())||rc));
      return new Uint8Array(mem.buffer.slice(X.enc_ptr(), X.enc_ptr()+X.enc_len())); } };
}

/* ---------- Mã chạy trong luồng nền ---------- */
function photoWorkerMain(self){
  let J = null;
  const isJ2 = b => (b.length > 12 && b[4]===0x6A && b[5]===0x50 && b[6]===0x20 && b[7]===0x20) || (b[0]===0xFF && b[1]===0x4F);
  async function toImg(bytes){
    if (isJ2(bytes)) { const r = J.decode(bytes); return { w:r.w, h:r.h, nc:r.nc, rgba:r.rgba, jp2:{ rev:r.reversible, levels:r.levels, layers:r.layers, prog:r.prog, cb:r.cb, mct:r.mct } }; }
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); bmp.close();
    return { w:c.width, h:c.height, nc:3, rgba:g.getImageData(0, 0, c.width, c.height).data, jp2:null };
  }
  function stats(im){
    const { w, h, rgba } = im; let s = 0, s2 = 0, n = 0;
    const step = Math.max(1, Math.floor(Math.sqrt(w * h / 40000)));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4, l = 0.299 * rgba[i] + 0.587 * rgba[i+1] + 0.114 * rgba[i+2]; s += l; s2 += l * l; n++; }
    const mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    // Dấu ảnh 24×32 (xám, chuẩn hóa độ sáng/tương phản) — để phát hiện CÙNG MỘT TẤM ẢNH dùng cho 2 người
    // (đo trên file PC-08 596 ảnh: cùng ảnh nén lại ≈ 0,01; hai người khác nhau giống nhất ≈ 0,14 → ngưỡng 0,06)
    const FW = 24, FH = 32, f = new Float32Array(FW * FH);
    for (let gy = 0; gy < FH; gy++) for (let gx = 0; gx < FW; gx++) {
      const x0 = Math.floor(gx * w / FW), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / FW)), y0 = Math.floor(gy * h / FH), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / FH));
      let a = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; a += 0.299 * rgba[i] + 0.587 * rgba[i+1] + 0.114 * rgba[i+2]; k++; }
      f[gy * FW + gx] = a / Math.max(1, k); }
    let fm = 0; for (let i = 0; i < f.length; i++) fm += f[i]; fm /= f.length;
    let fs = 0; for (let i = 0; i < f.length; i++) fs += (f[i] - fm) ** 2; fs = Math.sqrt(fs / f.length) + 1e-6;
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - fm) / fs;
    return { mean, std, feat: f };
  }
  async function toJpeg(im, q){
    const t = new OffscreenCanvas(im.w, im.h); t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.rgba), im.w, im.h), 0, 0);
    const c = new OffscreenCanvas(im.w, im.h), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, im.w, im.h); g.drawImage(t, 0, 0);   // ảnh 4 kênh: nền trắng
    return await c.convertToBlob({ type:'image/jpeg', quality:q });
  }
  function psnr(a, rgba){ let se = 0; const n = a.length / 3; for (let i = 0, j = 0; i < a.length; i += 3, j += 4) { const d0 = a[i]-rgba[j], d1 = a[i+1]-rgba[j+1], d2 = a[i+2]-rgba[j+2]; se += d0*d0 + d1*d1 + d2*d2; } const mse = se / (n * 3); return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse); }
  self.onmessage = async e => {
    const m = e.data;
    if (m.op === 'init') { try { J = makeJP2(new Uint8Array(m.wasm)); self.postMessage({ id:m.id, ok:true }); } catch(err){ self.postMessage({ id:m.id, ok:false, err:String(err && err.message || err) }); } return; }
    try {
      if (m.op === 'decode') {
        const im = await toImg(new Uint8Array(m.bytes)); const st = stats(im);
        const blob = await toJpeg(im, m.q || 0.9);
        self.postMessage({ id:m.id, ok:true, w:im.w, h:im.h, nc:im.nc, jp2:im.jp2, mean:st.mean, std:st.std, feat:st.feat, blob }, [st.feat.buffer]);
      } else if (m.op === 'rgba') {
        const im = await toImg(new Uint8Array(m.bytes)); self.postMessage({ id:m.id, ok:true, w:im.w, h:im.h, rgba:im.rgba }, [im.rgba.buffer]);
      } else if (m.op === 'encode') {
        const rgb = new Uint8Array(m.rgb), P = m.prof; let bytes, chk;
        if (P.fmt === 'JP2') {
          bytes = J.encode(rgb, m.w, m.h, 3, P.ratio, P.levels, P.rev, P.mct);
          const r = J.decode(bytes);   // giải mã lại để kiểm tra
          chk = { w:r.w, h:r.h, nc:r.nc, rev:r.reversible, levels:r.levels, layers:r.layers, prog:r.prog, cb:r.cb, mct:r.mct, psnr:psnr(rgb, r.rgba) };
        } else {   // số đông là JPEG: chọn chất lượng để dung lượng gần trung vị ảnh trong file
          const im = { w:m.w, h:m.h, rgba:new Uint8ClampedArray(m.w * m.h * 4) }; for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { im.rgba[j]=rgb[i]; im.rgba[j+1]=rgb[i+1]; im.rgba[j+2]=rgb[i+2]; im.rgba[j+3]=255; }
          let lo = 0.5, hi = 0.97, best = null;
          for (let k = 0; k < 7; k++) { const q = (lo + hi) / 2, b = await toJpeg(im, q); if (b.size <= P.target) { best = b; lo = q; } else hi = q; }
          if (!best) best = await toJpeg(im, 0.5);
          bytes = new Uint8Array(await best.arrayBuffer());
          const back = await toImg(bytes); chk = { w:back.w, h:back.h, nc:3, psnr:psnr(rgb, back.rgba) };
        }
        const prev = await toJpeg(await toImg(bytes), 0.9);
        self.postMessage({ id:m.id, ok:true, bytes, chk, prev }, [bytes.buffer]);
      } else if (m.op === 'jpeg') {
        const im = await toImg(new Uint8Array(m.bytes)); self.postMessage({ id:m.id, ok:true, blob: await toJpeg(im, m.q || 0.95) });
      } else throw new Error('lệnh lạ ' + m.op);
    } catch(err){ self.postMessage({ id:m.id, ok:false, err:String(err && err.message || err) }); }
  };
}

/* ---------- Điều phối luồng nền (2 luồng, ưu tiên ảnh đang hiện trên màn hình) ---------- */
const ENG = { ws:[], q:[], cb:new Map(), seq:0, mode:'', wasm:null, ready:null };
function engWasm(){ if (!ENG.wasm) { const s = atob(JP2_WASM_B64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); ENG.wasm = u; } return ENG.wasm; }
function engStart(){
  if (ENG.ready) return ENG.ready;
  ENG.ready = (async () => {
    const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
    const src = makeJP2.toString() + '\n(' + photoWorkerMain.toString() + ')(self);';
    try {
      const url = URL.createObjectURL(new Blob([src], { type:'text/javascript' }));
      for (let i = 0; i < n; i++) { const w = new Worker(url); w.busy = false; w.onmessage = e => engDone(w, e.data); w.onerror = ev => { ev.preventDefault(); }; ENG.ws.push(w); }
      await Promise.all(ENG.ws.map(w => new Promise((res, rej) => { const id = ++ENG.seq; ENG.cb.set(id, { res, rej }); w.busy = true; w.postMessage({ op:'init', id, wasm: engWasm().buffer.slice(0) }); setTimeout(() => rej(new Error('luồng nền không phản hồi')), 15000); })));
      ENG.mode = 'worker';
    } catch(e) {
      // Trình duyệt chặn luồng nền → chạy trên luồng chính (vẫn đúng, chậm hơn)
      ENG.ws.forEach(w => { try { w.terminate(); } catch(_){} }); ENG.ws = [];
      const fake = { busy:false, postMessage(m){ setTimeout(() => this.onmessage({ data:m }), 0); } };
      const self = { postMessage: d => setTimeout(() => engDone(fakeW, d), 0) }, fakeW = { busy:false, postMessage: m => { setTimeout(() => self.onmessage({ data:m }), 0); } };
      photoWorkerMain(self); fakeW.busy = true;
      await new Promise((res, rej) => { const id = ++ENG.seq; ENG.cb.set(id, { res, rej }); fakeW.postMessage({ op:'init', id, wasm: engWasm().buffer.slice(0) }); });
      ENG.ws = [fakeW]; ENG.mode = 'main'; void fake;
    }
  })();
  return ENG.ready;
}
function engDone(w, d){ w.busy = false; const c = ENG.cb.get(d.id); ENG.cb.delete(d.id); if (c) { if (d.ok) c.res(d); else c.rej(new Error(d.err || 'lỗi xử lý ảnh')); } engPump(); }
function engPump(){ for (const w of ENG.ws) { if (w.busy || !ENG.q.length) continue; const j = ENG.q.shift(); w.busy = true; ENG.cb.set(j.id, j); try { w.postMessage(j.msg, j.tr || []); } catch(e){ w.busy = false; ENG.cb.delete(j.id); j.rej(e); } } }
async function eng(op, payload, prio, tr){
  await engStart();
  return new Promise((res, rej) => { const id = ++ENG.seq, j = { id, res, rej, prio: prio || 5, msg: Object.assign({ op, id }, payload), tr };
    let i = ENG.q.findIndex(x => x.prio > j.prio); if (i < 0) i = ENG.q.length; ENG.q.splice(i, 0, j); engPump(); });
}
function engBump(pred, prio){ let ch = false; ENG.q.forEach(j => { if (pred(j) && j.prio > prio) { j.prio = prio; ch = true; } }); if (ch) ENG.q.sort((a, b) => a.prio - b.prio); }

/* ---------- Đọc thông số ảnh từ phần đầu (không cần giải mã) ---------- */
function photoHead(b){
  if (!b || b.length < 12) return { fmt:'?' };
  const u16 = i => (b[i] << 8) | b[i+1], u32 = i => ((b[i] << 24) >>> 0) + (b[i+1] << 16) + (b[i+2] << 8) + b[i+3];
  if ((b[4] === 0x6A && b[5] === 0x50) || (b[0] === 0xFF && b[1] === 0x4F)) {
    let i = 0, end = Math.min(b.length - 4, 4096); while (i < end && !(b[i] === 0xFF && b[i+1] === 0x51)) i++;
    if (i >= end) return { fmt:'JP2' };
    // SIZ: FF51 Lsiz Rsiz Xsiz Ysiz XOsiz YOsiz XTsiz YTsiz XTOsiz YTOsiz Csiz
    const o = { fmt:'JP2', w: u32(i+6) - u32(i+14), h: u32(i+10) - u32(i+18), nc: u16(i+38) };
    let k = i; while (k < end && !(b[k] === 0xFF && b[k+1] === 0x52)) k++;
    if (k < end) { o.prog = b[k+5]; o.layers = u16(k+6); o.mct = b[k+8]; o.levels = b[k+9]; o.cb = 1 << (b[k+10] + 2); o.rev = b[k+13] === 1; }
    return o;
  }
  if (b[0] === 0xFF && b[1] === 0xD8) { let i = 2; while (i + 9 < b.length) { if (b[i] !== 0xFF) break; const mk = b[i+1], L = u16(i+2); if (mk >= 0xC0 && mk <= 0xC3) return { fmt:'JPEG', w: u16(i+7), h: u16(i+5), nc: b[i+9] }; i += 2 + L; } return { fmt:'JPEG' }; }
  if (b[0] === 0x89 && b[1] === 0x50) return { fmt:'PNG', w: u32(16), h: u32(20) };
  return { fmt:'?' };
}
function b64Head(buf, r, nChars){ const n = Math.min(r.end - r.start, nChars - nChars % 4); const s = new TextDecoder().decode(buf.subarray(r.start, r.start + n)); const t = atob(s), o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i); return o; }
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const majority = a => { const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let b = null, n = -1; m.forEach((v, k) => { if (v > n) { n = v; b = k; } }); return b; };

/* ---------- Trạng thái ảnh ---------- */
const PH = { info:new Map(), thumb:new Map(), pending:new Map(), prof:null, issues:new Map(), audit:{ running:false, done:0, total:0, gen:0 }, filter:'all', q:'', tray:[], dir:null, dirFiles:[], built:false, io:null };
function phReset(){
  PH.thumb.forEach(t => t.url && URL.revokeObjectURL(t.url)); PH.pending.forEach(p => p.url && URL.revokeObjectURL(p.url));
  PH.tray.forEach(t => t.url && URL.revokeObjectURL(t.url));
  PH.info.clear(); PH.thumb.clear(); PH.pending.clear(); PH.issues.clear(); PH.tray = []; PH.prof = null; PH.built = false; PH.audit = { running:false, done:0, total:0, gen:PH.audit.gen + 1 };
  ENG.q.splice(0).forEach(j => j.rej(new Error('huỷ')));
}
function phBytes(idx){ const r = PD.recs[idx]; return r && r.anh ? XCore.fromB64(PD.xml, r.anh) : null; }
function phOnXml(){
  phReset();
  for (const r of PD.recs) { if (!r.anh) { PH.info.set(r.idx, { fmt:'—', err: r.anhErr }); continue; }
    try { const h = photoHead(b64Head(PD.xml, r.anh, 4096)); h.size = Math.floor((r.anh.end - r.anh.start) * 3 / 4) - (PD.xml[r.anh.end - 1] === 61 ? 1 : 0) - (PD.xml[r.anh.end - 2] === 61 ? 1 : 0); PH.info.set(r.idx, h); }
    catch(e){ PH.info.set(r.idx, { fmt:'?', err:'Dữ liệu ảnh không phải base64 hợp lệ' }); } }
  PH.prof = phProfile();
  phRenderAll();
}
// Thông số ảnh mới = SỐ ĐÔNG ảnh trong file đang mở
function phProfile(){
  const all = Array.from(PH.info.values()).filter(x => x.fmt === 'JP2' || x.fmt === 'JPEG');
  if (!all.length) return null;
  const fmt = majority(all.map(x => x.fmt)), grp = all.filter(x => x.fmt === fmt && x.w && x.h);
  const P = { fmt, n: grp.length, total: all.length, w: majority(grp.map(x => x.w)), h: majority(grp.map(x => x.h)) };
  if (fmt === 'JP2') {
    const ok = grp.filter(x => x.nc && x.size);
    P.ratio = Math.round(median(ok.map(x => x.w * x.h * x.nc / x.size)) * 10) / 10 || 10;
    P.levels = majority(ok.map(x => x.levels)) ?? 5; P.rev = majority(ok.map(x => !!x.rev)) ?? true; P.layers = majority(ok.map(x => x.layers)) ?? 1;
    P.cb = majority(ok.map(x => x.cb)) ?? 64; P.mct = majority(ok.map(x => x.mct)) ?? 0; P.prog = majority(ok.map(x => x.prog)) ?? 0;
    const n3 = ok.filter(x => x.nc === 3).map(x => x.size); P.minSize = n3.length ? Math.min(...n3) : 0; P.maxSize = n3.length ? Math.max(...n3) : 0; P.nSame = ok.filter(x => !!x.rev === P.rev && x.levels === P.levels && x.layers === P.layers && x.cb === P.cb).length;
  } else { P.target = median(grp.map(x => x.size)) || 40000; }
  return P;
}
const profTxt = P => !P ? 'Chưa có ảnh mẫu trong file' : P.fmt === 'JP2'
  ? `JPEG 2000 · wavelet ${P.rev ? '5/3' : '9/7'} · tỷ lệ nén ${P.ratio}:1 · ${P.levels} mức · ${P.layers} lớp · khối ${P.cb}×${P.cb} · ${P.mct ? 'có' : 'không'} biến đổi màu · cỡ ${P.w}×${P.h} — theo ${P.nSame}/${P.n} ảnh JPEG 2000 trong file`
  : `JPEG · cỡ ${P.w}×${P.h} · khoảng ${Math.round(P.target / 1024)} KB — theo ${P.n}/${P.total} ảnh JPEG trong file`;

/* ---------- Giải mã ảnh để xem / soát ---------- */
function phThumb(idx, prio){
  const t = PH.thumb.get(idx); if (t) { if (t.p && prio < 5) engBump(j => j.msg.idx === idx, prio); return t.p || Promise.resolve(t); }
  const bytes = phBytes(idx); if (!bytes) return Promise.resolve(null);
  const rec = { p:null };
  rec.p = eng('decode', { bytes: bytes.buffer, idx, q:0.9 }, prio, [bytes.buffer]).then(d => {
    const o = { url: URL.createObjectURL(d.blob), w:d.w, h:d.h, nc:d.nc, jp2:d.jp2, mean:d.mean, std:d.std, feat:d.feat };
    PH.thumb.set(idx, o); phCardImg(idx); return o;
  }).catch(e => { const o = { err: e.message === 'huỷ' ? '' : e.message }; if (o.err) { PH.thumb.set(idx, o); phCardImg(idx); } return o; });
  PH.thumb.set(idx, rec); return rec.p;
}
async function phAudit(){
  if (PH.audit.running || !PD.xml) return; const gen = PH.audit.gen;
  const ids = PD.recs.filter(r => r.anh).map(r => r.idx); PH.audit = { running:true, done:0, total:ids.length, gen };
  phAuditInfo(); const t0 = performance.now();
  await Promise.all(ids.map(i => phThumb(i, 6).then(() => { if (PH.audit.gen === gen) { PH.audit.done++; if (PH.audit.done % 20 === 0) phAuditInfo(); } })));
  if (PH.audit.gen !== gen) return;
  PH.audit.running = false; PH.audit.ms = performance.now() - t0; phComputeIssues(); phAuditInfo(); phApplyFilter();
}
function phComputeIssues(){
  PH.issues.clear(); const add = (i, s) => { if (!PH.issues.has(i)) PH.issues.set(i, []); PH.issues.get(i).push(s); };
  const byHash = new Map(), list = [];
  for (const r of PD.recs) {
    const inf = PH.info.get(r.idx) || {}, t = PH.thumb.get(r.idx);
    if (inf.err) { add(r.idx, inf.err); continue; }
    if (!t || t.err) { add(r.idx, 'Ảnh hỏng, không đọc được' + (t && t.err ? ' (' + t.err + ')' : '')); continue; }
    if (t.w < 300 || t.h < 400) add(r.idx, `Ảnh nhỏ ${t.w}×${t.h}px`);
    if (Math.abs(t.w / t.h - 0.75) > 0.03) add(r.idx, `Sai tỷ lệ 3:4 (${t.w}×${t.h})`);
    if (t.std < 8) add(r.idx, 'Ảnh trống / gần như một màu');
    else if (t.mean < 50) add(r.idx, 'Ảnh quá tối');
    else if (t.mean > 238) add(r.idx, 'Ảnh quá sáng / bạc màu');
    const k = PD.xml.subarray(r.anh.start, Math.min(r.anh.end, r.anh.start + 200)).join(',') + ':' + (r.anh.end - r.anh.start);
    if (byHash.has(k)) { const o = byHash.get(k); if (phSameB64(o.anh, r.anh)) { add(r.idx, 'Trùng hệt ảnh của ' + o.ten + ' (' + o.cccd + ')'); add(o.idx, 'Trùng hệt ảnh của ' + r.ten + ' (' + r.cccd + ')'); continue; } }
    byHash.set(k, r); if (t.feat) list.push([r, t.feat]);
  }
  // cùng một tấm ảnh (dữ liệu khác nhau do nén lại / đổi cỡ) dùng cho 2 người
  const TH = 0.06, n = list.length ? list[0][1].length : 0, lim = TH * n;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i][1], b = list[j][1]; let d = 0; for (let k = 0; k < n && d <= lim; k++) d += Math.abs(a[k] - b[k]);
    if (d <= lim) { add(list[i][0].idx, 'Có thể cùng ảnh với ' + list[j][0].ten + ' (' + list[j][0].cccd + ')'); add(list[j][0].idx, 'Có thể cùng ảnh với ' + list[i][0].ten + ' (' + list[i][0].cccd + ')'); }
  }
}
function phSameB64(a, b){ if (a.end - a.start !== b.end - b.start) return false; for (let i = 0; i < a.end - a.start; i++) if (PD.xml[a.start + i] !== PD.xml[b.start + i]) return false; return true; }

/* ---------- Giao diện tab ảnh ---------- */
const deaccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
function phRenderAll(){
  const box = $('#phGrid'); if (!box) return;
  $('#phEmpty').classList.toggle('hide', !!PD.xml); $('#phMain').classList.toggle('hide', !PD.xml);
  if (!PD.xml) { box.innerHTML = ''; return; }
  $('#phProf').textContent = profTxt(PH.prof);
  box.innerHTML = PD.recs.map(r => { const inf = PH.info.get(r.idx) || {};
    return `<div class="pcard" data-i="${r.idx}" tabindex="0" title="Bấm để thay ảnh · hoặc kéo thả ảnh vào đây">
      <div class="pimg"><img alt="" draggable="false"><span class="pnew hide">MỚI</span><span class="pload">…</span></div>
      <div class="pnm">${esc(r.ten)}</div><div class="psub">SBD ${esc(r.sbd || '—')} · ${esc(r.cccd)}</div>
      <div class="psub"><span class="pfmt">${esc(inf.fmt || '?')}${inf.w ? ' ' + inf.w + '×' + inf.h : ''}${inf.size ? ' · ' + Math.round(inf.size / 1024) + ' KB' : ''}</span></div>
      <div class="piss"></div></div>`; }).join('');
  if (PH.io) PH.io.disconnect();
  PH.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const i = +e.target.dataset.i; if (!PH.thumb.get(i) || PH.thumb.get(i).p) phThumb(i, 1); } }), { root:null, rootMargin:'300px' });
  $$('#phGrid .pcard').forEach(c => PH.io.observe(c));
  PH.built = true; phApplyFilter(); phPendingBar(); phTray();
}
function phCardImg(idx){
  const c = document.querySelector(`#phGrid .pcard[data-i="${idx}"]`); if (!c) return;
  const p = PH.pending.get(idx), t = PH.thumb.get(idx), img = c.querySelector('img');
  const url = p ? p.url : (t && t.url) || '';
  if (url && img.getAttribute('src') !== url) img.src = url;
  c.querySelector('.pload').classList.toggle('hide', !!url || !!(t && t.err));
  c.querySelector('.pnew').classList.toggle('hide', !p); c.classList.toggle('chg', !!p);
  const iss = PH.issues.get(idx) || (t && t.err ? ['Ảnh hỏng, không đọc được'] : []);
  c.classList.toggle('bad', !!iss.length); c.querySelector('.piss').innerHTML = iss.slice(0, 2).map(s => `<span>${esc(s)}</span>`).join('');
  if (p) c.querySelector('.pfmt').textContent = `Ảnh mới ${p.chk.w}×${p.chk.h} · ${Math.round(p.bytes.length / 1024)} KB`;
}
function phApplyFilter(){
  if (!PH.built) return; const q = deaccent(PH.q).toUpperCase().trim(); let n = 0;
  const cnt = { all:PD.recs.length, bad:0, chg:PH.pending.size };
  PH.issues.forEach(v => { if (v.length) cnt.bad++; });
  $$('#phGrid .pcard').forEach(c => { const i = +c.dataset.i, r = PD.recs[i];
    let ok = PH.filter === 'all' || (PH.filter === 'bad' ? (PH.issues.get(i) || []).length > 0 : PH.pending.has(i));
    if (ok && q) ok = deaccent(r.ten).toUpperCase().includes(q) || r.cccd.includes(q) || String(r.sbd).includes(q);
    c.style.display = ok ? '' : 'none'; if (ok) n++; phCardImg(i); });
  $('#phChips').innerHTML = [['all','Tất cả'],['bad','Có vấn đề'],['chg','Đã chọn thay ảnh']].map(([k, t]) => `<span class="chip ${k === 'bad' ? 'c-bad' : k === 'chg' ? 'c-chg' : ''} ${PH.filter === k ? 'on' : ''}" data-f="${k}">${t}<b>${cnt[k]}</b></span>`).join('') + `<span class="small" style="align-self:center">Đang hiện ${n}</span>`;
  $$('#phChips .chip').forEach(c => c.onclick = () => { PH.filter = c.dataset.f; phApplyFilter(); });
}
function phAuditInfo(){
  const a = PH.audit, el = $('#phAudit'); if (!el) return;
  if (a.running) el.innerHTML = `<span class="st-warn">Đang soát ảnh ${a.done}/${a.total}…</span>`;
  else if (a.total) { let bad = 0; PH.issues.forEach(v => { if (v.length) bad++; }); el.innerHTML = bad ? `<span class="st-bad">Soát xong ${a.total} ảnh: ${bad} ảnh có vấn đề</span> — bấm “Có vấn đề” để xem` : `<span class="st-ok">Soát xong ${a.total} ảnh: không có vấn đề</span>`; el.innerHTML += ` <span class="small">(${(a.ms / 1000).toFixed(1)} giây${ENG.mode === 'main' ? ', chạy luồng chính' : ''})</span>`; }
  else el.textContent = '';
}
function phPendingBar(){
  const n = PH.pending.size, b = $('#phBar'); if (!b) return;
  b.classList.toggle('hide', !n);
  if (typeof xtBtn === 'function') xtBtn();
  if (!n) { b.innerHTML = ''; return; }
  const th = PD.kind === 'thuong';
  b.innerHTML = `<b>Đã chọn thay ảnh cho ${n} người.</b> ` + (th
    ? 'Ảnh chưa ghi vào file — bấm <b>Xuất XML</b> để tạo file mới (chỉ thay ảnh), kiểm định từng byte rồi tải về.'
    : 'Ảnh chưa ghi vào file — bấm <b>Xuất XML</b> để tạo file mới ở mục ① (đổi mã NDSH, nếu có, được ghi cùng lúc).') +
    ` <button class="btn sm" id="phGo">Xuất XML</button> <button class="btn sec sm" id="phClear">Bỏ tất cả ảnh mới</button>`;
  $('#phGo').onclick = () => {
    if (th) { $('#phOut').scrollIntoView({ behavior:'smooth', block:'start' }); xtRun(); return; }
    $$('nav.tabs button').find(x => x.dataset.tab === 'fix').click(); build();
    setTimeout(() => { $('#cardOut').scrollIntoView({ behavior:'smooth' }); if (!$('#bRun').disabled) $('#bRun').click(); }, 50);
  };
  $('#phClear').onclick = () => dialog(`<h2>Bỏ tất cả ${n} ảnh mới?</h2><p>File XML không bị ảnh hưởng (chưa ghi gì).</p>`, () => { PH.pending.forEach(p => URL.revokeObjectURL(p.url)); PH.pending.clear(); phApplyFilter(); phPendingBar(); phChanged(); }, 'Bỏ hết');
}

/* ---------- Chuẩn bị ảnh mới: cắt khung đúng cỡ ảnh cũ, mã hóa theo số đông ---------- */
async function phBitmap(file){
  const b = new Uint8Array(await file.arrayBuffer());
  const h = photoHead(b);
  if (h.fmt === 'JP2') { const d = await eng('rgba', { bytes: b.buffer.slice(0) }, 1); return await createImageBitmap(new ImageData(new Uint8ClampedArray(d.rgba), d.w, d.h)); }
  return await createImageBitmap(new Blob([b], { type: file.type || 'image/jpeg' }));
}
function phTarget(idx){ const t = PH.thumb.get(idx), inf = PH.info.get(idx) || {}; const w = (t && t.w) || inf.w || (PH.prof && PH.prof.w) || 353, h = (t && t.h) || inf.h || (PH.prof && PH.prof.h) || 471; return { w, h }; }
// Khung cắt: ảnh gần đúng cỡ (lệch ≤ 8px) → cắt giữa, KHÔNG co giãn; ngược lại phóng vừa khung (cover)
function phCropInit(bw, bh, W, H){ const exact = bw >= W && bh >= H && bw - W <= 8 && bh - H <= 8; const base = exact ? 1 : Math.max(W / bw, H / bh); return { base, zoom:1, cx:0.5, cy:0.5, exact }; }
function phDraw(ctx, bmp, W, H, cr){
  const s = cr.base * cr.zoom, dw = bmp.width * s, dh = bmp.height * s;
  let x = (W - dw) * cr.cx, y = (H - dh) * cr.cy; if (cr.exact && cr.zoom === 1) { x = Math.round(x); y = Math.round(y); }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (cr.exact && cr.zoom === 1) ctx.drawImage(bmp, -x < 0 ? 0 : -x, -y < 0 ? 0 : -y, W, H, 0, 0, W, H); else ctx.drawImage(bmp, x, y, dw, dh);
}
async function phPrepare(idx, bmp, cr, srcName){
  const { w:W, h:H } = phTarget(idx), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently:true }); phDraw(ctx, bmp, W, H, cr);
  const d = ctx.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; j < d.length; i += 3, j += 4) { rgb[i] = d[j]; rgb[i+1] = d[j+1]; rgb[i+2] = d[j+2]; }
  const P = PH.prof || { fmt:'JP2', ratio:10, levels:5, rev:true, mct:0 };
  const r = await eng('encode', { rgb: rgb.buffer, w:W, h:H, prof:P }, 1, [rgb.buffer]);
  const bytes = new Uint8Array(r.bytes), chk = r.chk, errs = [];
  if (chk.w !== W || chk.h !== H) errs.push(`kích thước sau mã hóa ${chk.w}×${chk.h} ≠ ${W}×${H}`);
  if (P.fmt === 'JP2') { if (chk.nc !== 3) errs.push('số kênh màu ≠ 3'); if (chk.rev !== !!P.rev || chk.levels !== P.levels || chk.layers !== 1 || chk.cb !== P.cb) errs.push('thông số nén không khớp số đông'); }
  if (chk.psnr < 20) errs.push('ảnh sau nén sai lệch bất thường (PSNR ' + chk.psnr.toFixed(1) + ' dB) — bộ mã hóa có thể lỗi');
  if (errs.length) throw new Error('Ảnh mới không đạt: ' + errs.join('; '));
  const h0 = photoHead(bytes);
  return { idx, bytes, b64: XCore.toB64(bytes), url: URL.createObjectURL(r.prev), chk, head:h0, src: { name: srcName || 'ảnh dán', w: bmp.width, h: bmp.height }, crop: Object.assign({}, cr), at: new Date().toISOString() };
}
function phSetPending(p){ const o = PH.pending.get(p.idx); if (o) URL.revokeObjectURL(o.url); PH.pending.set(p.idx, p); phCardImg(p.idx); phApplyFilter(); phPendingBar(); phChanged(); }
const ccInName = (name) => { const ds = String(name || '').match(/\d{9,12}/g) || []; for (const d of ds) { const k = XCore.normCccd(d); if (k && PD.byCccd.has(k)) return k; } return ds.length ? XCore.normCccd(ds[0]) || ds[0] : ''; };

/* Hộp thay ảnh 1 người (kéo thả / Ctrl+V / chọn file / lấy theo tên trong thư mục ảnh) */
let PHD = null;
async function phOpen(idx, file){
  const r = PD.recs[idx]; if (!r) return; if (!r.anh) return toast('Hồ sơ này không có thẻ ảnh để thay: ' + (r.anhErr || ''), 5000);
  const inf = PH.info.get(idx) || {}, t = await phThumb(idx, 0), pend = PH.pending.get(idx), tg = phTarget(idx);
  PHD = { idx, bmp:null, cr:null, file:null, busy:false };
  dialog(`<h2>Thay ảnh — ${esc(r.ten)}</h2><p class="small" style="margin-top:-4px">CCCD ${esc(r.cccd)} · SBD ${esc(r.sbd || '—')} · Khóa ${esc(r.khoa || '—')}</p>
    <div class="phd"><div class="phcol"><b>Ảnh hiện tại trong file</b><div class="phbox"><img src="${t && t.url ? t.url : ''}" alt=""></div>
      <div class="small">${esc(inf.fmt || '')} ${inf.w || '?'}×${inf.h || '?'} · ${Math.round((inf.size || 0) / 1024)} KB${(PH.issues.get(idx) || []).length ? '<br><span class="st-bad">' + esc(PH.issues.get(idx).join('; ')) + '</span>' : ''}</div>
      ${pend ? `<div class="small" style="margin-top:6px"><b>Đang chọn thay bằng:</b> ${esc(pend.src.name)}</div><img src="${pend.url}" style="width:90px;border:1px solid var(--line);border-radius:4px;margin-top:4px" alt=""><br><button class="btn sec sm" id="phdUndo" type="button">Bỏ ảnh mới này</button>` : ''}</div>
    <div class="phcol"><b>Ảnh mới (${tg.w}×${tg.h}px — đúng cỡ ảnh cũ)</b>
      <div class="phbox drop" id="phdDrop"><canvas id="phdCv" width="${tg.w}" height="${tg.h}" class="hide"></canvas><div id="phdHint">Kéo thả ảnh vào đây<br>hoặc bấm <b>Ctrl+V</b> để dán<br><label class="btn sm" style="margin-top:8px;cursor:pointer">Chọn ảnh…<input type="file" id="phdFile" accept="image/*,.jp2,.j2k" hidden></label></div></div>
      <div class="small" id="phdInfo" style="margin-top:6px"></div>
      <div id="phdCtl" class="hide" style="margin-top:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="small">Phóng to <b id="phdZv">100%</b></span><input type="range" id="phdZ" min="100" max="300" value="100" style="flex:1;min-width:120px">
        <span class="small">Kéo trên ảnh để dịch khung · <a href="#" id="phdCenter">Căn giữa</a></span></div>
      <div class="row" style="margin-top:8px"><label class="f" style="flex:1">Hoặc lấy theo tên file / đường dẫn trong thư mục ảnh<input type="text" id="phdName" list="phdList" placeholder="${PH.dir ? 'VD: ' + esc(r.cccd) + '.jpg' : 'Chưa liên kết thư mục ảnh (nút “Liên kết thư mục ảnh…”)'}"></label><datalist id="phdList"></datalist><button class="btn sec sm" id="phdGet" type="button"${PH.dir ? '' : ' disabled'}>Lấy</button></div></div></div>
    <p class="small" style="margin-bottom:0">Ảnh mới được ghi theo số đông ảnh trong file: <b>${esc(profTxt(PH.prof))}</b>. Chỉ thay dữ liệu trong thẻ &lt;ANH_CHAN_DUNG&gt; của đúng người này.</p>`,
    async () => { if (!PHD || !PHD.bmp) { toast('Chưa có ảnh mới'); return false; } if (PHD.busy) return false; PHD.busy = true;
      $('#phdInfo').innerHTML = '<span class="st-warn">Đang mã hóa và kiểm tra…</span>';
      try { const p = await phPrepare(idx, PHD.bmp, PHD.cr, PHD.file ? PHD.file.name : ''); phSetPending(p); PH.tray = PH.tray.filter(x => !(PHD.trayId && x.id === PHD.trayId)); phTray();
        toast(`Đã chọn ảnh mới cho ${r.ten} (${Math.round(p.bytes.length / 1024)} KB, PSNR ${p.chk.psnr.toFixed(1)} dB)` + (p.chk.psnr < 35 ? ' — ảnh nhiều hạt/nhiễu nên giảm chi tiết sau nén, nên xem lại' : ''), p.chk.psnr < 35 ? 7000 : 3200); PHD = null; return true; }
      catch(e){ $('#phdInfo').innerHTML = `<span class="st-bad">${esc(e.message)}</span>`; PHD.busy = false; return false; } }, 'Dùng ảnh này', { wide:true });
  $('#dlg').addEventListener('close', () => { PHD = null; }, { once:true });
  if (pend) $('#phdUndo').onclick = () => { URL.revokeObjectURL(pend.url); PH.pending.delete(idx); phCardImg(idx); phApplyFilter(); phPendingBar(); phChanged(); $('#dlg').close(); toast('Đã bỏ ảnh mới của ' + r.ten); };
  const drop = $('#phdDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const tid = e.dataTransfer.getData('text/x-ndsh-tray'); if (tid) { const tr = PH.tray.find(x => x.id === tid); if (tr) { PHD.trayId = tid; phdLoad(tr.file); } return; } const f = Array.from(e.dataTransfer.files || []).find(f => /^image\/|\.(jp2|j2k)$/i.test(f.type || f.name)); if (f) phdLoad(f); });
  $('#phdFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) phdLoad(f); };
  $('#phdGet').onclick = phdFromDir; $('#phdName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); phdFromDir(); } });
  if (PH.dirFiles.length) $('#phdList').innerHTML = PH.dirFiles.slice(0, 500).map(f => `<option value="${esc(f.name)}">`).join('');
  $('#phdZ').oninput = e => { if (!PHD || !PHD.cr) return; PHD.cr.zoom = +e.target.value / 100; $('#phdZv').textContent = e.target.value + '%'; phdPaint(); };
  $('#phdCenter').onclick = e => { e.preventDefault(); if (!PHD || !PHD.cr) return; PHD.cr.cx = 0.5; PHD.cr.cy = 0.5; phdPaint(); };
  const cv = $('#phdCv'); let drag = null;
  cv.addEventListener('pointerdown', e => { if (!PHD || !PHD.cr) return; drag = { x:e.clientX, y:e.clientY, cx:PHD.cr.cx, cy:PHD.cr.cy }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag || !PHD) return; const { w:W, h:H } = phTarget(idx), s = PHD.cr.base * PHD.cr.zoom, k = cv.getBoundingClientRect().width / W;
    const ex = W - PHD.bmp.width * s, ey = H - PHD.bmp.height * s;
    if (ex < 0) PHD.cr.cx = Math.min(1, Math.max(0, drag.cx + (e.clientX - drag.x) / k / ex)); if (ey < 0) PHD.cr.cy = Math.min(1, Math.max(0, drag.cy + (e.clientY - drag.y) / k / ey)); phdPaint(); });
  cv.addEventListener('pointerup', () => { drag = null; });
  if (file) phdLoad(file);
}
async function phdFromDir(){
  if (!PH.dir) return toast('Chưa liên kết thư mục ảnh (nút “Liên kết thư mục ảnh”)', 4000);
  const raw = $('#phdName').value.trim(); if (!raw) return;
  const base = raw.split(/[\\/]/).pop().replace(/^"|"$/g, '');
  try { if (!(await phDirReady(true))) return toast('Chưa được phép đọc thư mục ảnh', 4000);
    let fh = null; try { fh = await PH.dir.getFileHandle(base); } catch(_){ const hit = PH.dirFiles.find(f => f.name.toLowerCase() === base.toLowerCase() || f.name.toLowerCase().startsWith(base.toLowerCase())); if (hit) fh = hit.h; }
    if (!fh) return $('#phdInfo').innerHTML = `<span class="st-bad">Không thấy “${esc(base)}” trong thư mục ${esc(PH.dir.name)}</span>`;
    phdLoad(await fh.getFile()); } catch(e){ $('#phdInfo').innerHTML = `<span class="st-bad">${esc(e.message)}</span>`; }
}
async function phdLoad(file){
  if (!PHD) return; const idx = PHD.idx, r = PD.recs[idx];
  $('#phdInfo').innerHTML = '<span class="st-warn">Đang đọc ảnh…</span>';
  try { const bmp = await phBitmap(file); if (!PHD || PHD.idx !== idx) return; const { w:W, h:H } = phTarget(idx);
    PHD.bmp = bmp; PHD.file = file; PHD.cr = phCropInit(bmp.width, bmp.height, W, H);
    $('#phdCv').classList.remove('hide'); $('#phdHint').classList.add('hide'); $('#phdCtl').classList.remove('hide'); $('#phdCtl').style.display = 'flex'; $('#phdZ').value = 100; $('#phdZv').textContent = '100%';
    const cc = ccInName(file.name), warn = cc && cc !== r.cccd ? `<br><span class="st-bad">⚠ Tên file có số ${esc(cc)} — KHÁC CCCD của người này (${esc(r.cccd)}). Kiểm tra lại đúng người!</span>` : (cc === r.cccd ? '<br><span class="st-ok">✔ Tên file đúng CCCD người này</span>' : '');
    const ratio = bmp.width / bmp.height, rw = Math.abs(ratio - W / H) > 0.03 ? `<br><span class="st-warn">Ảnh không đúng tỷ lệ 3:4 — đã phóng vừa khung, kéo để chọn vùng.</span>` : '';
    $('#phdInfo').innerHTML = `${esc(file.name || 'ảnh dán')} · ${bmp.width}×${bmp.height}px · ${PHD.cr.exact ? (bmp.width === W && bmp.height === H ? 'đúng cỡ, giữ nguyên từng điểm ảnh' : `cắt giữa còn ${W}×${H}, không co giãn`) : `co giãn vừa khung ${W}×${H}`}` + warn + rw;
    phdPaint(); } catch(e){ $('#phdInfo').innerHTML = `<span class="st-bad">Không đọc được ảnh: ${esc(e.message)}</span>`; }
}
function phdPaint(){ if (!PHD || !PHD.bmp) return; const cv = $('#phdCv'); if (!cv) return; phDraw(cv.getContext('2d'), PHD.bmp, cv.width, cv.height, PHD.cr); }

/* ---------- Hàng loạt (A: ghép theo CCCD trong tên file; B: khay ảnh chưa ghép → kéo vào đúng người) ---------- */
const isImg = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|bmp|jp2|j2k|gif)$/i.test(f.name || '');
async function phBatch(files, from){
  files = files.filter(isImg); if (!files.length) return toast('Không có file ảnh nào');
  if (!PD.xml) return toast('Nạp file XML trước');
  const by = new Map(), un = [], dupe = [];
  for (const f of files) { const cc = ccInName(f.name); if (cc && PD.byCccd.has(cc)) { if (by.has(cc)) { const o = by.get(cc); if ((f.lastModified || 0) > (o.lastModified || 0)) { dupe.push(o.name); by.set(cc, f); } else dupe.push(f.name); } else by.set(cc, f); } else un.push(f); }
  const rows = Array.from(by.entries()).map(([cc, f]) => ({ rec:PD.byCccd.get(cc), f, url:URL.createObjectURL(f) }));
  rows.sort((a, b) => a.rec.idx - b.rec.idx);
  for (const r of rows) phThumb(r.rec.idx, 2);
  dialog(`<h2>Thay ảnh hàng loạt — ghép theo số CCCD trong tên file</h2>
    <p class="small">${esc(from || '')} ${files.length} ảnh: <b class="st-ok">${rows.length} ghép được</b>${un.length ? ` · <b class="st-warn">${un.length} chưa ghép được</b> (tên file không có CCCD trong XML) — sẽ đưa xuống <b>khay ảnh</b> để anh kéo vào đúng người` : ''}${dupe.length ? ` · ${dupe.length} ảnh trùng CCCD (lấy ảnh mới nhất): ${esc(dupe.slice(0, 3).join(', '))}` : ''}</p>
    ${rows.length ? `<div class="tblwrap" style="max-height:50vh"><table><thead><tr><th><input type="checkbox" id="pbAll" checked></th><th>Họ tên / CCCD</th><th class="c">Ảnh cũ</th><th class="c">Ảnh mới</th><th>File</th></tr></thead><tbody>
      ${rows.map((x, k) => `<tr><td><input type="checkbox" class="pbChk" data-k="${k}" checked></td><td><b>${esc(x.rec.ten)}</b><br><span class="small">${esc(x.rec.cccd)} · SBD ${esc(x.rec.sbd || '—')}</span>${PH.pending.has(x.rec.idx) ? '<br><span class="st-warn small">đã có ảnh mới — sẽ thay bằng ảnh này</span>' : ''}</td><td class="c"><img class="pbOld" data-i="${x.rec.idx}" style="width:54px;height:72px;object-fit:cover;border:1px solid var(--line)" alt=""></td><td class="c"><img src="${x.url}" style="width:54px;height:72px;object-fit:cover;border:1px solid var(--line)" alt=""></td><td class="small" style="white-space:normal;max-width:220px">${esc(x.f.name)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div id="pbInfo" class="small" style="margin-top:8px">Ảnh được cắt giữa đúng cỡ ảnh cũ (không co giãn nếu ảnh lệch ≤ 8px), mã hóa theo số đông, giải mã lại để kiểm tra. Muốn chỉnh khung từng người: bấm vào ảnh đó trong lưới sau khi xong.</div>`,
    async () => {
      const pick = rows.filter((_, k) => { const c = document.querySelector(`.pbChk[data-k="${k}"]`); return c && c.checked; });
      if (un.length) { un.forEach(f => PH.tray.push({ id:'t' + Math.random().toString(36).slice(2), file:f, url:URL.createObjectURL(f) })); phTray(); }
      if (!pick.length) { rows.forEach(x => URL.revokeObjectURL(x.url)); return true; }
      let ok = 0; const fail = [];
      for (const [k, x] of pick.entries()) {
        $('#pbInfo').innerHTML = `<span class="st-warn">Đang xử lý ${k + 1}/${pick.length}: ${esc(x.rec.ten)}…</span>`;
        try { await phThumb(x.rec.idx, 1); const bmp = await phBitmap(x.f), tg = phTarget(x.rec.idx); const p = await phPrepare(x.rec.idx, bmp, phCropInit(bmp.width, bmp.height, tg.w, tg.h), x.f.name); bmp.close && bmp.close(); phSetPending(p); ok++; }
        catch(e){ fail.push(x.rec.ten + ': ' + e.message); }
      }
      rows.forEach(x => URL.revokeObjectURL(x.url));
      toast(`Đã chuẩn bị ${ok} ảnh mới` + (fail.length ? `, ${fail.length} ảnh lỗi` : ''), 5000);
      if (fail.length) { dialog(`<h2>${fail.length} ảnh không dùng được</h2><ul>${fail.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`); return false; }
      return true;
    }, rows.length ? `Dùng ${rows.length} ảnh đã ghép` : 'Đưa vào khay ảnh', { wide:true });
  const all = $('#pbAll'); if (all) all.onchange = e => $$('.pbChk').forEach(c => c.checked = e.target.checked);
  rows.forEach(x => phThumb(x.rec.idx, 2).then(t => { const im = document.querySelector(`.pbOld[data-i="${x.rec.idx}"]`); if (im && t && t.url) im.src = t.url; }));
}
function phTray(){
  const el = $('#phTray'); if (!el) return; el.classList.toggle('hide', !PH.tray.length);
  el.innerHTML = PH.tray.length ? `<div class="small"><b>Khay ảnh chưa ghép (${PH.tray.length})</b> — kéo từng ảnh thả vào đúng người trong lưới bên dưới. <a href="#" id="trClear">Xóa khay</a></div><div class="trow">${PH.tray.map(t => `<div class="titem" draggable="true" data-id="${t.id}" title="${esc(t.file.name)}"><img src="${t.url}" alt=""><span>${esc(t.file.name)}</span></div>`).join('')}</div>` : '';
  $$('#phTray .titem').forEach(d => d.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-ndsh-tray', d.dataset.id); e.dataTransfer.effectAllowed = 'copy'; }));
  const c = $('#trClear'); if (c) c.onclick = e => { e.preventDefault(); PH.tray.forEach(t => URL.revokeObjectURL(t.url)); PH.tray = []; phTray(); };
}

/* ---------- Xuất ảnh từ XML (tên CCCD_SBD_HoTen.jpg) → xử lý ở Ảnh Thẻ Pro → nạp lại tự ghép ---------- */
function crc32(u8){ let c, crc = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) { c = (crc ^ u8[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files){   // ZIP không nén (ảnh JPEG đã nén sẵn), tên file UTF-8
  const te = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) { const nm = te.encode(f.name), d = f.data, crc = crc32(d), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + d.length; }
  const cs = cen.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type:'application/zip' });
}
const expName = r => `${r.cccd}_${r.sbd || 'x'}_${deaccent(r.ten).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}.jpg`;
async function phExport(){
  if (!PD.xml) return;
  const vis = $$('#phGrid .pcard').filter(c => c.style.display !== 'none').map(c => PD.recs[+c.dataset.i]).filter(r => r.anh);
  if (!vis.length) return toast('Không có ảnh nào đang hiện để xuất');
  const sup = typeof window.showDirectoryPicker === 'function';
  dialog(`<h2>Xuất ${vis.length} ảnh ra để xử lý ở Ảnh Thẻ Pro</h2><p>Mỗi ảnh lưu thành file JPEG chất lượng cao, tên <code>CCCD_SBD_HoTen.jpg</code>, ví dụ <code>${esc(expName(vis[0]))}</code>.</p>
    <p class="small">Sau khi xử lý ở Ảnh Thẻ Pro, <b>giữ tên file bắt đầu bằng số CCCD</b> khi lưu. Nạp lại bằng nút “Nạp ảnh hàng loạt” (hoặc kéo thả cả loạt vào lưới) — tool tự ghép đúng người.</p>
    <p class="small">${sup ? 'Chọn thư mục để lưu (tool tạo thư mục con <code>AnhXML_' + esc(PD.head.ky || 'KY') + '</code>).' : 'Trình duyệt này không ghi thẳng vào thư mục — tool tải về 1 file ZIP.'}</p><div id="exInfo" class="small"></div>`,
    async () => {
      let dir = null;
      if (sup) { try { const root = await window.showDirectoryPicker({ id:'suaNDSHexport', mode:'readwrite' }); dir = await root.getDirectoryHandle('AnhXML_' + safeName(PD.head.ky || 'KY'), { create:true }); } catch(e){ if (e && e.name === 'AbortError') return false; toast('Không mở được thư mục — tải ZIP thay thế', 4000); } }
      const zipFiles = []; let k = 0;
      for (const r of vis) { $('#exInfo').innerHTML = `<span class="st-warn">Đang xuất ${++k}/${vis.length}…</span>`;
        const b = phBytes(r.idx); const d = await eng('jpeg', { bytes: b.buffer, q:0.95 }, 3, [b.buffer]); const data = new Uint8Array(await d.blob.arrayBuffer());
        if (dir) { const fh = await dir.getFileHandle(expName(r), { create:true }), w = await fh.createWritable(); await w.write(data); await w.close(); } else zipFiles.push({ name: expName(r), data }); }
      if (!dir) download(zipStore(zipFiles), `AnhXML_${safeName(PD.head.ky || 'KY')}.zip`, 'application/zip');
      toast(`Đã xuất ${vis.length} ảnh` + (dir ? ' vào thư mục ' + dir.name : ' (ZIP)'), 5000); return true;
    }, sup ? 'Chọn thư mục & xuất' : 'Tải ZIP');
}

/* ---------- Thư mục ảnh liên kết (thư mục Ảnh Thẻ Pro lưu ảnh) ---------- */
async function phDirBoot(){ const h = await IDB.get('photoDir'); if (h && h.kind === 'directory') PH.dir = h; phDirUI(); }
async function phDirReady(ask){ if (!PH.dir) return false; let p = 'denied'; try { p = await PH.dir.queryPermission({ mode:'read' }); } catch(e){} if (p !== 'granted' && ask) { try { p = await PH.dir.requestPermission({ mode:'read' }); } catch(e){} } return p === 'granted'; }
async function phDirList(){ const out = []; for await (const [n, h] of PH.dir.entries()) if (h.kind === 'file' && isImg({ name:n })) { const f = await h.getFile(); out.push({ name:n, h, t:f.lastModified }); } out.sort((a, b) => b.t - a.t); PH.dirFiles = out; return out; }
function phDirUI(){ const el = $('#phDirSt'); if (!el) return; const sup = typeof window.showDirectoryPicker === 'function';
  el.innerHTML = !sup ? 'Trình duyệt không hỗ trợ liên kết thư mục' : PH.dir ? `Thư mục ảnh: <b>${esc(PH.dir.name)}</b>` : 'Chưa liên kết thư mục ảnh';
  $('#phDirScan').disabled = !PH.dir; $('#phDirPick').disabled = !sup; }
async function phDirScan(){
  if (!PH.dir) return; if (!(await phDirReady(true))) return toast('Chưa được phép đọc thư mục ảnh', 4000);
  const L = await phDirList(); if (!L.length) return toast('Thư mục không có ảnh nào');
  const files = []; for (const x of L) files.push(await x.h.getFile());
  phBatch(files, `Thư mục “${PH.dir.name}”:`);
}

/* ---------- Gắn sự kiện tab ảnh ---------- */
function phInitUI(){
  $('#phQ').addEventListener('input', e => { PH.q = e.target.value; phApplyFilter(); });
  $('#phExp').onclick = phExport;
  $('#phImp').onclick = () => $('#phFiles').click();
  $('#phFiles').onchange = e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) phBatch(fs, 'Đã chọn'); };
  $('#phDirPick').onclick = async () => { try { const h = await window.showDirectoryPicker({ id:'suaNDSHphoto', mode:'read' }); PH.dir = h; await IDB.put('photoDir', h); phDirUI(); toast('Đã liên kết thư mục ảnh: ' + h.name); await phDirList(); } catch(e){ if (e && e.name !== 'AbortError') toast('Không chọn được thư mục: ' + e.message, 5000); } };
  $('#phDirScan').onclick = phDirScan;
  $('#phReAudit').onclick = () => { PH.audit.gen++; PH.audit.running = false; phAudit(); };
  const g = $('#phGrid');
  g.addEventListener('click', e => { const c = e.target.closest('.pcard'); if (c) phOpen(+c.dataset.i); });
  g.addEventListener('keydown', e => { const c = e.target.closest('.pcard'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); phOpen(+c.dataset.i); } });
  const zone = $('#phMain');
  zone.addEventListener('dragover', e => { e.preventDefault(); const c = e.target.closest('.pcard'); $$('#phGrid .pcard.over').forEach(x => x !== c && x.classList.remove('over')); if (c) c.classList.add('over'); });
  zone.addEventListener('dragleave', e => { const c = e.target.closest('.pcard'); if (c) c.classList.remove('over'); });
  zone.addEventListener('drop', e => { e.preventDefault(); $$('#phGrid .pcard.over').forEach(x => x.classList.remove('over'));
    const c = e.target.closest('.pcard'), tid = e.dataTransfer.getData('text/x-ndsh-tray'), fs = Array.from(e.dataTransfer.files || []).filter(isImg);
    if (c && tid) { const tr = PH.tray.find(x => x.id === tid); if (tr) phOpen(+c.dataset.i, tr.file).then(() => { if (PHD) PHD.trayId = tid; }); return; }
    if (c && fs.length === 1) return phOpen(+c.dataset.i, fs[0]);
    if (fs.length) phBatch(fs, 'Kéo thả:'); });
  // Ctrl+V: đang mở hộp thay ảnh → dán vào người đó; đang ở tab ảnh → ghép hàng loạt theo tên file
  document.addEventListener('paste', e => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []), fs = Array.from((e.clipboardData && e.clipboardData.files) || []);
    let files = fs.filter(isImg); if (!files.length) items.forEach(it => { if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) files.push(f); } });
    if (PHD && $('#dlg').open) { if (files.length) { e.preventDefault(); phdLoad(files[0]); } else { const t = e.clipboardData.getData('text'); if (t && /\.(jpe?g|png|webp|bmp|jp2)\s*"?$/i.test(t.trim())) { e.preventDefault(); $('#phdName').value = t.trim(); phdFromDir(); } } return; }
    if (!$('#tabPhoto').classList.contains('hide') && files.length && !$('#dlg').open) { e.preventDefault(); phBatch(files, 'Dán (Ctrl+V):'); }
  });
  phDirBoot();
}
window.addEventListener('beforeunload', () => { ENG.ws.forEach(w => { try { w.terminate && w.terminate(); } catch(_){} }); });
