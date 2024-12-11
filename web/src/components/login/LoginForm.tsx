"use client"

import { useState } from "react"
import styles from "./loginform.module.css"

type Props = {
  action: (formData: FormData) => Promise<"bad-creds" | undefined>
}

export function LoginForm({ action }: Props) {
  const [errorState, setErrorState] = useState<"bad-creds" | "failed" | null>(
    null,
  )

  return (
    <>
      {errorState === "bad-creds" && (
        <p className={styles["error"]}>Invalid username or password</p>
      )}
      {errorState === "failed" && (
        <p className={styles["error"]}>
          Failed to login. Check server logs for details.
        </p>
      )}
      <form
        className={styles["form"]}
        action={async (formData) => {
          setErrorState(null)
          try {
            const error = await action(formData)
            if (error) {
              setErrorState(error)
            }
          } catch (e) {
            setErrorState("failed")
          }
        }}
      >
        <label htmlFor="username">Username or email address</label>
        <input
          className={styles["input"]}
          id="username"
          name="username"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <label htmlFor="password">Password</label>
        <input
          className={styles["input"]}
          id="password"
          name="password"
          type="password"
        />
        <button type="submit">Login</button>
      </form>
    </>
  )
}
