"use client"

import { Controller, useFieldArray, useWatch } from "react-hook-form"
import { v4 as uuidv4 } from "uuid"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@v3/_/components/ui/field"
import { InfoTip } from "@v3/_/components/ui/info-tip"
import { Input } from "@v3/_/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { MultidimensionalRating } from "@/app/(v3)/v3/_/components/books/BookDetails/sections/MultidimensionalRatingLazy"
import { RatingInput } from "@/app/(v3)/v3/_/components/books/RatingInput"
import { statusDisplayLabel } from "@/database/statusKinds"
import {
  BookDetailDisplays,
  BookOpenTargets,
  CoverFits,
  DoubleCoverAlignments,
  GridCoverDisplays,
  RatingIcons,
} from "@/database/userPreferencesTypes"
import * as icon from "@/icons"
import { useListStatusesQuery } from "@/store/api"

import {
  Book3DPositionPreview,
  CoverFitPreview,
  FlatDetailPreview,
  GridCoverPreview,
} from "./cover-style-preview"
import {
  SettingLabel,
  useLibraryDefaultValue,
  useResolvedDefault,
} from "./library-defaults"
import {
  type PreferencesFormType,
  PreferencesSection,
  SegmentedControl,
} from "./shared"

const USE_LIBRARY_DEFAULT = "__library_default__"

export function BooksTab({ form }: { form: PreferencesFormType }) {
  const t = useTranslation("PreferencesPage.tabs.books.sections")

  const gridCoverOptions = GridCoverDisplays.map((key) => ({
    value: key,
    label: t(`gridDisplay.coverOptions.${key}`),
  }))

  const alignmentOptions = DoubleCoverAlignments.map((key) => ({
    value: key,
    label: t(`gridDisplay.alignmentOptions.${key}`),
  }))

  const detailDisplayOptions = BookDetailDisplays.map((key) => ({
    value: key,
    label: t(`detail.display.options.${key}`),
  }))

  const ratingIconOptions = RatingIcons.map((key) => ({
    value: key,
    label: t(`ratingIcon.options.${key}`),
  }))

  const openTargetOptions = BookOpenTargets.map((key) => ({
    value: key,
    label: t(`opening.options.${key}`),
  }))

  const gridCoverDisplayDefault = useResolvedDefault("gridCoverDisplay")
  const doubleCoverAlignmentDefault = useResolvedDefault("doubleCoverAlignment")
  const coverFitDefault = useResolvedDefault("coverFit")
  const bookDetailDisplayDefault = useResolvedDefault("bookDetailDisplay")
  const ratingIconDefault = useResolvedDefault("ratingIcon")
  const bookOpenTargetDefault = useResolvedDefault("bookOpenTarget")
  const ratingDimensionsDefault = useResolvedDefault("ratingDimensions")
  const accentColorDefault = useLibraryDefaultValue("accentColor")

  const gridCoverDisplay =
    useWatch({ control: form.control, name: "gridCoverDisplay" }) ??
    gridCoverDisplayDefault

  const doubleCoverAlignment =
    useWatch({ control: form.control, name: "doubleCoverAlignment" }) ??
    doubleCoverAlignmentDefault

  const fillsCard = gridCoverDisplay !== "auto"

  const coverFitOptions = CoverFits.filter(
    (key) => !(fillsCard && key === "true-size"),
  ).map((key) => ({
    value: key,
    label: t(`gridDisplay.fitOptions.${key}`),
  }))

  const storedCoverFit =
    useWatch({ control: form.control, name: "coverFit" }) ?? coverFitDefault

  const coverFit =
    fillsCard && storedCoverFit === "true-size" ? "cover" : storedCoverFit

  const bookDetailDisplay =
    useWatch({ control: form.control, name: "bookDetailDisplay" }) ??
    bookDetailDisplayDefault

  const ratingDimensionsValue = useWatch({
    control: form.control,
    name: "ratingDimensions",
  })

  const {
    fields: dimensions,
    append: appendDimension,
    remove: removeDimension,
  } = useFieldArray({
    control: form.control,
    name: "ratingDimensions",
  })

  const primaryColor =
    useWatch({ control: form.control, name: "accentColor" }) ??
    accentColorDefault

  return (
    <div className="space-y-6">
      <PreferencesSection tab="books" section="gridDisplay">
        <Card>
          <CardHeader>
            <CardTitle>{t("gridDisplay.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-6">
              <div className="flex-1 space-y-6">
                <Controller
                  name="gridCoverDisplay"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <SettingLabel field="gridCoverDisplay">
                        {t("gridDisplay.coverLabel")}
                      </SettingLabel>
                      <SegmentedControl
                        value={field.value ?? gridCoverDisplayDefault}
                        onChange={field.onChange}
                        options={gridCoverOptions}
                      />
                    </Field>
                  )}
                />

                {gridCoverDisplay === "auto" && (
                  <Controller
                    name="doubleCoverAlignment"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <SettingLabel field="doubleCoverAlignment">
                          {t("gridDisplay.alignmentLabel")}
                        </SettingLabel>
                        <SegmentedControl
                          value={field.value ?? doubleCoverAlignmentDefault}
                          onChange={field.onChange}
                          options={alignmentOptions}
                        />
                      </Field>
                    )}
                  />
                )}
              </div>

              <GridCoverPreview
                display={gridCoverDisplay}
                alignment={doubleCoverAlignment}
              />
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <Controller
                  name="coverFit"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <SettingLabel field="coverFit">
                        {t("gridDisplay.fitLabel")}
                        <InfoTip>{t("gridDisplay.fitTip")}</InfoTip>
                      </SettingLabel>
                      <SegmentedControl
                        value={coverFit}
                        onChange={field.onChange}
                        options={coverFitOptions}
                      />
                    </Field>
                  )}
                />
              </div>

              <CoverFitPreview fit={coverFit} fill={fillsCard} />
            </div>
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="books" section="opening">
        <Card>
          <CardHeader>
            <CardTitle>{t("opening.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Controller
              name="bookOpenTarget"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="bookOpenTarget">
                    {t("opening.label")}
                    <InfoTip>{t("opening.tip")}</InfoTip>
                  </SettingLabel>
                  <FieldDescription>{t("opening.hint")}</FieldDescription>
                  <SegmentedControl
                    value={field.value ?? bookOpenTargetDefault}
                    onChange={field.onChange}
                    options={openTargetOptions}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="books" section="detail">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Controller
              name="bookDetailDisplay"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="bookDetailDisplay">
                    {t("detail.display.label")}
                  </SettingLabel>
                  <FieldDescription>
                    {t("detail.display.hint")}
                  </FieldDescription>
                  <SegmentedControl
                    value={field.value ?? bookDetailDisplayDefault}
                    onChange={field.onChange}
                    options={detailDisplayOptions}
                  />
                </Field>
              )}
            />
            {bookDetailDisplay === "3d" ? (
              <BookDetail3DPreview form={form} />
            ) : (
              <FlatDetailPreview />
            )}
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="books" section="ratings">
        <Card>
          <CardHeader>
            <CardTitle>{t("ratings.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Controller
              name="ratingIcon"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <SettingLabel field="ratingIcon">
                    {t("ratingIcon.label")}
                  </SettingLabel>
                  <SegmentedControl
                    value={field.value ?? ratingIconDefault}
                    onChange={field.onChange}
                    options={ratingIconOptions}
                  />
                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {t("ratingDimensions.example")}
                    </span>
                    <RatingInput
                      value={3.5}
                      color={primaryColor ?? undefined}
                      iconOverride={field.value ?? ratingIconDefault}
                      onChange={() => {}}
                    />
                  </div>
                </Field>
              )}
            />

            <Field>
              <SettingLabel field="ratingDimensions">
                {t("ratingDimensions.label")}
              </SettingLabel>
              <FieldDescription>{t("ratingDimensions.hint")}</FieldDescription>
              {ratingDimensionsValue == null ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {ratingDimensionsDefault.map((dimension) => (
                      <span
                        key={dimension.id}
                        className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs"
                      >
                        {dimension.label}
                      </span>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      form.setValue(
                        "ratingDimensions",
                        ratingDimensionsDefault.map((dimension) => ({
                          ...dimension,
                        })),
                        { shouldDirty: true },
                      )
                    }}
                  >
                    {t("ratingDimensions.customize")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {dimensions.map((dimension, index) => (
                    <div
                      key={dimension.key}
                      className="flex items-center gap-2"
                    >
                      <Controller
                        name={`ratingDimensions.${index}.label`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder={t("ratingDimensions.placeholder")}
                            className="flex-1"
                          />
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("ratingDimensions.remove")}
                        onClick={() => {
                          removeDimension(index)
                        }}
                      >
                        <icon.Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      appendDimension({ id: uuidv4(), label: "" })
                    }}
                  >
                    <icon.Add className="size-4" />
                    {t("ratingDimensions.add")}
                  </Button>
                </div>
              )}

              <div className="mt-4">
                <span className="text-muted-foreground text-xs font-medium">
                  {t("ratingDimensions.preview")}
                </span>
                <MultidimensionalRating
                  dimensions={ratingDimensionsValue ?? ratingDimensionsDefault}
                  rating={3.5}
                  onRatingChange={() => {}}
                  onUseAverage={() => {}}
                  scores={Object.fromEntries(
                    (ratingDimensionsValue ?? ratingDimensionsDefault).map(
                      (d, i) => [d.id, 3.5 - (i % 2)],
                    ),
                  )}
                  onChange={() => {}}
                  onRemove={() => {}}
                  color={primaryColor ?? undefined}
                />
              </div>
            </Field>
          </CardContent>
        </Card>
      </PreferencesSection>

      <PreferencesSection tab="books" section="defaultStatus">
        <Card>
          <CardHeader>
            <CardTitle>{t("defaultStatus.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DefaultStatusField form={form} />
          </CardContent>
        </Card>
      </PreferencesSection>
    </div>
  )
}

function BookDetail3DPreview({ form }: { form: PreferencesFormType }) {
  const t = useTranslation("PreferencesPage.tabs.books.sections.detail")
  const ebookView = useWatch({
    control: form.control,
    name: "bookDetail3dView",
  })
  const audiobookView = useWatch({
    control: form.control,
    name: "bookDetail3dViewAudio",
  })

  const ebookViewDefault = useResolvedDefault("bookDetail3dView")
  const audiobookViewDefault = useResolvedDefault("bookDetail3dViewAudio")

  return (
    <Field>
      <FieldDescription>{t("view.hint")}</FieldDescription>
      <div className="flex flex-wrap gap-6 pb-4">
        <Field>
          <SettingLabel field="bookDetail3dView">
            {t("view.label")}
          </SettingLabel>
          <Book3DPositionPreview
            ebookView={ebookView ?? ebookViewDefault ?? 0}
            audiobookView={audiobookView ?? audiobookViewDefault ?? 0}
            onViewChange={(view, format) => {
              if (format === "ebook") {
                form.setValue("bookDetail3dView", view)
              } else {
                form.setValue("bookDetail3dViewAudio", view)
              }
            }}
          />
        </Field>
      </div>
    </Field>
  )
}

function DefaultStatusField({ form }: { form: PreferencesFormType }) {
  const t = useTranslation("PreferencesPage.tabs.books.sections.defaultStatus")

  const { data: statuses = [] } = useListStatusesQuery()

  const items = statuses.map((status) => ({
    value: status.uuid,
    label: statusDisplayLabel(status),
  }))

  return (
    <Controller
      name="defaultStatusUuid"
      control={form.control}
      render={({ field }) => (
        <Field>
          <FieldLabel>{t("label")}</FieldLabel>

          <Select
            value={field.value ?? USE_LIBRARY_DEFAULT}
            onValueChange={(v) => {
              field.onChange(v === USE_LIBRARY_DEFAULT ? null : v)
            }}
            items={[
              ...items,
              { value: USE_LIBRARY_DEFAULT, label: t("useLibraryDefault") },
            ]}
          >
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={USE_LIBRARY_DEFAULT}>
                {t("useLibraryDefault")}
              </SelectItem>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  )
}
