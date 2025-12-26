import { getBook } from "@/database/books"
import { getPositions } from "@/database/positions"
import { getDirtyStatuses, setBookStatusClean } from "@/database/statuses"
import { logger } from "@/logger"
import { areLocatorsEqual } from "@/modules/readium"
import { serverPositionUpdated } from "@/store/actions"
import { type AppDispatch } from "@/store/appState"
import { localApi } from "@/store/localApi"
import { serverApi } from "@/store/serverApi"

import { startAppListening } from "./listenerMiddleware"

export async function syncPositions(dispatch: AppDispatch) {
  const positions = await getPositions()

  for (const position of positions) {
    const { bookUuid, timestamp, locator } = position
    const book = await getBook(bookUuid)

    if (
      !book?.serverUuid ||
      ![book.readaloud, book.ebook, book.audiobook].find(
        (format) => format?.downloadStatus === "DOWNLOADED",
      )
    ) {
      continue
    }

    try {
      logger.debug(`Calling updatePosition`)
      logger.debug({
        bookUuid,
        timestamp,
        locator,
      })

      await dispatch(
        serverApi.endpoints.updatePosition.initiate({
          bookUuid,
          serverUuid: book.serverUuid,
          timestamp,
          locator,
        }),
      ).unwrap()
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        e.status === 409
      ) {
        try {
          logger.debug(
            "Position conflict, attempting to sync newer position from server",
          )
          const { locator: serverLocator, timestamp: serverTimestamp } =
            await dispatch(
              serverApi.endpoints.getPosition.initiate(
                {
                  bookUuid,
                  serverUuid: book.serverUuid,
                },
                { forceRefetch: true },
              ),
            ).unwrap()

          if (
            timestamp !== serverTimestamp ||
            !areLocatorsEqual(locator, serverLocator)
          ) {
            logger.debug(
              "Server position is different from local position, updating local position",
            )
            dispatch(
              serverPositionUpdated({
                bookUuid,
                locator: serverLocator,
                timestamp: serverTimestamp,
              }),
            )
          } else {
            logger.debug("Ignoring server update, equal to local position")
            logger.debug(serverLocator)
          }
        } catch (getError) {
          logger.debug(`Failed to get new position`)
          logger.debug(getError)
          // Ignore any errors here; we'll retry again at the next interval anyway
        }
      } else {
        logger.debug(`Failed to call updatePosition`)
        logger.debug(e)
      }
    }
  }

  const statuses = await getDirtyStatuses()

  for (const status of statuses) {
    const book = await getBook(status.bookUuid)

    if (!book?.serverUuid) {
      continue
    }

    try {
      const serverStatuses = await dispatch(
        serverApi.endpoints.listStatuses.initiate(
          {
            serverUuid: book.serverUuid,
          },
          { forceRefetch: false },
        ),
      ).unwrap()

      const serverStatus = serverStatuses.find((s) => status.name === s.name)
      if (!serverStatus) continue

      await dispatch(
        serverApi.endpoints.updateStatus.initiate({
          bookUuid: book.uuid,
          serverUuid: book.serverUuid,
          statusUuid: serverStatus.uuid,
        }),
      ).unwrap()

      await setBookStatusClean(book.uuid)
    } catch (e) {
      logger.debug(`Failed to call updateStatus`)
      logger.debug(e)
    }
  }
}

startAppListening({
  predicate: () => true,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()

    const { result } = listenerApi.fork(async (forkApi) => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await syncPositions(listenerApi.dispatch)
        await forkApi.delay(10_000)
      }
    })

    await result
  },
})

startAppListening({
  matcher: localApi.endpoints.updateStatus.matchFulfilled,
  effect: async (_, listenerApi) => {
    await syncPositions(listenerApi.dispatch)
  },
})

startAppListening({
  matcher: localApi.endpoints.updatePosition.matchFulfilled,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()

    try {
      await syncPositions(listenerApi.dispatch)
    } finally {
      listenerApi.subscribe()
    }
  },
})
