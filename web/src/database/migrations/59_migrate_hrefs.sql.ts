import { db } from "@/database/connection"

import { fromLegacyLocator } from "../positions"

export default async function migrate() {
  const positions = await db
    .selectFrom("position")
    .selectAll("position")
    .execute()
  const updatedPositions = positions.map((position) => {
    return { ...position, locator: fromLegacyLocator(position.locator) }
  })

  // console.log(updatedPositions)
  await db.transaction().execute(async (tr) => {
    for (const position of updatedPositions) {
      await tr
        .updateTable("position")
        .set({ locator: JSON.stringify(position.locator) })
        .where("uuid", "=", position.uuid)
        .execute()
    }
  })
}
