#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Servidor local do dashboard.

Use este no lugar de `python3 -m http.server`: o servidor embutido do Python
só manda Last-Modified, e o navegador passa a servir JS e CSS antigos
indefinidamente — a tela continua com o comportamento de versões passadas
mesmo depois de o arquivo mudar no disco. Aqui todo arquivo vai com
Cache-Control: no-store, então cada F5 busca a versão atual.

    python3 servir.py            # http://localhost:8777
    python3 servir.py 3000       # outra porta
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.abspath(__file__))
PORTA_PADRAO = 8777


class SemCache(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, formato, *args):
        # Só erros: o log de cada asset polui o terminal sem informar nada.
        if args and str(args[1]).startswith(('4', '5')):
            sys.stderr.write('%s - %s\n' % (self.address_string(), formato % args))


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else PORTA_PADRAO
    try:
        servidor = ThreadingHTTPServer(('127.0.0.1', porta), SemCache)
    except OSError as e:
        print('Não consegui abrir a porta %d: %s' % (porta, e))
        print('Provavelmente já há um servidor rodando nela. Feche-o (Ctrl+C) ou use outra porta.')
        return 1
    print('Dashboard em http://localhost:%d' % porta)
    print('Sem cache: cada recarga pega a versão atual dos arquivos.')
    print('Ctrl+C para parar.')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\nservidor parado')
    return 0


if __name__ == '__main__':
    sys.exit(main())
