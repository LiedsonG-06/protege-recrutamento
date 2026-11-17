#!/usr/bin/env bash
set -euo pipefail
[[ -s dist/index.html && -d dist/assets ]] || exit 1
# Rejeitar metadados, fontes e ficheiros de servidor, mesmo se copiados por public/.
if find dist \( -type l -o -name '.*' -o -name node_modules -o -name src -o -name tests -o -name 'php.ini' -o -name 'cgi-bin' -o -name '*.map' -o -name '*.php' -o -name '*.pem' -o -name '*.key' \) -print -quit | grep -q .; then
  echo 'Build rejeitado: conteúdo não permitido em dist/.' >&2
  exit 1
fi
