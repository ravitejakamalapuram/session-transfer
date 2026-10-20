// Offscreen document (reason WEB_RTC) that owns the RTCPeerConnection for live transfer. The
// service worker has no WebRTC and the popup closes when it loses focus, so a sender can paste
// the code into chat on another window while this page keeps waiting.

import { LIVE_WAIT_MS, LiveChannel, receivePackage, sendPackage } from '../core/live';
import { LIVE_PORT_NAME, LiveRequest, LiveResponse } from '../core/messages';
import { SignalClient } from '../core/signal-client';

// STUN only: it tells each browser its public address. No TURN relay in v1 (see the plan).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const GATHER_MS = 5000;
const CONNECT_MS = 20_000;
const HIGH_WATER = 1024 * 1024;

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, GATHER_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

function opened(dc: RTCDataChannel, ms: number): Promise<void> {
  if (dc.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    dc.onopen = () => (clearTimeout(t), resolve());
  });
}

function channel(dc: RTCDataChannel): LiveChannel {
  const queue: string[] = [];
  const waiters: Array<{ ok: (s: string) => void; fail: (e: Error) => void }> = [];
  let closed = false;
  dc.bufferedAmountLowThreshold = HIGH_WATER / 2;
  dc.onmessage = (e) => (waiters.length ? waiters.shift()!.ok(String(e.data)) : queue.push(String(e.data)));
  dc.onclose = () => {
    closed = true;
    for (const w of waiters.splice(0)) w.fail(new Error('The connection closed before the transfer finished.'));
  };
  return {
    send: (s) => dc.send(s),
    next: () =>
      queue.length
        ? Promise.resolve(queue.shift()!)
        : closed
          ? Promise.reject(new Error('The connection closed before the transfer finished.'))
          : new Promise((ok, fail) => waiters.push({ ok, fail })),
    drain: () =>
      dc.bufferedAmount < HIGH_WATER
        ? Promise.resolve()
        : new Promise((ok, fail) => {
            if (closed) return fail(new Error('The connection closed before the transfer finished.'));
            dc.addEventListener('bufferedamountlow', () => ok(), { once: true });
            dc.addEventListener('close', () => fail(new Error('The connection closed before the transfer finished.')), { once: true });
          }),
  };
}

async function runSend(req: Extract<LiveRequest, { type: 'send' }>, post: (m: LiveResponse) => void, abort: AbortSignal) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  abort.addEventListener('abort', () => pc.close());
  try {
    const dc = pc.createDataChannel('package', { ordered: true });
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    const offerSdp = pc.localDescription!.sdp;
    const signal = new SignalClient(req.roomId);
    await signal.put('offer', offerSdp);
    post({ type: 'status', stage: 'waiting' });
    const answerSdp = await signal.wait('answer', Date.now() + LIVE_WAIT_MS, abort);
    if (abort.aborted) return;
    if (!answerSdp) return post({ type: 'timeout' });
    post({ type: 'status', stage: 'connecting' });
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    try {
      await opened(dc, CONNECT_MS);
    } catch {
      return post({ type: 'timeout' });
    }
    post({ type: 'status', stage: 'sending', pct: 0 });
    await sendPackage(channel(dc), { role: 'sender', roomId: req.roomId, secret: req.secret, offerSdp, answerSdp }, req.packageText, (n, total) =>
      post({ type: 'status', stage: 'sending', pct: Math.round((n / total) * 100) }),
    );
    post({ type: 'sent' });
  } finally {
    pc.close();
  }
}

async function runReceive(req: Extract<LiveRequest, { type: 'receive' }>, post: (m: LiveResponse) => void, abort: AbortSignal) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  abort.addEventListener('abort', () => pc.close());
  try {
    const dcPromise = new Promise<RTCDataChannel>((r) => (pc.ondatachannel = (e) => r(e.channel)));
    const signal = new SignalClient(req.roomId);
    post({ type: 'status', stage: 'connecting' });
    // The sender may still be gathering candidates when the code arrives, so wait briefly.
    const offerSdp = await signal.wait('offer', Date.now() + 15_000, abort);
    if (abort.aborted) return;
    if (!offerSdp) throw new Error('No transfer is waiting for this code. Start a new one on the other computer.');
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    const answerSdp = pc.localDescription!.sdp;
    await signal.put('answer', answerSdp);
    const dc = await Promise.race([
      dcPromise,
      new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), CONNECT_MS)),
    ]).catch(() => null);
    if (!dc) return post({ type: 'timeout' });
    const ch = channel(dc);
    try {
      await opened(dc, CONNECT_MS);
    } catch {
      return post({ type: 'timeout' });
    }
    post({ type: 'status', stage: 'receiving' });
    const packageText = await receivePackage(ch, { role: 'receiver', roomId: req.roomId, secret: req.secret, offerSdp, answerSdp });
    post({ type: 'received', packageText });
  } finally {
    pc.close();
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== LIVE_PORT_NAME) return;
  let open = true;
  port.onDisconnect.addListener(() => (open = false));
  // The sender keeps going after the popup closes; it just stops reporting.
  const post = (m: LiveResponse) => open && port.postMessage(m);
  const abort = new AbortController();
  port.onMessage.addListener((req: LiveRequest) => {
    if (req.type === 'cancel') return abort.abort();
    const run = req.type === 'send' ? runSend(req, post, abort.signal) : runReceive(req, post, abort.signal);
    run.catch((e: Error) => abort.signal.aborted || post({ type: 'error', message: e.message }));
  });
});
