# >>> ark-bw-session >>>
# Persist `bw unlock` across shells in this container. Treat the session file
# like a decrypted vault key. Override path with BW_SESSION_FILE.
export BW_SESSION_FILE="${BW_SESSION_FILE:-/commandhistory/.bw-session}"
if [ -z "${BW_SESSION:-}" ] && [ -r "$BW_SESSION_FILE" ]; then
  BW_SESSION="$(tr -d '\n\r' < "$BW_SESSION_FILE")"
  export BW_SESSION
fi
bw-unlock() {
  local session
  session="$(command bw unlock --raw)" || return
  export BW_SESSION="$session"
  if [ -n "${BW_SESSION_FILE:-}" ]; then
    (umask 077 && printf '%s\n' "$BW_SESSION" > "$BW_SESSION_FILE")
    chmod 600 "$BW_SESSION_FILE" 2>/dev/null || true
  fi
}
bw-lock() {
  command bw lock "$@"
  unset BW_SESSION
  rm -f "${BW_SESSION_FILE:-/commandhistory/.bw-session}"
}
# <<< ark-bw-session <<<
