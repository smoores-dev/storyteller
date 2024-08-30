import {
  DirectoryEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import {
  Button,
  Combobox,
  ComboboxItem,
  ComboboxItemCheck,
  ComboboxPopover,
  ComboboxProvider,
  Form,
  FormControl,
  FormLabel,
  FormSubmit,
  useFormStore,
} from "@ariakit/react"
import { useEffect, useMemo, useState, useTransition } from "react"
import styles from "./serverfilepicker.module.css"
import { matchSorter } from "match-sorter"
import { FolderIcon } from "../icons/FolderIcon"
import { FileIcon } from "../icons/FileIcon"
import { CloseIcon } from "../icons/CloseIcon"

type Props =
  | {
      allowedExtensions: string[]
      multiple?: false | undefined
      onChange: (file: string) => void
    }
  | {
      allowedExtensions: string[]
      multiple: true
      onChange: (files: string[]) => void
    }

export function ServerFilePicker({
  allowedExtensions,
  multiple,
  onChange,
}: Props) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [actionIsPending, setActionIsPending] = useState(false)

  const [isPending, startTransition] = useTransition()

  const form = useFormStore({
    defaultValues: {
      searchDirectory: "/",
      path: multiple ? ([] as string[]) : "/",
    },
  })

  const currentSearchDirectory = form.useValue<string>(
    form.names.searchDirectory,
  )
  const currentPath = form.useValue<string | string[]>(form.names.path)

  useEffect(() => {
    setActionIsPending(true)
    void listDirectoryAction(currentSearchDirectory).then((entries) => {
      setEntries(
        entries.filter(
          (entry) =>
            entry.type === "directory" ||
            allowedExtensions.some((ext) => entry.name.endsWith(ext)),
        ),
      )
      setActionIsPending(false)
    })
  }, [allowedExtensions, currentSearchDirectory])

  const [grandparent, parent, basename] = useMemo(() => {
    const segments = currentSearchDirectory.split("/")
    return [
      segments.slice(0, segments.length - 2).join("/"),
      segments.slice(0, segments.length - 1).join("/"),
      segments[segments.length - 1] ?? "",
    ]
  }, [currentSearchDirectory])

  const matchedEntries = matchSorter(entries, basename, { keys: ["name"] })

  form.useSubmit((state) => {
    onChange(state.values.path as string & string[])
  })

  return (
    <Form store={form} className={styles["form"]}>
      <div className={styles["selected-values"]}>
        {Array.isArray(currentPath) &&
          currentPath.map((path) => {
            const segments = path.split("/")
            return (
              <Button
                key={path}
                onClick={() => {
                  form.setValue(form.names.path, (paths: string[]) =>
                    paths.filter((p) => p !== path),
                  )
                }}
                className={styles["selected-value"]}
              >
                {segments[segments.length - 1]} <CloseIcon height="1rem" />
              </Button>
            )
          })}
      </div>

      <FormLabel hidden name={form.names.path}>
        Path
      </FormLabel>
      <FormControl
        name={form.names.path}
        render={
          <ComboboxProvider
            open={true}
            value={currentSearchDirectory}
            setValue={(value) => {
              startTransition(() => {
                form.setValue(
                  form.names.searchDirectory,
                  value === "" ? "/" : value,
                )
              })
            }}
            selectedValue={currentPath}
            setSelectedValue={(value) => {
              const update =
                typeof value === "string" ? value : value[value.length - 1]
              if (update?.endsWith("/")) {
                form.setValue(form.names.searchDirectory, update)
              } else {
                if (typeof value === "string") {
                  form.setValue(form.names.searchDirectory, value)
                }
                form.setValue(form.names.path, value)
              }
            }}
          >
            <Combobox
              className={styles["combobox-input"]}
              autoComplete="list"
              autoSelect="always"
              multiple={multiple}
            />
            <ComboboxPopover
              disabled={actionIsPending || isPending}
              wrapperProps={{
                className: styles["combobox-wrapper"],
              }}
              className={styles["combobox-items"]}
              hideOnEscape={false}
              hideOnInteractOutside={false}
            >
              {currentSearchDirectory !== "/" && (
                <ComboboxItem
                  key="directory-up"
                  className={styles["combobox-item"]}
                  value={grandparent + "/"}
                  resetValueOnSelect={false}
                >
                  <FolderIcon height="1rem" /> ..
                </ComboboxItem>
              )}
              {matchedEntries.map((entry) => (
                <ComboboxItem
                  key={entry.name}
                  className={styles["combobox-item"]}
                  resetValueOnSelect={false}
                  value={
                    [parent, entry.name].join("/").replaceAll("//", "/") +
                    (entry.type === "directory" ? "/" : "")
                  }
                >
                  {entry.type === "directory" ? (
                    <FolderIcon height="1rem" />
                  ) : (
                    <FileIcon height="1rem" />
                  )}{" "}
                  {entry.name} <ComboboxItemCheck />
                </ComboboxItem>
              ))}
            </ComboboxPopover>
          </ComboboxProvider>
        }
      />
      <FormSubmit
        className={styles["submit-button"]}
        disabled={multiple ? currentPath.length === 0 : currentPath === "/"}
      >
        Choose
      </FormSubmit>
    </Form>
  )
}
