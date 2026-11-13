#!/usr/bin/env bash
# Dựng lại jp2.wasm (bộ mã hóa / giải mã JPEG 2000 cho tool Sửa NDSH XML) từ OpenJPEG 2.5.2.
# Cần: pip install ziglang ; git. Kết quả: src/sua_ndsh/jp2/jp2.wasm
# Thay đổi duy nhất so với OpenJPEG gốc: không ghi khối COM "Created by OpenJPEG…" (giống ảnh trong file XML PC-08).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; W="$(mktemp -d)"
git clone -q --depth 1 --branch v2.5.2 https://github.com/uclouvain/openjpeg.git "$W/opj"
cp -r "$W/opj/src/lib/openjp2" "$W/src" && cp "$HERE/opj_config.h" "$HERE/opj_config_private.h" "$W/src/"
python3 - "$W/src/j2k.c" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
a="    } else {\n        /* Create default comment for codestream */"
assert s.count(a)==1; open(p,'w').write(s.replace(a,"    } else if (0) { /* SuaNDSH: không ghi COM mặc định, giống ảnh gốc */\n        /* Create default comment for codestream */"))
PY
F=""; for s in thread bio cio dwt event ht_dec image invert j2k jp2 mct mqc openjpeg opj_clock pi t1 t2 tcd tgt function_list opj_malloc sparse_array; do F="$F $W/src/$s.c"; done
python3 -m ziglang cc -target wasm32-wasi -mexec-model=reactor -O2 -DOPJ_STATIC -DNDEBUG -I"$W/src" -D_WASI_EMULATED_PROCESS_CLOCKS -lwasi-emulated-process-clocks \
  -Wl,--no-entry -Wl,-z,stack-size=1048576 -Wl,--initial-memory=33554432 -Wl,--max-memory=1073741824 -Wl,--strip-all \
  -o "$HERE/jp2.wasm" "$HERE/wrap.c" $F
rm -rf "$W"; ls -la "$HERE/jp2.wasm"
