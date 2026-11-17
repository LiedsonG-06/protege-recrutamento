#!/usr/bin/env bash
set -euo pipefail
umask 077
mode=${1:?}
release=${2:?}
[[ "$release" =~ ^[0-9]+-[0-9]+$ ]] || exit 1
[[ "$mode" == prepare || "$mode" == publish || "$mode" == rollback ]] || exit 1
target=/home/protegeo/public_html/recrutamento
base=/home/protegeo/deploy-recrutamento
[[ -d "$target" && "$(realpath "$target")" == "$target" && -w "$target" ]] || exit 1
[[ -z "$(find "$target" -type l -print -quit)" ]] || exit 1
# Recusar ficheiros especiais e entradas sem permissões, antes de copiar.
[[ -z "$(find "$target" ! -type d ! -type f -print -quit)" ]] || exit 1
while IFS= read -r -d '' entry; do
  [[ -w "$entry" ]] || exit 1
done < <(find "$target" -print0)
if [[ "$mode" == prepare ]]; then
  mkdir -p "$base"
  [[ "$(realpath "$base")" == "$base" ]] || exit 1
  chmod 700 "$base"
  mkdir "$base/$release"
  tar -czf "$base/$release/backup.tar.gz" -C "$target" .
  tar -tzf "$base/$release/backup.tar.gz" >/dev/null
  echo "Backup criado para release $release (fora da pasta pública)."
  exit
fi
[[ "$(realpath "$base/$release")" == "$base/$release" ]] || exit 1
if [[ "$mode" == rollback ]]; then
  # Repor apenas conteúdo da aplicação; configurações actuais preservadas.
  tar -xzf "$base/$release/backup.tar.gz" -C "$target" \
    --exclude='.htaccess' --exclude='.user.ini' --exclude='php.ini' \
    --exclude='.well-known' --exclude='cgi-bin' --no-same-owner
  echo "Backup reposto; assets novos não referenciados foram conservados."
  exit
fi
mkdir "$base/$release/unpacked"
tar -xzf "$base/$release/frontend.tar.gz" -C "$base/$release/unpacked" --no-same-owner
cd "$base/$release/unpacked"
[[ -s index.html && -d assets ]] || exit 1
[[ -z "$(find . -mindepth 1 \( -type l -o -name '.*' -o -name src -o -name tests -o -name node_modules -o -name php.ini -o -name cgi-bin -o -name '*.php' -o -name '*.key' -o -name '*.pem' -o -name '*.map' \) -print -quit)" ]] || exit 1
find . -type d -exec chmod 755 {} +
find . -type f -exec chmod 644 {} +
# Assets primeiro; nenhuma operação de remoção, nenhuma configuração incluída.
tar -cf - --exclude='./index.html' . | tar -xf - -C "$target" --no-same-owner
# index só é substituído depois da cópia dos restantes ficheiros.
cp index.html "$target/index.html.deploy-$release"
mv "$target/index.html.deploy-$release" "$target/index.html"
echo "Publicação concluída: $release"
