# Sequence Alignment using Levenshtein Distance
# March 4, 2019 - Adam Rule

# See https://www.ncbi.nlm.nih.gov/pubmed/20064801 for algorithmic details
# requires nltk data be downloaded

import re
import nltk
import numpy as np

name = "text_align"


def calculate_redundancy(a, b):
    """Calculate the redundnacy between two lists using sequence alignment

    Parameters:
    a: str - String of text
    b: str - String of text

    Return:
    redundancy: float - proportion of words in b that overlap with a"""

    # And the overlap is...
    token_a, token_b = tokenize_text(a, b)
    seq, seq_a, seq_b = levenshtein(token_a, token_b)
    redundancy = np.dot(seq_a, seq_b) / len(token_b)

    return redundancy


def tokenize_text(a, b):
    """Tokenize a string of words into a list of words

    Parameters:
    a: str - String of text
    b: str - String of text

    Return:
    token_a: list - tokenized words
    token_b: list - tokenized words"""

    # tokenize the files so they become arrays of individual words and punctuation
    token_a = nltk.tokenize.word_tokenize(a)
    token_b = nltk.tokenize.word_tokenize(b)

    # only include words with at least one number or letter
    token_a = [x for x in token_a if re.search("[a-zA-Z0-9]", x)]
    token_b = [x for x in token_b if re.search("[a-zA-Z0-9]", x)]

    return token_a, token_b


def levenshtein(token_a, token_b, sub_cost=1000000, gap_cost=1):
    """Align two sequences of words using Levenshtein distance

    Parameters:
    token_a: list - most likely chars or strings
    token_b: list - most likely chars or strings
    sub_cost: int - cost of substituting items
    gap_cost: int - cost of deleting or inserting items

    Return:
    seq: list - master alignment including items from both sequences
    seq_a: list - binary flags showing which parts of seq align with a
    seq_b: list - binary flags showing which parts of seq align with b"""

    score = levenshtein_score(token_a, token_b, sub_cost, gap_cost)
    seq, seq_a, seq_b = levenshtein_align(token_a, token_b, score)

    return seq, seq_a, seq_b


def levenshtein_score(a, b, sub_cost=1000000, gap_cost=1):
    """Calculate the Levenshtein distance for two arrays of like objects

    Parameters:
    a: list - most likely chars or strings
    b: list - most likely chars or strings
    sub_cost: int - cost of substituting items
    gap_cost: int - cost of deleting or inserting items

    Return:
    score: numpy array - scoring matrix used to calculate distance"""

    len_a = len(a)
    len_b = len(b)

    # initialize scoring array with zeros and indexes on first column and row
    score = np.zeros((len_a + 1, len_b + 1))
    score[:, 0] = np.array(range(len_a + 1))
    score[0, :] = np.array(range(len_b + 1))

    # score the matrix
    for j in range(1, len_b + 1):
        for i in range(1, len_a + 1):

            # no cost if items match
            # arbitrarily large substitution cost ensures only additions and deletions
            if a[i - 1] == b[j - 1]:
                match_cost = 0
            else:
                match_cost = sub_cost

            # use least costly alignment method
            match_score = score[i - 1, j - 1] + match_cost
            del_score = score[i - 1, j] + 1
            ins_score = score[i, j - 1] + 1

            score[i, j] = min(match_score, del_score, ins_score)

    return score


def levenshtein_align(a, b, score):
    """Align two sequences using their Levenshtein distance

    Parameters:
    a: list - most likely chars or strings
    b: list - most likely chars or strings
    score: numpy array - scoring matrix used to calculate distance

    Return:
    seq: list - master alignment including items from both sequences
    seq_a: list - binary flags showing which parts of seq align with a
    seq_b: list - binary flags showing which parts of seq align with b"""

    # reconstruct the sequence from by back-walking the matrix from the bottom right corner
    i = len(a)
    j = len(b)

    # initialize lists to track combined sequence and components
    seq = []
    seq_a = []
    seq_b = []

    while i > 0 or j > 0:

        if i == 0:
            # add
            seq.append(b[j - 1])
            seq_a.append(0)
            seq_b.append(1)
            j -= 1
            continue
        if j == 0:
            # subtract
            seq.append(a[i - 1])
            seq_a.append(1)
            seq_b.append(0)
            i -= 1
            continue

        cur_val = score[i, j]
        eq_val = score[i - 1, j - 1]
        sub_val = score[i - 1, j]
        add_val = score[i, j - 1]

        if sub_val == cur_val - 1:
            # subtract
            seq.append(a[i - 1])
            seq_a.append(1)
            seq_b.append(0)
            i -= 1
            continue

        if add_val == cur_val - 1:
            # add
            seq.append(b[j - 1])
            seq_a.append(0)
            seq_b.append(1)
            j -= 1
            continue

        if eq_val == cur_val - 1 or eq_val == cur_val:
            # move up the diagonal
            seq.append(a[i - 1])
            seq_a.append(1)
            seq_b.append(1)
            i -= 1
            j -= 1
            continue

    # reverse sequences
    seq.reverse()
    seq_a.reverse()
    seq_b.reverse()

    return seq, seq_a, seq_b
