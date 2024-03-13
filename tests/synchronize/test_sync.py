from storyteller.synchronize.epub import SentenceRange
from storyteller.synchronize.sync import interpolate_sentence_ranges


class TestInterpolateSentenceRanges:
    def test_contiguous(self):
        input = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=2, start=1, end=2, audiofile="1"),
            SentenceRange(id=3, start=2, end=3, audiofile="1"),
        ]
        expected = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=2, start=1, end=2, audiofile="1"),
            SentenceRange(id=3, start=2, end=3, audiofile="1"),
        ]
        assert expected == interpolate_sentence_ranges(input)

    def test_simple_gap(self):
        input = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=3, start=2, end=3, audiofile="1"),
        ]
        expected = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=2, start=1, end=2, audiofile="1"),
            SentenceRange(id=3, start=2, end=3, audiofile="1"),
        ]
        assert expected == interpolate_sentence_ranges(input)

    def test_large_gap(self):
        input = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=4, start=3, end=4, audiofile="1"),
        ]
        expected = [
            SentenceRange(id=1, start=0, end=1, audiofile="1"),
            SentenceRange(id=2, start=1, end=2, audiofile="1"),
            SentenceRange(id=3, start=2, end=3, audiofile="1"),
            SentenceRange(id=4, start=3, end=4, audiofile="1"),
        ]
        assert expected == interpolate_sentence_ranges(input)
