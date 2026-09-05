import { type BookEvent } from "@/events"
import { type JobEvent } from "@/jobEvents"

type ChannelMap = {
  book: BookEvent
  job: JobEvent
}

type Channel = keyof ChannelMap

type Envelope = {
  [K in Channel]: { channel: K; event: ChannelMap[K] }
}[Channel]

type Signal =
  | { t: "event"; envelope: Envelope }
  | { t: "alive"; id: string }
  | { t: "claim"; id: string }
  | { t: "bye"; id: string }
  | { t: "who" }

const ENDPOINT = "/api/v2/events"
const BUS_NAME = "storyteller-event-stream"

const LEADER_TIMEOUT_MS = 30_000
const ALIVE_INTERVAL_MS = 5_000
const WATCHDOG_INTERVAL_MS = 2_000
const ELECTION_DELAY_MS = 400

const listeners = {
  book: new Set(),
  job: new Set(),
} as { [K in Channel]: Set<(event: ChannelMap[K]) => void> }

const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

let started = false
let isLeader = false
let bus: BroadcastChannel | null = null
let source: EventSource | null = null
let lastLeaderSeen = 0
let electionTimer: ReturnType<typeof setTimeout> | null = null
let aliveTimer: ReturnType<typeof setInterval> | null = null
let watchdog: ReturnType<typeof setInterval> | null = null

function post(signal: Signal) {
  bus?.postMessage(signal)
}

function dispatch(envelope: Envelope) {
  const set = listeners[envelope.channel] as Set<(event: unknown) => void>
  for (const listener of [...set]) listener(envelope.event)
}

function openSource() {
  if (source) return

  source = new EventSource(ENDPOINT)
  source.addEventListener("message", (m: MessageEvent<string>) => {
    const envelope = JSON.parse(m.data) as Envelope
    dispatch(envelope)
    post({ t: "event", envelope })
  })
  source.addEventListener("ping", () => {
    post({ t: "alive", id: tabId })
  })
}

function closeSource() {
  source?.close()
  source = null
}

function becomeLeader() {
  if (isLeader) return

  isLeader = true
  post({ t: "claim", id: tabId })
  openSource()
  aliveTimer = setInterval(() => {
    post({ t: "alive", id: tabId })
  }, ALIVE_INTERVAL_MS)
}

function stepDown() {
  if (!isLeader) return

  isLeader = false
  if (aliveTimer) clearInterval(aliveTimer)
  aliveTimer = null
  closeSource()
}

function elect() {
  if (isLeader || electionTimer) return

  post({ t: "who" })
  electionTimer = setTimeout(() => {
    electionTimer = null
    if (Date.now() - lastLeaderSeen < ELECTION_DELAY_MS) return
    becomeLeader()
  }, ELECTION_DELAY_MS)
}

function handleSignal(signal: Signal) {
  switch (signal.t) {
    case "who":
      if (isLeader) post({ t: "alive", id: tabId })
      return

    case "event":
      lastLeaderSeen = Date.now()
      if (!isLeader) dispatch(signal.envelope)
      return

    case "alive":
    case "claim":
      lastLeaderSeen = Date.now()
      if (!isLeader) return
      if (signal.id < tabId) stepDown()
      else post({ t: "alive", id: tabId })
      return

    case "bye":
      if (!isLeader) elect()
      return
  }
}

function handlePageHide() {
  if (!isLeader) return
  post({ t: "bye", id: tabId })
  stepDown()
}

function checkLeader() {
  if (isLeader) return
  if (Date.now() - lastLeaderSeen > LEADER_TIMEOUT_MS) elect()
}

function start() {
  if (started) return
  started = true

  if (typeof BroadcastChannel === "undefined") {
    openSource()
    return
  }

  bus = new BroadcastChannel(BUS_NAME)
  bus.addEventListener("message", (m: MessageEvent<Signal>) => {
    handleSignal(m.data)
  })
  window.addEventListener("pagehide", handlePageHide)
  watchdog = setInterval(checkLeader, WATCHDOG_INTERVAL_MS)
  elect()
}

function stop() {
  if (!started) return
  started = false

  if (isLeader) post({ t: "bye", id: tabId })
  stepDown()
  closeSource()

  if (watchdog) clearInterval(watchdog)
  watchdog = null
  if (electionTimer) clearTimeout(electionTimer)
  electionTimer = null
  lastLeaderSeen = 0

  window.removeEventListener("pagehide", handlePageHide)
  bus?.close()
  bus = null
}

export function subscribeToEventStream<K extends Channel>(
  channel: K,
  listener: (event: ChannelMap[K]) => void,
): () => void {
  if (typeof EventSource === "undefined") return () => {}

  listeners[channel].add(listener)
  start()

  return () => {
    listeners[channel].delete(listener)
    if (listeners.book.size === 0 && listeners.job.size === 0) {
      stop()
    }
  }
}
