/* SuaNDSH: lớp bọc OpenJPEG 2.5.2 cho trình duyệt — mã hóa / giải mã JP2 trong bộ nhớ */
#include "openjpeg.h"
#include <stdlib.h>
#include <string.h>
#define EX(n) __attribute__((export_name(n)))
typedef struct { unsigned char *d; size_t size, cap, pos; } mem_t;
static OPJ_SIZE_T m_read(void *b, OPJ_SIZE_T n, void *u) { mem_t *m = u; if (m->pos >= m->size) return (OPJ_SIZE_T)-1; size_t k = m->size - m->pos; if (k > n) k = n; memcpy(b, m->d + m->pos, k); m->pos += k; return k; }
static OPJ_SIZE_T m_write(void *b, OPJ_SIZE_T n, void *u) { mem_t *m = u; if (m->pos + n > m->cap) { size_t c = (m->pos + n) * 2 + 4096; unsigned char *d = realloc(m->d, c); if (!d) return (OPJ_SIZE_T)-1; m->d = d; m->cap = c; } memcpy(m->d + m->pos, b, n); m->pos += n; if (m->pos > m->size) m->size = m->pos; return n; }
static OPJ_OFF_T m_skip_r(OPJ_OFF_T n, void *u) { mem_t *m = u; if (n < 0) { if ((OPJ_OFF_T)m->pos + n < 0) return -1; m->pos += n; return n; } if (m->pos + (size_t)n > m->size) { OPJ_OFF_T k = (OPJ_OFF_T)(m->size - m->pos); m->pos = m->size; return k ? k : -1; } m->pos += n; return n; }
static OPJ_OFF_T m_skip_w(OPJ_OFF_T n, void *u) { mem_t *m = u; if ((OPJ_OFF_T)m->pos + n < 0) return -1; size_t np = m->pos + n; if (np > m->cap) { size_t c = np * 2 + 4096; unsigned char *d = realloc(m->d, c); if (!d) return -1; memset(d + m->cap, 0, c - m->cap); m->d = d; m->cap = c; } m->pos = np; if (m->pos > m->size) m->size = m->pos; return n; }
static OPJ_BOOL m_seek(OPJ_OFF_T p, void *u) { mem_t *m = u; if (p < 0) return OPJ_FALSE; m->pos = (size_t)p; return OPJ_TRUE; }
static void quiet(const char *msg, void *u) { (void)msg; (void)u; }
static char g_err[256];
static void on_err(const char *msg, void *u) { (void)u; strncpy(g_err, msg, 255); g_err[255] = 0; }
static opj_stream_t *mk_stream(mem_t *m, int in) {
  opj_stream_t *s = opj_stream_create(1 << 16, in ? OPJ_TRUE : OPJ_FALSE); if (!s) return 0;
  opj_stream_set_user_data(s, m, 0);
  if (in) { opj_stream_set_user_data_length(s, m->size); opj_stream_set_read_function(s, m_read); opj_stream_set_skip_function(s, m_skip_r); }
  else { opj_stream_set_write_function(s, m_write); opj_stream_set_skip_function(s, m_skip_w); }
  opj_stream_set_seek_function(s, m_seek); return s;
}
EX("xalloc") void *xalloc(int n) { return malloc((size_t)n); }
EX("xfree") void xfree(void *p) { free(p); }
EX("last_error") const char *last_error(void) { return g_err; }
/* ---- giải mã: kết quả RGBA 8 bit ---- */
static unsigned char *g_rgba = 0; static int g_w, g_h, g_nc, g_rev, g_levels, g_layers, g_prog, g_cb, g_mct;
EX("dec_ptr") unsigned char *dec_ptr(void) { return g_rgba; }
EX("dec_info") int dec_info(int k) { switch (k) { case 0: return g_w; case 1: return g_h; case 2: return g_nc; case 3: return g_rev; case 4: return g_levels; case 5: return g_layers; case 6: return g_prog; case 7: return g_cb; case 8: return g_mct; } return -1; }
EX("jp2_decode") int jp2_decode(unsigned char *data, int len) {
  free(g_rgba); g_rgba = 0; g_err[0] = 0;
  OPJ_CODEC_FORMAT fmt = (len > 12 && data[4] == 'j' && data[5] == 'P') ? OPJ_CODEC_JP2 : (len > 2 && data[0] == 0xFF && data[1] == 0x4F) ? OPJ_CODEC_J2K : (OPJ_CODEC_FORMAT)-1;
  if ((int)fmt < 0) { strcpy(g_err, "khong phai JPEG 2000"); return 1; }
  mem_t m = { data, (size_t)len, (size_t)len, 0 };
  opj_codec_t *c = opj_create_decompress(fmt); opj_stream_t *s = mk_stream(&m, 1); opj_image_t *im = 0; int rc = 2;
  opj_set_info_handler(c, quiet, 0); opj_set_warning_handler(c, quiet, 0); opj_set_error_handler(c, on_err, 0);
  opj_dparameters_t p; opj_set_default_decoder_parameters(&p);
  if (!opj_setup_decoder(c, &p) || !opj_read_header(s, c, &im)) goto done;
  opj_codestream_info_v2_t *ci = opj_get_cstr_info(c);
  if (ci) { g_levels = (int)ci->m_default_tile_info.tccp_info[0].numresolutions - 1; g_rev = ci->m_default_tile_info.tccp_info[0].qmfbid == 1; g_layers = (int)ci->m_default_tile_info.numlayers; g_prog = (int)ci->m_default_tile_info.prg; g_cb = 1 << ci->m_default_tile_info.tccp_info[0].cblkw; g_mct = (int)ci->m_default_tile_info.mct; opj_destroy_cstr_info(&ci); }
  if (!opj_decode(c, s, im) || !opj_end_decompress(c, s)) goto done;
  int nc = (int)im->numcomps; if (nc < 1) goto done;
  int w = (int)im->comps[0].w, h = (int)im->comps[0].h;
  for (int k = 0; k < nc; k++) if (im->comps[k].w != (OPJ_UINT32)w || im->comps[k].h != (OPJ_UINT32)h || !im->comps[k].data) { strcpy(g_err, "thanh phan mau khac kich thuoc"); goto done; }
  g_rgba = malloc((size_t)w * h * 4); if (!g_rgba) goto done;
  for (int i = 0; i < w * h; i++) {
    for (int k = 0; k < 4; k++) {
      int src = nc >= 3 ? (k < 3 ? k : (nc > 3 ? 3 : -1)) : (k < 3 ? 0 : (nc > 1 ? 1 : -1));
      int v = 255;
      if (src >= 0) { opj_image_comp_t *cp = &im->comps[src]; int x = cp->data[i]; if (cp->sgnd) x += 1 << (cp->prec - 1); if (cp->prec > 8) x >>= (cp->prec - 8); else if (cp->prec < 8) x <<= (8 - cp->prec); v = x < 0 ? 0 : x > 255 ? 255 : x; }
      g_rgba[(size_t)i * 4 + k] = (unsigned char)v;
    }
  }
  g_w = w; g_h = h; g_nc = nc; rc = 0;
done:
  if (im) opj_image_destroy(im); opj_stream_destroy(s); opj_destroy_codec(c); return rc;
}
/* ---- mã hóa: RGB 8 bit -> JP2 (wavelet 5/3 khi reversible=1, tỷ lệ nén ratio, 1 lớp, LRCP, khối 64x64, 1 ô, không MCT, sRGB) ---- */
static unsigned char *g_out = 0; static int g_outlen = 0;
EX("enc_ptr") unsigned char *enc_ptr(void) { return g_out; }
EX("enc_len") int enc_len(void) { return g_outlen; }
EX("jp2_encode") int jp2_encode(unsigned char *rgb, int w, int h, int nc, float ratio, int levels, int reversible, int mct) {
  free(g_out); g_out = 0; g_outlen = 0; g_err[0] = 0;
  if (w < 1 || h < 1 || (nc != 1 && nc != 3)) { strcpy(g_err, "tham so anh khong hop le"); return 1; }
  opj_image_cmptparm_t cp[3]; memset(cp, 0, sizeof cp);
  for (int k = 0; k < nc; k++) { cp[k].dx = 1; cp[k].dy = 1; cp[k].w = (OPJ_UINT32)w; cp[k].h = (OPJ_UINT32)h; cp[k].prec = 8; cp[k].sgnd = 0; }
  opj_image_t *im = opj_image_create((OPJ_UINT32)nc, cp, nc == 3 ? OPJ_CLRSPC_SRGB : OPJ_CLRSPC_GRAY); if (!im) return 2;
  im->x0 = 0; im->y0 = 0; im->x1 = (OPJ_UINT32)w; im->y1 = (OPJ_UINT32)h;
  for (int i = 0; i < w * h; i++) for (int k = 0; k < nc; k++) im->comps[k].data[i] = rgb[(size_t)i * nc + k];
  opj_cparameters_t p; opj_set_default_encoder_parameters(&p);
  p.tcp_numlayers = 1; p.tcp_rates[0] = ratio; p.cp_disto_alloc = ratio > 0 ? 1 : 0; if (ratio <= 0) p.tcp_rates[0] = 0;
  p.irreversible = reversible ? 0 : 1; p.numresolution = levels + 1; p.cblockw_init = 64; p.cblockh_init = 64; p.prog_order = OPJ_LRCP;
  p.tcp_mct = (char)(nc == 3 && mct ? 1 : 0);
  opj_codec_t *c = opj_create_compress(OPJ_CODEC_JP2); mem_t m = { 0, 0, 0, 0 }; opj_stream_t *s = 0; int rc = 3;
  opj_set_info_handler(c, quiet, 0); opj_set_warning_handler(c, quiet, 0); opj_set_error_handler(c, on_err, 0);
  if (!opj_setup_encoder(c, &p, im)) goto done;
  s = mk_stream(&m, 0); if (!s) goto done;
  if (!opj_start_compress(c, im, s) || !opj_encode(c, s) || !opj_end_compress(c, s)) goto done;
  g_out = m.d; g_outlen = (int)m.size; m.d = 0; rc = 0;
done:
  if (s) opj_stream_destroy(s); free(m.d); opj_destroy_codec(c); opj_image_destroy(im); return rc;
}
