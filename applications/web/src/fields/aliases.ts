import { FIELDS, FIELD_REGISTRY, type Field } from "./registry"

export type AliasField = {
  [F in Field]: (typeof FIELD_REGISTRY)[F] extends { alias: unknown }
    ? F
    : never
}[Field]

export type BaseField = Exclude<Field, AliasField>

export const ALIAS_FIELDS = FIELDS.filter(
  (f) => "alias" in FIELD_REGISTRY[f],
) as AliasField[]

export function resolveFieldAlias(field: Field): {
  field: BaseField
  qualifier?: string
} {
  const def = FIELD_REGISTRY[field]
  if ("alias" in def) {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    return { field: def.alias.of as BaseField, qualifier: def.alias.qualifier }
  }
  return { field: field as BaseField }
}
