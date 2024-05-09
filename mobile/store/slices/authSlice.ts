import { PayloadAction, createAction, createSlice } from "@reduxjs/toolkit"

export enum AuthenticationState {
  AUTHENTICATED = "AUTHENTICATED",
  UNAUTHENTICATED = "UNAUTHENTICATED",
  UNKNOWN = "UNKNOWN",
}

export type AuthState = {
  accessToken: string | null
  username: string | null
  authenticated: AuthenticationState
}

const initialState: AuthState = {
  accessToken: null,
  username: null,
  authenticated: AuthenticationState.UNKNOWN,
}

export const loginButtonTapped = createAction(
  "auth/loginButtonTapped",
  ({ username, password }: { username: string; password: string }) => ({
    payload: {
      username,
      password,
    },
  }),
)

export const loginCredentialsHydrated = createAction(
  "auth/loginCredentialsHydrated",
  ({ username, password }: { username: string; password: string }) => ({
    payload: {
      username,
      password,
    },
  }),
)

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    accessTokenHydrated(
      state,
      action: PayloadAction<{ accessToken: string; username: string }>,
    ) {
      const { accessToken, username } = action.payload

      state.username = username
      state.accessToken = accessToken
      state.authenticated = AuthenticationState.AUTHENTICATED
    },
    loggedIn(
      state,
      action: PayloadAction<{ accessToken: string; username: string }>,
    ) {
      const { accessToken, username } = action.payload

      state.username = username
      state.accessToken = accessToken
      state.authenticated = AuthenticationState.AUTHENTICATED
    },
    accessTokenHydrationFailed(state) {
      state.authenticated = AuthenticationState.UNAUTHENTICATED
    },
    logoutButtonTapped(state) {
      state.username = null
      state.accessToken = null
      state.authenticated = AuthenticationState.UNAUTHENTICATED
    },
  },
})
