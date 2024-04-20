import fuzzysearch

def find_nearest_match(needle: str, haystack: str, max_l_dist: int):
    result = fuzzysearch.find_near_matches(needle, haystack, max_l_dist=int(max_l_dist))
    if len(result) == 0:
        return None
    else:
        return {
            "start": result[0].start,
            "end": result[0].end
        }
