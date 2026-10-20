// Live transfer ("Send to another computer", beta). Transport-agnostic core, unit-tested
// with an in-memory channel; the RTCPeerConnection lives in src/offscreen.
//
// The live code is `<roomId>-<secret>`:
//   - roomId: 6 base32 chars (30 bits), the only part the signalling server ever sees.
//   - secret: a 7-group transfer code (~139 bits) that never leaves the two browsers. It is the
//     package's transfer code (PBKDF2 -> AES-256-GCM, as in crypto.ts) and keys the channel check.
// The channel check: each side's first message is an HMAC over both DTLS fingerprints, so a
// signalling server that swaps SDP to sit in the middle is caught before any package bytes move.

import { strToBytes } from './encoding';
import { normalizeCode } from './crypto';

export const LIVE_CODE_GROUPS = 7;
/** Sender waits this long for the other computer to connect. */
export const LIVE_WAIT_MS = 2 * 60 * 1000;
/** Package text above this goes through file transfer instead (port messages cap at 64 MiB). */
export const LIVE_MAX_CHARS = 48 * 1024 * 1024;
/** Data-channel message size; Chrome handles up to 256 KiB, smaller keeps memory flat. */
export const LIVE_CHUNK_CHARS = 64 * 1024;

const ROOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const ROOM_LEN = 6;
const SECRET_GROUP = '[A-HJKMNP-Z2-9]{4}';
const LIVE_CODE_RE = new RegExp(`^([a-z2-7]{${ROOM_LEN}})-((?:${SECRET_GROUP}-){${LIVE_CODE_GROUPS - 1}}${SECRET_GROUP})$`);

const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export function generateRoomId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(ROOM_LEN));
  return Array.from(rnd, (n) => ROOM_ALPHABET[n & 31]).join('');
}

export function formatLiveCode(roomId: string, secret: string): string {
  return `${roomId}-${secret}`;
}

/** Splits a live code; null when it is not one (whitespace around it is ignored). */
export function parseLiveCode(text: string): { roomId: string; secret: string } | null {
  const m = LIVE_CODE_RE.exec(text.replace(/\s+/g, ''));
  return m ? { roomId: m[1], secret: m[2] } : null;
}

/** DTLS fingerprint lines of an SDP, sorted so the order of lines does not matter. */
export function sdpFingerprints(sdp: string): string {
  const fps = sdp
    .split(/\r?\n/)
    .filter((l) => l.startsWith('a=fingerprint:'))
    .map((l) => l.slice('a=fingerprint:'.length).trim().toLowerCase());
  if (fps.length === 0) throw new Error('No DTLS fingerprint in the connection offer.');
  return [...new Set(fps)].sort().join(',');
}

export type LiveRole = 'sender' | 'receiver';

async function hmacKey(secret: string, roomId: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bs(strToBytes(normalizeCode(secret))), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: bs(strToBytes(`session-transfer-live:${roomId}`)), info: bs(strToBytes('channel-binding')) },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

function bindingData(role: LiveRole, offerSdp: string, answerSdp: string): Uint8Array {
  return strToBytes(`${role}|${sdpFingerprints(offerSdp)}|${sdpFingerprints(answerSdp)}`);
}

const toHex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

/** The minimum a data channel must offer. `drain` resolves when it is fine to send more. */
export interface LiveChannel {
  send(text: string): void;
  next(): Promise<string>;
  drain?(): Promise<void>;
}

export interface LiveSession {
  role: LiveRole;
  roomId: string;
  secret: string;
  /** SDPs as each side applied them: its own local and the remote one it was given. */
  offerSdp: string;
  answerSdp: string;
}

type Frame =
  | { t: 'auth'; tag: string }
  | { t: 'meta'; chars: number }
  | { t: 'chunk'; d: string }
  | { t: 'done' }
  | { t: 'ack' }
  | { t: 'abort'; reason: string };

const send = (ch: LiveChannel, f: Frame) => ch.send(JSON.stringify(f));
async function recv(ch: LiveChannel): Promise<Frame> {
  const f = JSON.parse(await ch.next()) as Frame;
  if (f.t === 'abort') throw new Error(`The other computer stopped the transfer: ${f.reason}`);
  return f;
}

export const MISMATCH_MESSAGE =
  'The connection check failed, so nothing was sent. Check the code, or use the file transfer instead.';

/** Both sides prove they hold the secret and saw the same fingerprints; throws on mismatch. */
async function authenticate(ch: LiveChannel, s: LiveSession): Promise<void> {
  const key = await hmacKey(s.secret, s.roomId);
  const mine = await crypto.subtle.sign('HMAC', key, bs(bindingData(s.role, s.offerSdp, s.answerSdp)));
  send(ch, { t: 'auth', tag: toHex(mine) });
  const theirs = await recv(ch);
  const peer: LiveRole = s.role === 'sender' ? 'receiver' : 'sender';
  const ok =
    theirs.t === 'auth' &&
    (await crypto.subtle.verify('HMAC', key, bs(fromHex(theirs.tag)), bs(bindingData(peer, s.offerSdp, s.answerSdp))));
  if (!ok) {
    send(ch, { t: 'abort', reason: 'connection check failed' });
    throw new Error(MISMATCH_MESSAGE);
  }
}

export async function sendPackage(ch: LiveChannel, s: LiveSession, packageText: string, onProgress?: (sent: number, total: number) => void): Promise<void> {
  await authenticate(ch, s);
  send(ch, { t: 'meta', chars: packageText.length });
  for (let i = 0; i < packageText.length; i += LIVE_CHUNK_CHARS) {
    await ch.drain?.();
    send(ch, { t: 'chunk', d: packageText.slice(i, i + LIVE_CHUNK_CHARS) });
    onProgress?.(Math.min(i + LIVE_CHUNK_CHARS, packageText.length), packageText.length);
  }
  send(ch, { t: 'done' });
  if ((await recv(ch)).t !== 'ack') throw new Error('The other computer did not confirm the transfer.');
}

export async function receivePackage(ch: LiveChannel, s: LiveSession): Promise<string> {
  await authenticate(ch, s);
  try {
    return await readStream(ch);
  } catch (e) {
    send(ch, { t: 'abort', reason: 'bad data' });
    throw e;
  }
}

async function readStream(ch: LiveChannel): Promise<string> {
  const meta = await recv(ch);
  if (meta.t !== 'meta' || meta.chars > LIVE_MAX_CHARS) throw new Error('Unexpected data from the other computer.');
  const parts: string[] = [];
  let got = 0;
  for (;;) {
    const f = await recv(ch);
    if (f.t === 'done') break;
    if (f.t !== 'chunk') throw new Error('Unexpected data from the other computer.');
    got += f.d.length;
    if (got > meta.chars) throw new Error('The other computer sent more data than announced.');
    parts.push(f.d);
  }
  if (got !== meta.chars) throw new Error('The transfer was cut short.');
  send(ch, { t: 'ack' });
  return parts.join('');
}
