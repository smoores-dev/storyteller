import copy
from storyteller.synchronize.epub import SentenceRange
from storyteller.synchronize.sync import (
    get_sentence_ranges,
    interpolate_sentence_ranges,
)

segments = [
    {
        "start": 65.163,
        "end": 71.648,
        "audiofile": "00001.mp4",
        "text": "I can identify the exact moment when my journey to becoming a professional music listener began.",
        "words": [
            {"word": "I", "start": 65.163, "end": 65.183, "score": 0.0},
            {
                "word": "can",
                "start": 66.544,
                "end": 66.704,
                "score": 0.903,
            },
            {
                "word": "identify",
                "start": 66.744,
                "end": 67.325,
                "score": 0.82,
            },
            {
                "word": "the",
                "start": 67.365,
                "end": 67.465,
                "score": 0.875,
            },
            {
                "word": "exact",
                "start": 67.545,
                "end": 67.925,
                "score": 0.924,
            },
            {
                "word": "moment",
                "start": 68.005,
                "end": 68.305,
                "score": 0.879,
            },
            {
                "word": "when",
                "start": 68.345,
                "end": 68.486,
                "score": 0.748,
            },
            {
                "word": "my",
                "start": 68.526,
                "end": 68.666,
                "score": 0.878,
            },
            {
                "word": "journey",
                "start": 68.726,
                "end": 69.046,
                "score": 0.722,
            },
            {
                "word": "to",
                "start": 69.086,
                "end": 69.186,
                "score": 0.556,
            },
            {
                "word": "becoming",
                "start": 69.226,
                "end": 69.647,
                "score": 0.87,
            },
            {"word": "a", "start": 69.687, "end": 69.727, "score": 0.5},
            {
                "word": "professional",
                "start": 69.787,
                "end": 70.367,
                "score": 0.885,
            },
            {
                "word": "music",
                "start": 70.427,
                "end": 70.768,
                "score": 0.893,
            },
            {
                "word": "listener",
                "start": 70.828,
                "end": 71.208,
                "score": 0.886,
            },
            {
                "word": "began.",
                "start": 71.248,
                "end": 71.648,
                "score": 0.892,
            },
        ],
    },
    {
        "start": 72.349,
        "end": 77.333,
        "audiofile": "00001.mp4",
        "text": "It was at a Led Zeppelin concert at the Forum Arena in Los Angeles when I was 20 years old.",
        "words": [
            {
                "word": "It",
                "start": 72.349,
                "end": 72.409,
                "score": 0.864,
            },
            {
                "word": "was",
                "start": 72.449,
                "end": 72.569,
                "score": 0.781,
            },
            {
                "word": "at",
                "start": 72.629,
                "end": 72.729,
                "score": 0.805,
            },
            {
                "word": "a",
                "start": 72.789,
                "end": 72.809,
                "score": 0.996,
            },
            {
                "word": "Led",
                "start": 72.869,
                "end": 73.09,
                "score": 0.833,
            },
            {
                "word": "Zeppelin",
                "start": 73.11,
                "end": 73.55,
                "score": 0.829,
            },
            {
                "word": "concert",
                "start": 73.61,
                "end": 74.051,
                "score": 0.909,
            },
            {
                "word": "at",
                "start": 74.111,
                "end": 74.171,
                "score": 0.762,
            },
            {
                "word": "the",
                "start": 74.211,
                "end": 74.271,
                "score": 0.994,
            },
            {
                "word": "Forum",
                "start": 74.331,
                "end": 74.651,
                "score": 0.691,
            },
            {
                "word": "Arena",
                "start": 74.731,
                "end": 75.091,
                "score": 0.835,
            },
            {
                "word": "in",
                "start": 75.172,
                "end": 75.252,
                "score": 0.908,
            },
            {
                "word": "Los",
                "start": 75.292,
                "end": 75.512,
                "score": 0.896,
            },
            {
                "word": "Angeles",
                "start": 75.612,
                "end": 76.032,
                "score": 0.854,
            },
            {
                "word": "when",
                "start": 76.072,
                "end": 76.192,
                "score": 0.879,
            },
            {
                "word": "I",
                "start": 76.212,
                "end": 76.273,
                "score": 0.524,
            },
            {
                "word": "was",
                "start": 76.313,
                "end": 76.413,
                "score": 0.736,
            },
            {"word": "20"},
            {
                "word": "years",
                "start": 76.753,
                "end": 77.073,
                "score": 0.632,
            },
            {
                "word": "old.",
                "start": 77.193,
                "end": 77.333,
                "score": 0.861,
            },
        ],
    },
    {
        "start": 77.954,
        "end": 82.078,
        "audiofile": "00001.mp4",
        "text": "Hundreds of concerts later I'd still rank it as one of the best I've ever seen.",
        "words": [
            {
                "word": "Hundreds",
                "start": 77.954,
                "end": 78.274,
                "score": 0.889,
            },
            {
                "word": "of",
                "start": 78.314,
                "end": 78.374,
                "score": 0.75,
            },
            {
                "word": "concerts",
                "start": 78.414,
                "end": 78.875,
                "score": 0.857,
            },
            {
                "word": "later",
                "start": 78.935,
                "end": 79.235,
                "score": 0.893,
            },
            {
                "word": "I'd",
                "start": 79.696,
                "end": 79.836,
                "score": 0.789,
            },
            {
                "word": "still",
                "start": 79.916,
                "end": 80.156,
                "score": 0.855,
            },
            {
                "word": "rank",
                "start": 80.216,
                "end": 80.456,
                "score": 0.851,
            },
            {
                "word": "it",
                "start": 80.516,
                "end": 80.596,
                "score": 0.653,
            },
            {
                "word": "as",
                "start": 80.697,
                "end": 80.777,
                "score": 0.794,
            },
            {
                "word": "one",
                "start": 80.857,
                "end": 80.937,
                "score": 0.948,
            },
            {
                "word": "of",
                "start": 80.977,
                "end": 81.037,
                "score": 0.749,
            },
            {
                "word": "the",
                "start": 81.097,
                "end": 81.177,
                "score": 0.854,
            },
            {
                "word": "best",
                "start": 81.217,
                "end": 81.457,
                "score": 0.733,
            },
            {
                "word": "I've",
                "start": 81.517,
                "end": 81.637,
                "score": 0.868,
            },
            {
                "word": "ever",
                "start": 81.697,
                "end": 81.858,
                "score": 0.71,
            },
            {
                "word": "seen.",
                "start": 81.898,
                "end": 82.078,
                "score": 1.0,
            },
        ],
    },
]

mismatched_segment = {
    "start": 72.349,
    "end": 77.333,
    "audiofile": "00001.mp4",
    "text": "This is just a completely different sentence that doesn't match the original sentence at all.",
    "words": [
        {
            "word": "This",
            "start": 72.349,
            "end": 72.409,
            "score": 0.864,
        },
        {
            "word": "is",
            "start": 72.449,
            "end": 72.569,
            "score": 0.781,
        },
        {
            "word": "just",
            "start": 72.629,
            "end": 72.729,
            "score": 0.805,
        },
        {
            "word": "a",
            "start": 72.789,
            "end": 72.809,
            "score": 0.996,
        },
        {
            "word": "completely",
            "start": 72.869,
            "end": 73.09,
            "score": 0.833,
        },
        {
            "word": "different",
            "start": 73.11,
            "end": 73.55,
            "score": 0.829,
        },
        {
            "word": "sentence",
            "start": 73.61,
            "end": 74.051,
            "score": 0.909,
        },
        {
            "word": "that",
            "start": 74.111,
            "end": 74.171,
            "score": 0.762,
        },
        {
            "word": "doesn't",
            "start": 74.211,
            "end": 74.271,
            "score": 0.994,
        },
        {
            "word": "match",
            "start": 74.331,
            "end": 74.651,
            "score": 0.691,
        },
        {
            "word": "the",
            "start": 74.731,
            "end": 75.091,
            "score": 0.835,
        },
        {
            "word": "original",
            "start": 75.172,
            "end": 75.252,
            "score": 0.908,
        },
        {
            "word": "sentence",
            "start": 75.292,
            "end": 75.512,
            "score": 0.896,
        },
        {
            "word": "at",
            "start": 75.612,
            "end": 76.032,
            "score": 0.854,
        },
        {
            "word": "all.",
            "start": 76.072,
            "end": 77.333,
            "score": 0.879,
        },
    ],
}

sentences = [
    "I CAN IDENTIFY THE EXACT MOMENT WHEN MY JOURNEY to becoming a professional music listener began.",
    "It was at a Led Zeppelin concert at the Forum arena in Los Angeles when I was twenty years old.",
    "Hundreds of concerts later, I’d still rank it as one of the best I’ve ever seen.",
]

sentence_ranges = [
    SentenceRange(id=0, start=65.163, end=72.349, audiofile="00001.mp4"),
    SentenceRange(id=1, start=72.349, end=77.954, audiofile="00001.mp4"),
    SentenceRange(id=2, start=77.954, end=82.078, audiofile="00001.mp4"),
]


class TestGetSentenceRanges:
    def test_all_matchable(self):
        input = {
            "start_sentence": 0,
            "transcription": {
                "segments": segments,
                "word_segments": [],
            },
            "sentences": sentences,
            "chapter_offset": 0,
            "last_sentence_range": SentenceRange(
                id=-1, start=0, end=65.163, audiofile="00001.mp4"
            ),
        }

        expected = sentence_ranges

        assert expected == get_sentence_ranges(**input)

    def test_missing_sentence(self):
        segments_with_gap = [segments[0], mismatched_segment, segments[2]]
        input = {
            "start_sentence": 0,
            "transcription": {
                "segments": segments_with_gap,
                "word_segments": [],
            },
            "sentences": sentences,
            "chapter_offset": 0,
            "last_sentence_range": SentenceRange(
                id=-1, start=0, end=65.163, audiofile="00001.mp4"
            ),
        }

        first_range = copy.copy(sentence_ranges[0])
        # The second sentence isn't matched, so the first
        # sentence ends at the end of the last word
        first_range.end = 71.648

        expected = [first_range, sentence_ranges[2]]

        assert expected == get_sentence_ranges(**input)


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
