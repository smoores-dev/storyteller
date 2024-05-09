import { RootState } from "../appState"

export function getAccessToken(state: RootState) {
  return state.auth.accessToken
}

export function getAuthenticationStatus(state: RootState) {
  return state.auth.authenticated
}

export function getUsername(state: RootState) {
  return state.auth.username
}
