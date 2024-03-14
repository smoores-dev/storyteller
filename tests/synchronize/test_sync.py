from storyteller.synchronize.epub import SentenceRange
from storyteller.synchronize.sync import interpolate_sentence_ranges


class TestInterpolateSentenceRanges:
    def test_contiguous(self):
        input = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=2, start=38.22, end=53.036, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=3, start=53.036, end=65.122, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        expected = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=2, start=38.22, end=53.036, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=3, start=53.036, end=65.122, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        assert expected == interpolate_sentence_ranges(input)

    def test_simple_gap(self):
        input = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=3, start=53.036, end=65.122, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        expected = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=2, start=38.22, end=53.036, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=3, start=53.036, end=65.122, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        assert expected == interpolate_sentence_ranges(input)

    def test_large_gap(self):
        input = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=4, start=65.122, end=69.384, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        expected = [
            SentenceRange(
                id=1, start=0, end=38.22, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=2, start=38.22, end=51.671, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=3, start=51.671, end=65.122, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
            SentenceRange(
                id=4, start=65.122, end=69.384, audiofile="Nocturnes-00001-Crooner.mp4"
            ),
        ]
        assert expected == interpolate_sentence_ranges(input)
