#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera a entrada de um cliente no registro e o link de acesso dele.

Uso:
    python3 scripts/gerar-cliente.py "Nome do Cliente" 1234567890
    python3 scripts/gerar-cliente.py "Nome" 1234567890 --page 123 --ig 456
    python3 scripts/gerar-cliente.py "Nome" 1234567890 --dominio https://dash.seudominio.com

A chave é sorteada aqui e aparece uma vez. Guarde o JSON na variável de
ambiente AG_CLIENTS do projeto na Vercel — nunca no repositório.
"""
import argparse, json, os, re, secrets, sys, unicodedata


def slugify(name):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or 'cliente'


def main():
    ap = argparse.ArgumentParser(description='Gera entrada e link de um cliente.')
    ap.add_argument('nome')
    ap.add_argument('account_id')
    ap.add_argument('--page', default='', help='Page ID do Facebook (opcional)')
    ap.add_argument('--ig', default='', help='Instagram Business ID (opcional)')
    ap.add_argument('--slug', default='', help='slug do link (padrão: derivado do nome)')
    ap.add_argument('--dominio', default='https://SEU-PROJETO.vercel.app',
                    help='domínio onde o dashboard está publicado')
    ap.add_argument('--registro', default='',
                    help='JSON atual do AG_CLIENTS, para acrescentar em vez de recomeçar')
    a = ap.parse_args()

    slug = a.slug or slugify(a.nome)
    key = secrets.token_hex(16)

    entrada = {
        'name': a.nome,
        'accountId': re.sub(r'^act_', '', a.account_id.strip()),
        'pageId': a.page.strip(),
        'igId': a.ig.strip(),
        'key': key,
    }

    registro = {}
    if a.registro:
        fonte = a.registro
        if os.path.isfile(fonte):
            with open(fonte, encoding='utf-8') as fh:
                fonte = fh.read()
        try:
            registro = json.loads(fonte)
        except ValueError:
            print('Registro anterior não é um JSON válido.', file=sys.stderr)
            return 1
    if slug in registro:
        print('Já existe um cliente com o slug "%s". Use --slug para outro.' % slug, file=sys.stderr)
        return 1
    registro[slug] = entrada

    link = '%s/c/%s?k=%s' % (a.dominio.rstrip('/'), slug, key)

    print('\nLINK DO CLIENTE (mande este endereço):\n')
    print('  ' + link)
    print('\nAG_CLIENTS — cole o valor abaixo na variável de ambiente do projeto:\n')
    print(json.dumps(registro, ensure_ascii=False, indent=2))
    print('\nA chave aparece só agora. Para revogar o link depois, troque o "key"')
    print('deste cliente e gere um endereço novo — os outros clientes não são afetados.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
