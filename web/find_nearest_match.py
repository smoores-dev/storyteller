import json
import sys
import fuzzysearch

if __name__ == "__main__":
    args = sys.argv
    _, needle, haystack, max_l_dist = args
    result = fuzzysearch.find_near_matches(needle, haystack, max_l_dist=int(max_l_dist))
    if len(result) == 0:
        print("null")
    else:
        print(json.dumps({"start": result[0].start, "end": result[0].end}))
