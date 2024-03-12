"use client"

import { User } from "@/apiModels"
import styles from "./userstatus.module.css"
import { UserActions } from "./UserActions"

type Props = {
  user: User
  onUpdate: () => void
}

export function UserStatus({ user, onUpdate }: Props) {
  // const [showPermissions, setShowPermissions] = useState(false)

  return (
    <div className={styles["container"]}>
      <div className={styles["content"]}>
        <h4>{user.full_name}</h4>
        <div>{user.username}</div>
        <div>{user.email}</div>
      </div>
      <div className={styles["actions"]}>
        <UserActions
          user={user}
          // onEdit={() => setShowPermissions(true)}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  )
}
