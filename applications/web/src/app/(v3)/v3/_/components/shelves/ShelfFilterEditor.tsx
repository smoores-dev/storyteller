"use client"

import { Reorder, motion, useDragControls } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { useUserPreferences } from "@v3/_/components/user-preferences-provider"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  RoleMenuItems,
  roleLabel,
} from "@/app/(v3)/v3/_/components/books/RolePicker"
import {
  DurationInput,
  FileSizeInput,
  MultiCombobox,
  NumericInput,
} from "@/app/(v3)/v3/_/components/books/filter-ui"
import { RelationSelectList } from "@/app/(v3)/v3/_/components/books/relation-picker/RelationSelectList"
import { FieldChip } from "@/app/(v3)/v3/_/components/field-chip"
import { useFilterIssueText } from "@/app/(v3)/v3/_/components/shelves/filter-issues"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuGroup,
  FilterableMenuItem,
  FilterableMenuLabel,
  FilterableMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { useRelationItems } from "@/app/(v3)/v3/_/hooks/use-relation-items"
import { type BookWithRelations } from "@/database/books"
import { DEFAULT_RATING_DIMENSIONS } from "@/database/ratingDimensions"
import { statusDisplayLabel } from "@/database/statusKinds"
import {
  FIELDS,
  type FacetSource,
  type Field,
  type FieldGroupKey,
  type QualifierKind,
  RETIRED_FIELDS,
  getFieldDef,
  isField,
  isRetiredField,
} from "@/fields"
import * as icon from "@/icons"
import { FieldIcon } from "@/icons"
import {
  NUMBER_COMPARE_OPERATORS,
  RANGE_OPERATORS,
  type ShelfFilterAnd,
  type ShelfFilterCondition,
  type ShelfFilterField,
  type ShelfFilterNode,
  type ShelfFilterNot,
  type ShelfFilterOperator,
  type ShelfFilterOr,
  createAndBlock,
  createNotBlock,
  createOrBlock,
  getOperatorsForField,
  normalizeRootFilter,
  operatorRequiresArrayValue,
  operatorRequiresRangeValue,
  operatorRequiresValue,
  shelfValueText,
} from "@/shelves"
import {
  getCoverUrl,
  useListIdentifierTypesQuery,
  useListStatusesQuery,
} from "@/store/api"

const FIELD_GROUP_ORDER: FieldGroupKey[] = [
  "text",
  "dates",
  "review",
  "relations",
  "creators",
  "media",
  "alignment",
]

const FIELD_GROUPS = FIELD_GROUP_ORDER.map((key) => ({
  key,
  fields: FIELDS.filter(
    (field) => field !== "search" && getFieldDef(field).group === key,
  ),
})).filter((group) => group.fields.length > 0)

type FilterPreset = {
  key: string
  node: ShelfFilterCondition
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    key: "highlyRated",
    node: {
      type: "condition",
      field: "userRating",
      operator: "greaterOrEqual",
      value: 4,
    },
  },
  {
    key: "audiobooksOnly",
    node: {
      type: "condition",
      field: "format",
      operator: "is",
      value: "audiobook-only",
    },
  },
  {
    key: "ebooksOnly",
    node: {
      type: "condition",
      field: "format",
      operator: "is",
      value: "ebook-only",
    },
  },
  {
    key: "hasReadaloud",
    node: {
      type: "condition",
      field: "format",
      operator: "is",
      value: "readaloud",
    },
  },
  {
    key: "hasReview",
    node: {
      type: "condition",
      field: "review",
      operator: "isNotEmpty",
      value: undefined,
    },
  },
  {
    key: "unrated",
    node: {
      type: "condition",
      field: "userRating",
      operator: "isEmpty",
      value: undefined,
    },
  },
  {
    key: "longBooks",
    node: {
      type: "condition",
      field: "pageCount",
      operator: "greaterOrEqual",
      value: 300,
    },
  },
  // not ready
  // {
  //   key: "authorIsNarrator",
  //   node: {
  //     type: "condition",
  //     field: "creators",
  //     qualifier: "aut",
  //     operator: "intersects",
  //     value: { ref: { qualifier: "nrt" } },
  //   },
  // },
]

type ShelfFilterEditorProps = {
  filter: ShelfFilterNode | null
  onChange: (filter: ShelfFilterNode | null) => void
}

export function hasUnknownFields(node: ShelfFilterNode | null): boolean {
  if (!node) return false
  if (node.type === "condition") return !isField(node.field)
  if (node.type === "not") return hasUnknownFields(node.child)
  return node.children.some((child) => hasUnknownFields(child))
}

export function isFilterValid(node: ShelfFilterNode | null): boolean {
  if (!node) return false

  if (node.type === "condition") {
    if (!isField(node.field)) return false
    if (!operatorRequiresValue(node.operator)) return true

    const isMissingValue =
      node.value === undefined ||
      node.value === null ||
      (typeof node.value === "string" && node.value.trim() === "") ||
      (Array.isArray(node.value) && node.value.length === 0)

    return !isMissingValue
  }

  if (node.type === "not") {
    return isFilterValid(node.child)
  }

  if (node.children.length === 0) return false

  return node.children.every((child) => isFilterValid(child))
}

export function ShelfFilterEditor({
  filter,
  onChange,
}: ShelfFilterEditorProps) {
  const root = normalizeRootFilter(filter)

  useEffect(() => {
    if (root !== filter) {
      onChange(root)
    }
  }, [root, filter, onChange])

  return (
    <div>
      <FilterNodeEditor
        node={root}
        onChange={onChange}
        onRemove={() => {
          onChange(null)
        }}
        isRoot
      />
    </div>
  )
}

function AddNodeDropdown({
  onAdd,
}: {
  onAdd: (node: ShelfFilterNode | FilterPreset) => void
}) {
  const t = useTranslation("ShelfFilterEditor")
  const c = useCommon()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-w-fit gap-1 text-xs"
          >
            <icon.Add className="size-3" />
            {c.plain("actions.add")}
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              onAdd(createAndBlock())
            }}
          >
            {t.plain("andGroup")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onAdd(createOrBlock())
            }}
          >
            {t.plain("orGroup")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onAdd(createNotBlock())
            }}
          >
            {t.plain("not")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.plain("presets")}</DropdownMenuLabel>
          {FILTER_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => {
                onAdd(preset)
              }}
            >
              {t.plain(`preset.${preset.key}` as "preset.highlyRated")}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type FilterPreviewProps = {
  books: BookWithRelations[]
  isLoading: boolean
  isInvalid?: boolean
  hasUnknownFields?: boolean
}

export function FilterPreview({
  books,
  isLoading,
  isInvalid,
  hasUnknownFields,
}: FilterPreviewProps) {
  const t = useTranslation("ShelfFilterEditor")
  const tIssues = useTranslation("ShelfFilterIssues")

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
        <icon.Loader className="size-3 animate-spin" />
        {t.plain("loadingPreview")}
      </div>
    )
  }

  if (isInvalid) {
    return (
      <div className="text-muted-foreground py-2 text-xs">
        {hasUnknownFields
          ? tIssues.plain("fixConditions")
          : t.plain("completeFilter")}
      </div>
    )
  }

  if (books.length === 0) {
    return (
      <div className="text-muted-foreground py-2 text-xs">
        {t.plain("noMatches")}
      </div>
    )
  }

  return (
    <div className="h-full overflow-x-clip">
      <div className="text-muted-foreground text-xs">
        {books.length === 20 ? "> " : ""}
        {t.plain("matchCount", { count: books.length })}
      </div>

      <div className="scroll-y max-h-full">
        {books.map((book) => (
          <PreviewBookItem key={book.uuid} book={book} />
        ))}
      </div>
    </div>
  )
}

export function PreviewBookItem({ book }: { book: BookWithRelations }) {
  const authorNames = book.authors.map((a) => a.name).join(", ")

  return (
    <div className="flex items-center gap-2 py-1">
      <img
        src={getCoverUrl(book.uuid, { height: 32, updatedAt: book.updatedAt })}
        alt=""
        className="h-8 w-6 shrink-0 rounded object-cover"
      />

      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{book.title}</div>
        {authorNames && (
          <div className="text-muted-foreground truncate text-xs">
            {authorNames}
          </div>
        )}
      </div>
    </div>
  )
}

type FilterNodeEditorProps = {
  node: ShelfFilterNode
  onChange: (node: ShelfFilterNode) => void
  onRemove: () => void
  onDuplicate?: () => void
  isRoot?: boolean
}

function FilterNodeEditor({
  node,
  onChange,
  onRemove,
  onDuplicate,
  isRoot = false,
}: FilterNodeEditorProps) {
  if (node.type === "condition") {
    return (
      <ConditionEditor
        condition={node}
        onChange={onChange}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
      />
    )
  }

  if (node.type === "not") {
    return (
      <NotBlockEditor
        block={node}
        onChange={onChange}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        isRoot={isRoot}
      />
    )
  }

  return (
    <LogicalBlockEditor
      block={node}
      onChange={onChange}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
      isRoot={isRoot}
    />
  )
}

function DraggableFilterItem({
  id,
  showHandle,
  children,
}: {
  id: string
  showHandle: boolean
  children: React.ReactNode
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={id}
      dragControls={controls}
      dragListener={false}
      initial={false}
      transition={{ layout: { duration: 0 } }}
      className="list-none"
    >
      <div className="flex items-start gap-1">
        {showHandle && (
          <motion.button
            type="button"
            className="text-muted-foreground mt-2 shrink-0 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => {
              controls.start(e)
            }}
          >
            <icon.GripVertical className="size-3" />
          </motion.button>
        )}

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Reorder.Item>
  )
}

function LogicalBlockEditor({
  block,
  onChange,
  onRemove,
  onDuplicate,
  isRoot = false,
}: {
  block: ShelfFilterAnd | ShelfFilterOr
  onChange: (block: ShelfFilterNode) => void
  onRemove: () => void
  onDuplicate?: () => void
  isRoot?: boolean
}) {
  const t = useTranslation("ShelfFilterEditor")

  const idsRef = useRef<string[]>(block.children.map(() => uuidv4()))

  if (idsRef.current.length < block.children.length) {
    idsRef.current = [
      ...idsRef.current,
      ...block.children.slice(idsRef.current.length).map(() => uuidv4()),
    ]
  } else if (idsRef.current.length > block.children.length) {
    idsRef.current = idsRef.current.slice(0, block.children.length)
  }

  const handleTypeChange = (newType: "and" | "or") => {
    onChange({ ...block, type: newType })
  }

  const handleChildChange = (index: number, child: ShelfFilterNode) => {
    const newChildren = [...block.children]
    newChildren[index] = child
    onChange({ ...block, children: newChildren })
  }

  const handleChildRemove = (index: number) => {
    const newChildren = block.children.filter((_, i) => i !== index)
    idsRef.current = idsRef.current.filter((_, i) => i !== index)

    if (newChildren.length === 0) {
      onRemove()
      return
    }

    onChange({ ...block, children: newChildren })
  }

  const handleChildDuplicate = (index: number) => {
    const child = block.children[index]
    if (!child) return

    const copy = structuredClone(child)
    const newChildren = [...block.children]
    newChildren.splice(index + 1, 0, copy)

    const newIds = [...idsRef.current]
    newIds.splice(index + 1, 0, uuidv4())
    idsRef.current = newIds

    onChange({ ...block, children: newChildren })
  }

  const handleAdd = (node: ShelfFilterNode | FilterPreset) => {
    const currentRoot = normalizeRootFilter(block)

    if ("key" in node) {
      if (currentRoot.type === "and" || currentRoot.type === "or") {
        onChange({
          ...currentRoot,
          children: [...currentRoot.children, structuredClone(node.node)],
        })
      }
      return
    }

    idsRef.current = [...idsRef.current, uuidv4()]
    onChange({ ...block, children: [...block.children, node] })
  }

  const handleReorder = (newIds: string[]) => {
    const newChildren = newIds.map((id) => {
      const oldIndex = idsRef.current.indexOf(id)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return block.children[oldIndex]!
    })

    idsRef.current = newIds
    onChange({ ...block, children: newChildren })
  }

  const items = [
    { value: "and" as const, label: t.plain("and") },
    { value: "or" as const, label: t.plain("or") },
  ]

  const showDragHandles = block.children.length > 1

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select
          value={block.type}
          onValueChange={(v) => {
            handleTypeChange(v as "and" | "or")
          }}
          items={items}
        >
          <SelectTrigger className="h-6 w-fit text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground text-xs">
          {block.type === "and" ? t.plain("allMatch") : t.plain("anyMatch")}
        </span>

        {!isRoot && (
          <div className="ml-auto flex items-center gap-0.5">
            {onDuplicate && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onDuplicate}
                title={t.plain("duplicate")}
              >
                <icon.Copy className="size-3" />
              </Button>
            )}

            <Button variant="ghost" size="icon-xs" onClick={onRemove}>
              <icon.Trash className="size-3" />
            </Button>
          </div>
        )}
      </div>

      <Reorder.Group
        axis="y"
        values={idsRef.current}
        onReorder={handleReorder}
        className={cn(
          "border-muted flex flex-col gap-1",
          !isRoot ? "ml-3 border-l pl-3" : "",
        )}
      >
        {block.children.map((child, index) => (
          <DraggableFilterItem
            key={idsRef.current[index]}
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            id={idsRef.current[index]!}
            showHandle={showDragHandles}
          >
            <FilterNodeEditor
              node={child}
              onChange={(newChild) => {
                handleChildChange(index, newChild)
              }}
              onRemove={() => {
                handleChildRemove(index)
              }}
              onDuplicate={() => {
                handleChildDuplicate(index)
              }}
            />
          </DraggableFilterItem>
        ))}
      </Reorder.Group>

      <div
        className={cn(!isRoot ? "ml-3 pl-3" : "", "flex items-center gap-1")}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            handleAdd({
              type: "condition",
              field: "title",
              operator: "contains",
            })
          }}
        >
          <icon.Plus className="size-3" />
          {t.plain("addCondition")}
          {/* Add condition */}
        </Button>
        <AddNodeDropdown onAdd={handleAdd} />
      </div>
    </div>
  )
}

function NotBlockEditor({
  block,
  onChange,
  onRemove,
  onDuplicate,
  isRoot = false,
}: {
  block: ShelfFilterNot
  onChange: (block: ShelfFilterNode) => void
  onRemove: () => void
  onDuplicate?: () => void
  isRoot?: boolean
}) {
  const t = useTranslation("ShelfFilterEditor")

  const handleChildChange = (child: ShelfFilterNode) => {
    onChange({ ...block, child })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{t.plain("not")}</span>
        <span className="text-muted-foreground text-xs">
          {t.plain("mustNotMatch")}
        </span>

        {!isRoot && (
          <div className="ml-auto flex items-center gap-0.5">
            {onDuplicate && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onDuplicate}
                title={t.plain("duplicate")}
              >
                <icon.Copy className="size-3" />
              </Button>
            )}

            <Button variant="ghost" size="icon-xs" onClick={onRemove}>
              <icon.Trash className="size-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="border-muted ml-3 border-l pl-3">
        <FilterNodeEditor
          node={block.child}
          onChange={handleChildChange}
          onRemove={onRemove}
        />
      </div>
    </div>
  )
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  onDuplicate,
}: {
  condition: ShelfFilterCondition
  onChange: (condition: ShelfFilterNode) => void
  onRemove: () => void
  onDuplicate?: () => void
}) {
  const t = useTranslation("ShelfFilterEditor")
  const c = useCommon()

  if (!isField(condition.field)) {
    return (
      <RetiredConditionRow
        field={condition.field}
        onReplace={(field) => {
          onChange({
            type: "condition",
            field,
            operator:
              getFieldDef(field).defaultOperator ??
              getOperatorsForField(field)[0] ??
              "is",
            value: undefined,
          })
        }}
        onRemove={onRemove}
      />
    )
  }

  const def = getFieldDef(condition.field)
  const qualifierKind = def.qualifier?.kind
  const isCountable = !!def.countable

  const countOperators = [...NUMBER_COMPARE_OPERATORS, ...RANGE_OPERATORS]
  const isCountableOperator = countOperators.some(
    (op) => op === condition.operator,
  )
  const isCount = isCountable && isCountableOperator

  const operators: ShelfFilterOperator[] = getOperatorsForField(condition.field)
  const needsValue = operatorRequiresValue(condition.operator)
  const needsArrayValue = operatorRequiresArrayValue(condition.operator)
  const needsRangeValue = operatorRequiresRangeValue(condition.operator)

  const hasValidValue =
    !needsValue ||
    (condition.value !== undefined &&
      condition.value !== null &&
      (typeof condition.value !== "string" || condition.value.trim() !== "") &&
      (!Array.isArray(condition.value) || condition.value.length > 0))

  const handleFieldChange = (field: ShelfFilterField) => {
    const newOperators = getOperatorsForField(field)
    const fieldDef = getFieldDef(field)
    const newOperator =
      fieldDef.defaultOperator ??
      (newOperators.includes(condition.operator)
        ? condition.operator
        : newOperators[0] ?? "is")

    onChange({
      type: "condition",
      field,
      operator: newOperator,
      value: undefined,
    })
  }

  const handleQualifierChange = (qualifier: string | undefined) => {
    onChange({ ...condition, qualifier })
  }

  const handleOperatorChange = (operator: ShelfFilterOperator) => {
    if (countOperators.some((op) => op === operator)) {
      onChange({
        ...condition,
        aggregate: "count",
        operator: operator,
        value: operatorRequiresValue(operator) ? condition.value : undefined,
      })
      return
    }

    onChange({
      ...condition,
      operator,
      value: operatorRequiresValue(operator) ? condition.value : undefined,
    })
  }

  const handleValueChange = (
    value: string | number | (string | number)[] | null,
  ) => {
    onChange({ ...condition, value: value ?? undefined })
  }

  const operatorItems = operators.map((op) => ({
    value: op,
    label: t.plain(`operators.${op}` as "operators.is"),
  }))

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 py-1",
          !hasValidValue && "opacity-60",
        )}
      >
        <FilterableMenu>
          <FilterableMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="bg-input/20 dark:bg-input/30 border-input rounded-md font-normal"
              >
                <FieldIcon field={condition.field} className="size-3" />
                {c(`fields.label.${condition.field}`)}
                <icon.ChevronDown className="size-3" />
              </Button>
            }
          />
          <FilterableMenuContent>
            {FIELD_GROUPS.map((group) => (
              <FilterableMenuGroup key={group.key}>
                <FilterableMenuLabel>
                  {t.plain(`fieldGroups.${group.key}` as "fieldGroups.text")}
                </FilterableMenuLabel>
                {group.fields.map((field) => (
                  <FilterableMenuItem
                    key={field}
                    icon={<FieldIcon field={field} className="size-3" />}
                    textValue={c(`fields.label.${field}`)}
                    onSelect={() => {
                      handleFieldChange(field)
                    }}
                  >
                    {c(`fields.label.${field}`)}
                  </FilterableMenuItem>
                ))}
              </FilterableMenuGroup>
            ))}
          </FilterableMenuContent>
        </FilterableMenu>

        {/* datePart is declared on the date fields but nothing in the sql layer
        reads it, so it gets no picker */}
        {qualifierKind && qualifierKind !== "datePart" && (
          <QualifierPicker
            kind={qualifierKind}
            value={condition.qualifier}
            onChange={handleQualifierChange}
          />
        )}

        {/* {isCountable && (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={isCount}
            title={t.plain("countToggle")}
            className={cn(
              "bg-input/20 dark:bg-input/30 border-input rounded-md font-normal",
              isCount && "border-primary/40 text-primary",
            )}
            onClick={handleToggleCount}
          >
            <icon.ListNumbers className="size-3" />
          </Button>
        )} */}

        <FilterableMenu>
          <FilterableMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="bg-input/20 dark:bg-input/30 border-input rounded-md font-normal"
              >
                {t.plain(`operators.${condition.operator}` as "operators.is")}
                <icon.ChevronDown className="size-3" />
              </Button>
            }
          />
          <FilterableMenuContent searchable>
            {operatorItems.map((item) => (
              <FilterableMenuItem
                key={item.value}
                textValue={item.label}
                onSelect={() => {
                  handleOperatorChange(item.value)
                }}
              >
                {item.label}
              </FilterableMenuItem>
            ))}
            {isCountable && (
              <FilterableMenuGroup>
                <FilterableMenuLabel>
                  {t.plain("operators.count")}
                </FilterableMenuLabel>
                {countOperators.map((op) => (
                  <FilterableMenuItem
                    key={op}
                    textValue={t.plain(`operators.${op}` as "operators.is")}
                    onSelect={() => {
                      handleOperatorChange(op)
                    }}
                  >
                    {t.plain(`operators.${op}` as "operators.is")}
                  </FilterableMenuItem>
                ))}
              </FilterableMenuGroup>
            )}
          </FilterableMenuContent>
        </FilterableMenu>

        {needsValue && (
          <div className="min-w-[140px] flex-1">
            <ConditionValueInput
              field={condition.field}
              isArray={needsArrayValue}
              isRange={needsRangeValue}
              isCount={isCount}
              value={condition.value}
              onChange={handleValueChange}
            />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDuplicate}
              title={t.plain("duplicate")}
            >
              <icon.Copy className="size-3" />
            </Button>
          )}

          <Button variant="ghost" size="icon-sm" onClick={onRemove}>
            <icon.Trash className="size-3" />
          </Button>
        </div>
      </div>

      {needsValue && !hasValidValue && (
        <span className="text-muted-foreground pl-0.5 text-[10px]">
          {t.plain("pickValue")}
        </span>
      )}
    </div>
  )
}

function RetiredConditionRow({
  field,
  onReplace,
  onRemove,
}: {
  field: string
  onReplace: (field: Field) => void
  onRemove: () => void
}) {
  const { t } = useFilterIssueText()
  const replacement = isRetiredField(field)
    ? RETIRED_FIELDS[field].replacedBy
    : null

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <FieldChip
        field={field}
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs"
      />
      <span className="text-muted-foreground min-w-0 flex-1 text-xs">
        {t(isRetiredField(field) ? "retiredFieldShort" : "unknownFieldShort")}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {replacement && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onReplace(replacement)
            }}
          >
            {t("useReplacement", { new: replacement })}
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onRemove}>
          <icon.Trash className="size-3" />
        </Button>
      </div>
    </div>
  )
}

function QualifierPicker({
  kind,
  value,
  onChange,
}: {
  kind: QualifierKind
  value: string | undefined
  onChange: (qualifier: string | undefined) => void
}) {
  const t = useTranslation("ShelfFilterEditor")
  const { ratingDimensions } = useUserPreferences()
  const { data: identifierTypes = [] } = useListIdentifierTypesQuery(
    undefined,
    { skip: kind !== "identifierScheme" },
  )

  const anyLabel =
    kind === "ratingAxis"
      ? t.plain("qualifier.overall")
      : kind === "identifierScheme"
        ? t.plain("qualifier.anyType")
        : t.plain("qualifier.anyRole")

  const isRole = kind === "role"

  const options: { id: string; label: string }[] = isRole
    ? []
    : kind === "ratingAxis"
      ? (ratingDimensions.length
          ? ratingDimensions
          : DEFAULT_RATING_DIMENSIONS
        ).map((d) => ({ id: d.id, label: d.label }))
      : identifierTypes.map((i) => ({ id: i.uuid, label: i.name }))

  const current = isRole
    ? value
      ? { label: roleLabel(value) }
      : undefined
    : options.find((o) => o.id === value)

  return (
    <FilterableMenu>
      <FilterableMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="bg-input/20 dark:bg-input/30 border-input rounded-md font-normal"
          >
            {current?.label ?? anyLabel}
            <icon.ChevronDown className="size-3" />
          </Button>
        }
      />
      <FilterableMenuContent searchable={isRole || options.length > 10}>
        <FilterableMenuItem
          textValue={anyLabel}
          onSelect={() => {
            onChange(undefined)
          }}
        >
          {anyLabel}
        </FilterableMenuItem>

        {isRole ? (
          <RoleMenuItems
            value={value}
            onSelect={onChange}
            includeAuthorNarrator
          />
        ) : (
          options.map((o) => (
            <FilterableMenuItem
              key={o.id}
              textValue={o.label}
              onSelect={() => {
                onChange(o.id)
              }}
            >
              {o.label}
            </FilterableMenuItem>
          ))
        )}
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

type ConditionValueInputProps = {
  field: ShelfFilterField
  isArray: boolean
  isRange: boolean
  isCount?: boolean
  value: ShelfFilterCondition["value"]
  onChange: (value: string | number | (string | number)[] | null) => void
}

function FacetValueMenu({
  source,
  field,
  value,
  onChange,
  placeholder,
}: {
  source: FacetSource
  field?: ShelfFilterField
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const { items, loading } = useRelationItems(source, true, field)
  const selectedNames = items
    .filter((i) => value.includes(i.uuid))
    .map((i) => i.name)

  return (
    <FilterableMenu open={open} onOpenChange={setOpen}>
      <FilterableMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="bg-input/20 dark:bg-input/30 border-input h-7 w-full justify-between gap-1 rounded-md text-xs font-normal"
          >
            <span className="truncate">
              {selectedNames.length ? selectedNames.join(", ") : placeholder}
            </span>
            <icon.ChevronDown className="size-3 shrink-0" />
          </Button>
        }
      />
      <FilterableMenuContent align="start" className="w-64">
        <RelationSelectList
          items={items}
          loading={loading}
          enabled={open}
          stateOf={(item) => (value.includes(item.uuid) ? "primary" : "none")}
          onSelect={(item) => {
            onChange(
              value.includes(item.uuid)
                ? value.filter((v) => v !== item.uuid)
                : [...value, item.uuid],
            )
          }}
        />
      </FilterableMenuContent>
    </FilterableMenu>
  )
}

function ConditionValueInput({
  field,
  isArray,
  isRange,
  isCount,
  value,
  onChange,
}: ConditionValueInputProps) {
  const t = useTranslation("ShelfFilterEditor")
  const c = useCommon()
  const def = getFieldDef(field)

  const { data: statuses = [] } = useListStatusesQuery()

  if (isCount) {
    if (isRange) {
      const rangeValue = Array.isArray(value) ? value : [0, 10]
      const lo = typeof rangeValue[0] === "number" ? rangeValue[0] : 0
      const hi = typeof rangeValue[1] === "number" ? rangeValue[1] : 10

      return (
        <div className="flex items-center gap-2">
          <NumericInput
            className="h-7 w-20 text-xs"
            value={lo}
            onChange={(n) => {
              onChange([n, hi])
            }}
          />
          <span className="text-muted-foreground text-xs">{t.plain("to")}</span>
          <NumericInput
            className="h-7 w-20 text-xs"
            value={hi}
            onChange={(n) => {
              onChange([lo, n])
            }}
          />
        </div>
      )
    }

    return (
      <NumericInput
        className="h-7 w-20 text-xs"
        value={typeof value === "number" ? value : ""}
        onChange={onChange}
        placeholder={t.plain("numericPlaceholders.default")}
      />
    )
  }

  if (def.control === "duration-range") {
    if (isRange) {
      const rangeValue = Array.isArray(value) ? value : [0, 36000]

      return (
        <div className="flex items-center gap-2">
          <DurationInput
            value={typeof rangeValue[0] === "number" ? rangeValue[0] : 0}
            onChange={(v) => {
              onChange([
                v,
                typeof rangeValue[1] === "number" ? rangeValue[1] : 36000,
              ])
            }}
          />

          <span className="text-muted-foreground text-xs">{t.plain("to")}</span>

          <DurationInput
            value={typeof rangeValue[1] === "number" ? rangeValue[1] : 36000}
            onChange={(v) => {
              onChange([
                typeof rangeValue[0] === "number" ? rangeValue[0] : 0,
                v,
              ])
            }}
          />
        </div>
      )
    }

    return (
      <DurationInput
        value={typeof value === "number" ? value : undefined}
        onChange={onChange}
      />
    )
  }

  if (def.control === "number-range" && def.scale?.unit === "bytes") {
    if (isRange) {
      const rangeValue = Array.isArray(value) ? value : [0, 1073741824]

      return (
        <div className="flex items-center gap-2">
          <FileSizeInput
            value={typeof rangeValue[0] === "number" ? rangeValue[0] : 0}
            onChange={(v) => {
              onChange([
                v,
                typeof rangeValue[1] === "number" ? rangeValue[1] : 1073741824,
              ])
            }}
          />

          <span className="text-muted-foreground text-xs">{t.plain("to")}</span>

          <FileSizeInput
            value={
              typeof rangeValue[1] === "number" ? rangeValue[1] : 1073741824
            }
            onChange={(v) => {
              onChange([
                typeof rangeValue[0] === "number" ? rangeValue[0] : 0,
                v,
              ])
            }}
          />
        </div>
      )
    }

    return (
      <FileSizeInput
        value={typeof value === "number" ? value : undefined}
        onChange={onChange}
      />
    )
  }

  if (
    def.control === "facet" &&
    def.source !== "identifiers" &&
    (isArray || def.source !== "distinct")
  ) {
    const selected = Array.isArray(value) ? (value as string[]) : []

    if (def.source === "statuses" && !isArray) {
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          items={statuses.map((s) => ({
            value: s.uuid,
            label: statusDisplayLabel(s),
          }))}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={t.plain("selectStatus")} />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.uuid} value={s.uuid}>
                {statusDisplayLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    const placeholder =
      def.source === "tags"
        ? t.plain("selectTags")
        : def.source === "collections"
          ? t.plain("selectCollections")
          : def.source === "series"
            ? t.plain("selectSeries")
            : def.source === "statuses"
              ? t.plain("selectStatuses")
              : def.source === "distinct"
                ? t.plain("selectValues")
                : t.plain("selectCreators")

    return (
      <FacetValueMenu
        source={def.source}
        field={field}
        value={selected}
        onChange={onChange}
        placeholder={placeholder}
      />
    )
  }

  if (def.control === "enum") {
    const options = def.options.map((v) => ({
      value: v,
      label: c.plain(
        `fields.options.${field}.${v}` as "fields.options.format.ebook",
      ),
    }))

    if (isArray) {
      return (
        <MultiCombobox
          options={options}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          placeholder={t.plain("searchFormats")}
          emptyText={t.plain("noItemsFound")}
        />
      )
    }

    return (
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
        items={options}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder={t.plain("selectMediaType")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (def.control === "number-range") {
    const min = def.scale?.min ?? 0
    const defaultMax = def.scale?.max ?? 100

    if (isRange) {
      const rangeValue = Array.isArray(value) ? value : [min, defaultMax]

      const rangeStart = typeof rangeValue[0] === "number" ? rangeValue[0] : min
      const rangeEnd =
        typeof rangeValue[1] === "number" ? rangeValue[1] : defaultMax

      return (
        <div className="flex items-center gap-2">
          <NumericInput
            className="h-7 w-20 text-xs"
            value={rangeStart}
            onChange={(n) => {
              onChange([n, rangeEnd])
            }}
          />

          <span className="text-muted-foreground text-xs">{t.plain("to")}</span>

          <NumericInput
            className="h-7 w-20 text-xs"
            value={rangeEnd}
            onChange={(n) => {
              onChange([rangeStart, n])
            }}
          />
        </div>
      )
    }

    return (
      <NumericInput
        className="h-7 w-20 text-xs"
        value={typeof value === "number" ? value : ""}
        onChange={onChange}
        placeholder={t.plain("numericPlaceholders.default")}
      />
    )
  }

  if (def.control === "date-range") {
    if (isRange) {
      const rangeValue = Array.isArray(value) ? value : ["", ""]

      return (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-7 text-xs"
            value={typeof rangeValue[0] === "string" ? rangeValue[0] : ""}
            onChange={(e) => {
              onChange([
                e.target.value,
                typeof rangeValue[1] === "string" ? rangeValue[1] : "",
              ])
            }}
          />

          <span className="text-muted-foreground text-xs">{t.plain("to")}</span>

          <Input
            type="date"
            className="h-7 text-xs"
            value={typeof rangeValue[1] === "string" ? rangeValue[1] : ""}
            onChange={(e) => {
              onChange([
                typeof rangeValue[0] === "string" ? rangeValue[0] : "",
                e.target.value,
              ])
            }}
          />
        </div>
      )
    }

    return (
      <Input
        type="date"
        className="h-7 text-xs"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      />
    )
  }

  if (isArray) {
    const arrayValue = Array.isArray(value)
      ? value.map(shelfValueText).join(", ")
      : ""

    return (
      <Input
        className="h-7 text-xs"
        value={arrayValue}
        onChange={(e) => {
          const values = e.target.value
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v)

          onChange(values.length > 0 ? values : null)
        }}
        placeholder={t.plain("commaSeparatedValues")}
      />
    )
  }

  return (
    <Input
      className="h-7 text-xs"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => {
        onChange(e.target.value || null)
      }}
      placeholder={t.plain("enterValue")}
    />
  )
}
