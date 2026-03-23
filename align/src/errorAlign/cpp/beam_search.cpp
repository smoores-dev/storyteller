#include <napi.h>
#include <algorithm>
#include <tuple>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <string>
#include <limits>
#include <codecvt>
#include <locale>

// ---------- Helpers ----------
std::u32string utf8_to_u32(const std::string& s) {
    std::wstring_convert<std::codecvt_utf8<char32_t>, char32_t> conv;
    return conv.from_bytes(s);
}

static inline uint64_t pair_key(int hyp, int ref) {
    return (static_cast<uint64_t>(static_cast<uint32_t>(hyp)) << 32) |
           static_cast<uint32_t>(ref);
}

// ---------- SrcView: C++ mirror of SubgraphMetadata ----------
struct SrcView {
    std::u32string ref;
    std::u32string hyp;
    int ref_max_idx;
    int hyp_max_idx;
    std::vector<int> ref_char_types;
    std::vector<int> hyp_char_types;
    std::vector<int> ref_idx_map;
    std::vector<int> hyp_idx_map;

    std::unordered_set<uint64_t> backtrace_keys;
    std::unordered_set<uint64_t> unambiguous_keys;
    std::vector<int> ref_nonneg_psum;
    std::vector<int> hyp_nonneg_psum;
};

static std::vector<int> read_int_array(const Napi::Array& arr) {
    std::vector<int> result;
    result.reserve(arr.Length());
    for (uint32_t i = 0; i < arr.Length(); i++) {
        result.push_back(arr.Get(i).As<Napi::Number>().Int32Value());
    }
    return result;
}

static std::unordered_set<uint64_t> read_index_set(Napi::Env env, const Napi::Value& set_val) {
    std::unordered_set<uint64_t> result;
    Napi::Function array_from = env.Global()
        .Get("Array").As<Napi::Object>()
        .Get("from").As<Napi::Function>();
    Napi::Array arr = array_from.Call({set_val}).As<Napi::Array>();
    for (uint32_t i = 0; i < arr.Length(); i++) {
        Napi::Array pair = arr.Get(i).As<Napi::Array>();
        int hyp = pair.Get((uint32_t)0).As<Napi::Number>().Int32Value();
        int ref = pair.Get((uint32_t)1).As<Napi::Number>().Int32Value();
        result.insert(pair_key(hyp, ref));
    }
    return result;
}

static SrcView make_src_view(Napi::Env env, const Napi::Object& src) {
    SrcView v;
    v.ref = utf8_to_u32(src.Get("ref").As<Napi::String>().Utf8Value());
    v.hyp = utf8_to_u32(src.Get("hyp").As<Napi::String>().Utf8Value());
    v.ref_max_idx = src.Get("refMaxIndex").As<Napi::Number>().Int32Value();
    v.hyp_max_idx = src.Get("hypMaxIndex").As<Napi::Number>().Int32Value();
    v.ref_char_types = read_int_array(src.Get("refCharTypes").As<Napi::Array>());
    v.hyp_char_types = read_int_array(src.Get("hypCharTypes").As<Napi::Array>());
    v.ref_idx_map = read_int_array(src.Get("refIndexMap").As<Napi::Array>());
    v.hyp_idx_map = read_int_array(src.Get("hypIndexMap").As<Napi::Array>());

    v.backtrace_keys = read_index_set(env, src.Get("backtraceNodeSet"));
    v.unambiguous_keys = read_index_set(env, src.Get("unambiguousMatches"));

    // Build prefix sums for O(1) slice checks
    auto build_psum = [](const std::vector<int>& a) {
        std::vector<int> ps(a.size() + 1, 0);
        for (size_t i = 0; i < a.size(); ++i)
            ps[i + 1] = ps[i] + (a[i] >= 0);
        return ps;
    };
    v.ref_nonneg_psum = build_psum(v.ref_idx_map);
    v.hyp_nonneg_psum = build_psum(v.hyp_idx_map);

    // Sanity check
    if (v.ref_max_idx != static_cast<int>(v.ref.size()) - 1)
        throw std::runtime_error("Ref length mismatch: expected ref_max_idx = ref.size() - 1");
    if (v.hyp_max_idx != static_cast<int>(v.hyp.size()) - 1)
        throw std::runtime_error("Hyp length mismatch: expected hyp_max_idx = hyp.size() - 1");

    return v;
}

// Optimized set membership checks
static inline bool in_backtrace(const SrcView* s, int hyp, int ref) {
    return s->backtrace_keys.find(pair_key(hyp, ref)) != s->backtrace_keys.end();
}

static inline bool in_unambiguous(const SrcView* s, int hyp, int ref) {
    return s->unambiguous_keys.find(pair_key(hyp, ref)) != s->unambiguous_keys.end();
}

// ---------- Path (C++ analog) ----------
struct Path {
    const SrcView* src;  // non-owning
    int ref_idx = -1;
    int hyp_idx = -1;
    int last_ref_idx = -1;
    int last_hyp_idx = -1;
    double closed_cost = 0.0;
    double open_cost = 0.0;
    bool at_unambiguous_match_node = false;
    std::vector<std::tuple<int,int,double>> end_indices;
    std::uint64_t sort_id = 0;

    inline bool at_end() const {
        return hyp_idx == src->hyp_max_idx && ref_idx == src->ref_max_idx;
    }

    inline std::pair<int,int> index() const { return {hyp_idx, ref_idx}; }

    inline static bool is_substitution(int hyp_i, int ref_i, int last_hyp_i, int last_ref_i) {
        if (ref_i == last_ref_i || hyp_i == last_hyp_i) return false;
        return true;
    }

    inline double cost() const {
        bool is_sub = is_substitution(hyp_idx, ref_idx, last_hyp_idx, last_ref_idx);
        return closed_cost + open_cost + (is_sub ? open_cost : 0.0);
    }

    inline double norm_cost() const {
        double c = cost();
        if (c == 0.0) return 0.0;
        return c / (ref_idx + hyp_idx + 3.0);
    }

    inline std::size_t prune_id() const {
        std::size_t h = 1469598103934665603ull;
        auto mix = [&](long long x){
            for (int i=0;i<8;i++) {
                h ^= (std::size_t)((x >> (i*8)) & 0xff);
                h *= 1099511628211ull;
            }
        };
        mix(hyp_idx);
        mix(ref_idx);
        mix(last_hyp_idx);
        mix(last_ref_idx);
        return h;
    }
};

// ---------- Small utilities ----------

// O(1) prefix-sum slice check
static inline bool has_valid_slice_any_nonneg_psum(const std::vector<int>& psum,
                                                   int start_inclusive, int end_exclusive) {
    if (start_inclusive < 0) start_inclusive = 0;
    if (end_exclusive > (int)psum.size() - 1) end_exclusive = (int)psum.size() - 1;
    if (end_exclusive <= start_inclusive) return false;
    return (psum[end_exclusive] - psum[start_inclusive]) > 0;
}

static inline void reset_segment_variables(Path& p, int hyp_idx, int ref_idx) {
    p.closed_cost += p.open_cost;
    bool is_sub = Path::is_substitution(hyp_idx, ref_idx, p.last_hyp_idx, p.last_ref_idx);
    if (is_sub) p.closed_cost += p.open_cost;
    p.last_hyp_idx = hyp_idx;
    p.last_ref_idx = ref_idx;
    p.open_cost = 0.0;
}

static inline void end_insertion_segment(Path& p, int hyp_idx, int ref_idx) {
    bool hyp_slice_ok = has_valid_slice_any_nonneg_psum(p.src->hyp_nonneg_psum, p.last_hyp_idx + 1, hyp_idx + 1);
    bool ref_is_empty = (ref_idx == p.last_ref_idx);
    if (hyp_slice_ok && ref_is_empty) {
        p.end_indices.emplace_back(hyp_idx, ref_idx, p.open_cost);
        reset_segment_variables(p, hyp_idx, ref_idx);
    }
}

static inline bool end_segment(Path& p) {
    bool ref_slice_ok = has_valid_slice_any_nonneg_psum(p.src->ref_nonneg_psum, p.last_ref_idx + 1, p.ref_idx + 1);
    if (!ref_slice_ok) {
        return false;
    }

    bool hyp_is_empty = (p.hyp_idx == p.last_hyp_idx);
    if (hyp_is_empty) {
        p.end_indices.emplace_back(p.hyp_idx, p.ref_idx, p.open_cost);
    } else {
        bool hyp_slice_ok = has_valid_slice_any_nonneg_psum(p.src->hyp_nonneg_psum, p.last_hyp_idx + 1, p.hyp_idx + 1);
        if (!hyp_slice_ok) {
            return false;
        }
        bool is_match_segment = (p.open_cost == 0.0);
        p.at_unambiguous_match_node =
            is_match_segment && in_unambiguous(p.src, p.hyp_idx, p.ref_idx);
        p.end_indices.emplace_back(p.hyp_idx, p.ref_idx, p.open_cost);
    }

    reset_segment_variables(p, p.hyp_idx, p.ref_idx);
    return true;
}

static const uint64_t B = 146527ULL;

uint64_t update_hash(uint64_t h, uint64_t t) {
    return h * B + t;
}

static inline Path transition_to_child_node(const Path& parent, int ref_step, int hyp_step) {
    Path child = parent;
    child.ref_idx = parent.ref_idx + ref_step;
    child.hyp_idx = parent.hyp_idx + hyp_step;
    child.at_unambiguous_match_node = false;
    int transition_value = ref_step * 2 + hyp_step;
    child.sort_id = update_hash(parent.sort_id, transition_value);
    return child;
}

static int add_substitution_or_match(const Path& parent, Path& out_child) {
    if (parent.ref_idx >= parent.src->ref_max_idx || parent.hyp_idx >= parent.src->hyp_max_idx) {
        return 0;
    }
    Path child = transition_to_child_node(parent, 1, 1);

    bool is_match = (parent.src->ref[child.ref_idx] == parent.src->hyp[child.hyp_idx]);
    if (!is_match) {
        bool ref_is_delim = (parent.src->ref_char_types[child.ref_idx] == 0);
        bool hyp_is_delim = (parent.src->hyp_char_types[child.hyp_idx] == 0);
        if (ref_is_delim || hyp_is_delim) {
            return 0;
        }
    }

    if (parent.src->ref[child.ref_idx] == '<') {
        end_insertion_segment(child, parent.hyp_idx, parent.ref_idx);
    }

    if (!is_match) {
        bool is_backtrace = in_backtrace(parent.src, parent.hyp_idx, parent.ref_idx);
        bool letter_type_match = (parent.src->ref_char_types[child.ref_idx] == parent.src->hyp_char_types[child.hyp_idx]);
        child.open_cost += letter_type_match ? 2.0 : 3.0;
        child.open_cost += is_backtrace ? 0.0 : 1.0;
    }

    if (child.src->ref[child.ref_idx] == '>') {
        if (!end_segment(child)) return 0;
    }

    out_child = std::move(child);
    return 1;
}

static int add_insert(const Path& parent, Path& out_child) {
    if (parent.ref_idx >= parent.src->ref_max_idx) return 0;

    Path child = transition_to_child_node(parent, 1, 0);

    if (parent.src->ref[child.ref_idx] == '<') {
        end_insertion_segment(child, parent.hyp_idx, parent.ref_idx);
    }

    bool is_backtrace = in_backtrace(parent.src, parent.hyp_idx, parent.ref_idx);
    bool is_delim = (parent.src->ref_char_types[child.ref_idx] == 0);
    child.open_cost += is_delim ? 1.0 : 2.0;
    child.open_cost += (is_backtrace || is_delim) ? 0.0 : 1.0;

    if (child.src->ref[child.ref_idx] == '>') {
        if (!end_segment(child)) return 0;
    }

    out_child = std::move(child);
    return 1;
}

static int add_delete(const Path& parent, Path& out_child) {
    if (parent.hyp_idx >= parent.src->hyp_max_idx) return 0;

    Path child = transition_to_child_node(parent, 0, 1);

    bool is_backtrace = in_backtrace(parent.src, parent.hyp_idx, parent.ref_idx);
    bool is_delim = (parent.src->hyp_char_types[child.hyp_idx] == 0);
    child.open_cost += is_delim ? 1.0 : 2.0;
    child.open_cost += (is_backtrace || is_delim) ? 0.0 : 1.0;

    if (child.src->hyp[child.hyp_idx] == '>') {
        end_insertion_segment(child, child.hyp_idx, child.ref_idx);
    }

    out_child = std::move(child);
    return 1;
}

static std::vector<Path> expand_paths(const Path& p) {
    std::vector<Path> out;
    out.reserve(3);
    Path child;

    if (add_delete(p, child)) out.push_back(child);
    if (add_insert(p, child)) out.push_back(child);
    if (add_substitution_or_match(p, child)) out.push_back(child);

    return out;
}

// ---------- Main beam search function ----------
static std::vector<std::tuple<int,int,double>>
error_align_beam_search_impl(SrcView& src, int beam_size) {
    Path start; start.src = &src;
    std::vector<Path> beam;
    beam.reserve(128);
    beam.push_back(start);

    std::unordered_map<std::size_t, double> prune_map;
    prune_map.reserve(4096);
    std::vector<Path> ended;
    ended.reserve(128);

    while (!beam.empty()) {
        std::unordered_map<std::size_t, Path> new_beam;
        new_beam.reserve(beam.size()*3 + 8);

        for (const Path& path : beam) {
            if (path.at_end()) {
                ended.push_back(path);
                continue;
            }
            for (auto& new_path : expand_paths(path)) {
                double c = new_path.cost();
                std::size_t id = new_path.prune_id();

                auto itp = prune_map.find(id);
                if (itp != prune_map.end() && c > itp->second) {
                    continue;
                }
                prune_map[id] = c;

                auto it = new_beam.find(id);
                if (it == new_beam.end() || c < it->second.cost()) {
                    new_beam[id] = new_path;
                }
            }
        }

        beam.clear();
        beam.reserve(new_beam.size());
        for (auto& kv : new_beam) {
            beam.push_back(kv.second);
        }
        std::sort(beam.begin(), beam.end(),
            [](const Path& a, const Path& b) {
                double an = a.norm_cost();
                double bn = b.norm_cost();
                if (an < bn) return true;
                if (bn < an) return false;
                return a.sort_id < b.sort_id;
            }
        );

        if ((int)beam.size() > beam_size) beam.resize(beam_size);

        if (!beam.empty() && beam[0].at_unambiguous_match_node) {
            beam.resize(1);
            prune_map.clear();
        }
    }

    if (ended.empty()) {
        return {};
    }
    std::sort(ended.begin(), ended.end(),
        [](const Path& a, const Path& b) {
            double ac = a.cost();
            double bc = b.cost();
            if (ac < bc) return true;
            if (bc < ac) return false;
            return a.sort_id < b.sort_id;
        }
    );
    return ended.front().end_indices;
}

// ---------- NAPI entrypoint ----------
static Napi::Value ErrorAlignBeamSearch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object src_obj = info[0].As<Napi::Object>();
    int beam_size = info.Length() > 1 ? info[1].As<Napi::Number>().Int32Value() : 100;

    SrcView src = make_src_view(env, src_obj);
    auto end_indices = error_align_beam_search_impl(src, beam_size);

    // Return end_indices as array of [hyp_idx, ref_idx, open_cost] tuples
    Napi::Array result = Napi::Array::New(env, end_indices.size());
    for (size_t i = 0; i < end_indices.size(); i++) {
        Napi::Array triple = Napi::Array::New(env, 3);
        triple.Set((uint32_t)0, Napi::Number::New(env, std::get<0>(end_indices[i])));
        triple.Set((uint32_t)1, Napi::Number::New(env, std::get<1>(end_indices[i])));
        triple.Set((uint32_t)2, Napi::Number::New(env, std::get<2>(end_indices[i])));
        result.Set((uint32_t)i, triple);
    }
    return result;
}

// ---------- Module init (called from module.cpp) ----------
void InitBeamSearch(Napi::Env env, Napi::Object exports) {
    exports.Set("errorAlignBeamSearch",
                Napi::Function::New(env, ErrorAlignBeamSearch));
}
