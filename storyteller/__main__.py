from storyteller.audio import search_for_sentence, split_audio_file
from storyteller.epub import get_chapter_keyphrases, read_chapter

def build_index(epub_filepath: str, audio_filepath: str):
    split_audio_file(audio_filepath)

if __name__ == "__main__":
    print(
        get_chapter_keyphrases(
            "/workspaces/storyteller/assets/text/rhythm-of-war.epub/OEBPS/xhtml/chapter1.xhtml"
        )[0:5]
    )
    print(
        search_for_sentence(
            "/workspaces/storyteller/assets/audio/storyteller-test-3.wav",
            "when he survived the desolation",
        )
    )
