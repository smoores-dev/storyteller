import { configureStore } from "@reduxjs/toolkit"
import createSagaMiddleware from "redux-saga"
import { librarySlice } from "./slices/librarySlice"
import { bookshelfSlice } from "./slices/bookshelfSlice"
import { authSlice } from "./slices/authSlice"
import { apiSlice } from "./slices/apiSlice"
import { rootSaga } from "./sagas/rootSaga"
import { startupSlice } from "./slices/startupSlice"
import { logger } from "../logger"
import { loggingMiddleware } from "./middleware/logging"
import { crashReportingMiddleware } from "./middleware/crashReporting"
import { loggingSlice } from "./slices/loggingSlice"
import { toolbarSlice } from "./slices/toolbarSlice"

const sagaMiddleware = createSagaMiddleware({
  onError(error, errorInfo) {
    logger.error(error)
    logger.error(errorInfo.sagaStack)
    alert(
      `Encountered an error, you may need to restart the app:\n${error.toString()}`,
    )
    sagaMiddleware.run(rootSaga)
  },
})

export const store = configureStore({
  reducer: {
    library: librarySlice.reducer,
    bookshelf: bookshelfSlice.reducer,
    auth: authSlice.reducer,
    api: apiSlice.reducer,
    startup: startupSlice.reducer,
    logging: loggingSlice.reducer,
    toolbar: toolbarSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => [
    crashReportingMiddleware,
    loggingMiddleware,
    ...getDefaultMiddleware({ serializableCheck: false }),
    sagaMiddleware,
  ],
})

sagaMiddleware.run(rootSaga)
