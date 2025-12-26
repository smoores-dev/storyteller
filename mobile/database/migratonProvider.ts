import { type Migration, type MigrationProvider } from "kysely"

type ExpoMigrationProviderProps = {
  migrations: Record<string, Migration>
}

export default class ExpoMigrationProvider implements MigrationProvider {
  migrations: Record<string, Migration>

  constructor(props: ExpoMigrationProviderProps) {
    this.migrations = props.migrations
  }

  public getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(this.migrations)
  }
}
