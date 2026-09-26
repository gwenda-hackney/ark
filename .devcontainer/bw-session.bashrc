# >>> ark-bw-session >>>
# Keep `bw unlock` across shells in this container. The session key lives in
# RAM (/dev/shm, gone when the container stops) next to the secrets cache;
# treat it like a decrypted vault key. Override the path with BW_SESSION_FILE.
_ark_secrets_dir="${ARK_SECRETS_CACHE_DIR:-/dev/shm/ark-secrets-$(id -u)}"
# Shells started under the old snippet still export its on-disk path.
[ "${BW_SESSION_FILE:-}" = /commandhistory/.bw-session ] && unset BW_SESSION_FILE
export BW_SESSION_FILE="${BW_SESSION_FILE:-$_ark_secrets_dir/bw-session}"
# Older snippets kept it on disk in /commandhistory: move it into RAM once.
if [ -f /commandhistory/.bw-session ] && [ ! -f "$BW_SESSION_FILE" ]; then
  mkdir -p -m 700 "$(dirname "$BW_SESSION_FILE")"
  (umask 077 && cat /commandhistory/.bw-session > "$BW_SESSION_FILE")
fi
rm -f /commandhistory/.bw-session 2>/dev/null
if [ -z "${BW_SESSION:-}" ] && [ -r "$BW_SESSION_FILE" ]; then
  BW_SESSION="$(tr -d '\n\r' < "$BW_SESSION_FILE")"
  export BW_SESSION
fi
bw-unlock() {
  local session
  session="$(command bw unlock --raw)" || return
  export BW_SESSION="$session"
  mkdir -p -m 700 "$(dirname "$BW_SESSION_FILE")"
  (umask 077 && printf '%s\n' "$BW_SESSION" > "$BW_SESSION_FILE")
}
bw-lock() {
  command bw lock "$@"
  unset BW_SESSION
  rm -f "$BW_SESSION_FILE"
  rm -rf "$_ark_secrets_dir"
}
# <<< ark-bw-session <<<
