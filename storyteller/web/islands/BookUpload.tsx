import { useRef, useState } from "preact/hooks";
import axios from "axios";

export default function BookUpload() {
  const epubInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [epubUploadProgress, setEpubUploadProgress] = useState<number | null>(
    1,
  );
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(
    1,
  );
  const [bookId, setBookId] = useState<number | null>(1);

  return (
    <>
      <h2>Upload epub file</h2>
      <form
        id="epub-upload"
        onSubmit={(event) => {
          event.preventDefault();
          console.log(event.defaultPrevented);
          if (!epubInputRef.current?.files?.[0]) return;
          console.log(epubInputRef.current.files[0]);

          axios.postForm(
            "http://localhost:8000/books/epub",
            { file: epubInputRef.current.files[0] },
            {
              onUploadProgress({ progress }) {
                setEpubUploadProgress(progress ?? null);
              },
            },
          ).then(({ data }) => {
            const { bookId } = data;

            setBookId(bookId);
          });
        }}
      >
        <input
          id="epub-file"
          name="epub-file"
          ref={epubInputRef}
          type="file"
        />
        <button type="submit">Submit</button>
      </form>
      <div>
        {epubUploadProgress !== null && (
          <p>Uploading... {epubUploadProgress * 100}</p>
        )}
      </div>
      <h2>Upload audio file</h2>
      <form
        id="audio-upload"
        onSubmit={(event) => {
          event.preventDefault();
          if (!audioInputRef.current?.files?.[0]) return;

          axios.postForm(
            `http://localhost:8000/books/${bookId}/audio`,
            { file: audioInputRef.current.files[0] },
            {
              onUploadProgress({ progress }) {
                setAudioUploadProgress(progress ?? null);
              },
            },
          );
        }}
      >
        <input
          id="audio-file"
          name="audio-file"
          ref={audioInputRef}
          type="file"
        />
        <button type="submit">Submit</button>
      </form>
      <div>
        {audioUploadProgress !== null && (
          <p>Uploading... {audioUploadProgress * 100}</p>
        )}
      </div>
      {epubUploadProgress !== null && audioUploadProgress !== null && (
        <button
          type="button"
          onClick={() => {
            axios.post(`http://localhost:8000/books/${bookId}/process`);
          }}
        >
          Start processing!
        </button>
      )}
    </>
  );
}
