import { ApiClient, ApiClientError } from "@/apiClient"
import { BookDetail, Token } from "@/apiModels"
import { apiHost, proxyRootPath, rootPath } from "@/app/apiHost"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Image from "next/image"
import styles from "./page.module.css"
import { Button, Tab, TabList, TabPanel, TabProvider } from "@ariakit/react"
import { SaveIcon } from "@/components/icons/SaveIcon"

type Props = {
  params: {
    uuid: string
  }
}

export default async function BookEdit({ params: { uuid } }: Props) {
  const cookieStore = cookies()
  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const client = new ApiClient(apiHost, rootPath, token.access_token)

  let book: BookDetail | null = null

  try {
    book = await client.getBookDetails(uuid)
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <main>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    console.error(e)

    return (
      <main>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  const proxyClient = new ApiClient(apiHost, proxyRootPath)

  return (
    <main>
      <h2 className={styles["heading"]}>{book.title}</h2>
      <section className={styles["section"]}>
        <form id="book-details" className={styles["form"]}>
          <div className={styles["cover-art-wrapper"]}>
            <TabProvider defaultSelectedId="text-cover-tab">
              <TabList className={styles["cover-art-tab-list"]}>
                <Tab
                  className={styles["text-cover-art-tab"]}
                  id="text-cover-tab"
                >
                  Text
                </Tab>
                <Tab className={styles["audio-cover-art-tab"]}>Audio</Tab>
              </TabList>
              <TabPanel tabId="text-cover-tab">
                <label className={styles["cover-art-label"]}>
                  <Image
                    className={styles["cover-art"]}
                    height={98 * 3}
                    width={64 * 3}
                    src={proxyClient.getCoverUrl(book.uuid)}
                    alt=""
                    aria-hidden
                  />
                  <span className={styles["cover-art-text"]}>
                    Edit cover art
                  </span>
                  <input
                    className={styles["cover-art-input"]}
                    id="text-cover-art"
                    name="text-cover-art"
                    type="file"
                  />
                </label>
              </TabPanel>
              <TabPanel>
                <label className={styles["cover-art-label"]}>
                  <Image
                    className={styles["cover-art"]}
                    height={64 * 3}
                    width={64 * 3}
                    src={proxyClient.getCoverUrl(book.uuid, true)}
                    alt=""
                    aria-hidden
                  />
                  <span className={styles["cover-art-text"]}>
                    Edit audio cover art
                  </span>
                  <input
                    className={styles["cover-art-input"]}
                    id="audio-cover-art"
                    name="audio-cover-art"
                    type="file"
                  />
                </label>
              </TabPanel>
            </TabProvider>
          </div>
          <div className={styles["text-inputs"]}>
            <Button
              className={styles["save-button"]}
              form="book-details"
              type="submit"
            >
              <SaveIcon />
              <span>Save</span>
            </Button>
            <label className={styles["label"]}>
              Title
              <input
                className={styles["input"]}
                id="title"
                name="title"
                type="text"
                defaultValue={book.title}
              />
            </label>
            <fieldset className={styles["fieldset"]}>
              <legend>Authors</legend>
              {book.authors.map((author) => (
                <input
                  key={author.uuid}
                  className={styles["input"]}
                  aria-label="Author name"
                  id={`author-${author.uuid}`}
                  name={`author-${author.uuid}`}
                  type="text"
                  defaultValue={author.name}
                />
              ))}
              <Button className={styles["button"]}>+ Add author</Button>
            </fieldset>
          </div>
        </form>
      </section>
    </main>
  )
}
