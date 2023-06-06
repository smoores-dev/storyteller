import { Head } from "$fresh/runtime.ts";
import BookUpload from "../islands/BookUpload.tsx";

export default function Home() {
  return (
    <>
      <Head>
        <title>Storyteller</title>
      </Head>
      <main>
        <BookUpload />
      </main>
    </>
  );
}
