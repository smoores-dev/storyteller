from nltk.tokenize import word_tokenize
import marisa_trie
import contractions


def read_dict():
    with open("dict/en.txt") as f:
        contents = f.read()
    return [word.lower() for word in contents.split("\n")]


def find_invented_words(text: str):
    all_words = [
        word for word in word_tokenize(contractions.fix(text)) if word.isalpha()
    ]

    dict_word_list = read_dict()
    trie = marisa_trie.Trie(dict_word_list)

    invented_words = [word for word in all_words if word.lower() not in trie]
    return list(set(invented_words))


def generate_initial_prompt(text: str):
    invented_words = find_invented_words(text)
    invented_word_str = ", ".join(invented_words[0:-1]) + ", and " + invented_words[-1]
    initial_prompt = f"The following is a chapter from a fictional story, containing invented words such as {invented_word_str}"
    return initial_prompt
