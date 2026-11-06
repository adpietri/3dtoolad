#!/usr/bin/env python3
# 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html).
#
# Makes a one-file version of 3DToolAD: every file in css/ and js/ is put inside a copy of index.html,
# so the result is a single .html file you can open, copy or send on its own. The original files are not changed.
#
#   python3 build_single_file.py                 -> 3DToolAD-<version>.html next to this script
#   python3 build_single_file.py -o my.html      -> any name or folder you like
#
# On Windows: "py build_single_file.py" (or double-click it if Python is installed).
# Needs only Python 3.6 or newer; nothing to install.
#
# ---
# Gera uma versão em arquivo único do 3DToolAD: todos os arquivos de css/ e js/ vão para dentro de uma cópia do
# index.html, e o resultado é um único .html que abre, copia e envia sozinho. Os arquivos originais não mudam.
#
#   python3 build_single_file.py                 -> 3DToolAD-<versão>.html ao lado deste script
#   python3 build_single_file.py -o meu.html     -> o nome ou a pasta que você quiser
#
# No Windows: "py build_single_file.py" (ou dois cliques, se o Python estiver instalado).
# Precisa só do Python 3.6 ou mais novo; nada para instalar.

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

SCRIPT_TAG = re.compile(r'<script src="([^"]+)" data-part="([^"]+)"></script>')
LINK_TAG = re.compile(r'<link rel="stylesheet" href="([^"]+)" data-part="([^"]+)">')
# the modular version also allows scripts and styles from the same folder; one file needs only what is inside it
CSP_LOOSE = (" script-src 'self' file: 'unsafe-inline';", " style-src 'self' file: 'unsafe-inline';")
CSP_TIGHT = (" script-src 'unsafe-inline';", " style-src 'unsafe-inline';")


def fail(msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(1)


def read(rel):
    path = os.path.join(HERE, *rel.split('/'))
    if not os.path.isfile(path):
        fail('missing file / arquivo faltando: ' + rel)
    with open(path, encoding='utf-8') as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description='Make a single-file 3DToolAD (all css/ and js/ inside one .html).')
    ap.add_argument('-o', '--output', help='output file or folder (default: 3DToolAD-<version>.html next to this script)')
    args = ap.parse_args()

    html = read('index.html')
    version = re.search(r"version:\s*'([^']+)'", read('js/01-core.js'))
    version = version.group(1) if version else 'single'

    count = {'js': 0, 'css': 0, 'bytes': 0}

    def inline_script(m):
        src, part = m.group(1), m.group(2)
        code = read(src)
        # '</script' inside the code would end the tag early; '<\/script' means the same thing in JavaScript
        code = re.sub(r'</(script)', r'<\\/\1', code, flags=re.I)
        count['js'] += 1
        count['bytes'] += len(code.encode('utf-8'))
        return '<script data-part="%s">\n%s</script>' % (part, code)

    def inline_style(m):
        href, part = m.group(1), m.group(2)
        css = read(href)
        if re.search(r'</style', css, re.I):
            fail(href + ' contains "</style" and cannot be put inside the page')
        count['css'] += 1
        count['bytes'] += len(css.encode('utf-8'))
        return '<style data-part="%s">\n%s</style>' % (part, css)

    html = SCRIPT_TAG.sub(inline_script, html)
    html = LINK_TAG.sub(inline_style, html)
    if re.search(r'<script src=|<link rel="stylesheet"', html):
        fail('index.html has a <script src> or stylesheet link this script does not recognise (expected: src/href followed by data-part)')
    if count['js'] == 0:
        fail('no scripts found in index.html')
    for loose, tight in zip(CSP_LOOSE, CSP_TIGHT):
        html = html.replace(loose, tight)
    html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Single-file build of 3DToolAD %s, made by build_single_file.py from the modular version. -->' % version, 1)

    out = args.output or os.path.join(HERE, '3DToolAD-%s.html' % version)
    if os.path.isdir(out):
        out = os.path.join(out, '3DToolAD-%s.html' % version)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    print('3DToolAD %s: %d scripts and %d stylesheets put into one file.' % (version, count['js'], count['css']))
    print('Saved / salvo: %s (%.1f MB)' % (out, os.path.getsize(out) / 1048576))


if __name__ == '__main__':
    main()
