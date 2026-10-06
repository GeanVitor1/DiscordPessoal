// Expected Windows restrictions must be reported without discarding consent.
// Protocol/IPC failures still close the session and release all held input.
export function nativeFailure(detail = '') {
  const code = String(detail).split(/[ :]/)[0];
  const recoverable = ['ELEVATION_REQUIRED', 'DESKTOP_UNAVAILABLE', 'INPUT_BLOCKED', 'UNKNOWN_SCAN_CODE', 'UNKNOWN_KEY'].includes(code);
  return { code: code || 'NATIVE_ERROR', recoverable };
}
