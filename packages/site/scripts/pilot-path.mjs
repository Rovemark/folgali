// The e2e and proof scripts drive a real browser through Logica Pilot, a separate browser engine that is not part of this
// repository. Point LOGICA_PILOT at its entry file (index.js); there is no default path.
export function pilotPath() {
  const p = process.env.LOGICA_PILOT
  if (!p) {
    console.error('LOGICA_PILOT is not set: point it at the entry file (index.js) of the Logica Pilot browser engine.')
    process.exit(2)
  }
  return p
}
