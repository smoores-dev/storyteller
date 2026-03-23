import { Agent } from "undici"
/**
 * necessary bc there's a default timeout of 300 seconds for all `fetch` requests, which is
 * often shorter than the time it takes for the whisper server to respond
 */
export const createTimeoutAgent = (timeout: number) =>
  new Agent({
    // 1 hour timeout lmao
    headersTimeout: timeout,
    bodyTimeout: timeout,
    // connection shouldnt be that long
    connectTimeout: 30e3,
  })
