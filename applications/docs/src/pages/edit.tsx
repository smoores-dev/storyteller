import BrowserOnly from "@docusaurus/BrowserOnly"
import Head from "@docusaurus/Head"
import Layout from "@theme/Layout"
import React, { Suspense, lazy } from "react"

const StudioPage = lazy(() => import("../studio/docusaurus/StudioPage"))

export default function EditPage() {
  return (
    <Layout title="Docs studio" noFooter>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <BrowserOnly
        fallback={<p style={{ padding: 24 }}>Loading the docs studio…</p>}
      >
        {() => (
          <Suspense
            fallback={<p style={{ padding: 24 }}>Loading the docs studio…</p>}
          >
            <StudioPage />
          </Suspense>
        )}
      </BrowserOnly>
    </Layout>
  )
}
