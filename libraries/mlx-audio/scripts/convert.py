import argparse
import collections
import io
import json
import pathlib
import pickle
import shutil
import subprocess
import tarfile
import zipfile

import librosa
import numpy as np
import onnx
import onnxruntime as ort
import yaml
from huggingface_hub import hf_hub_download, snapshot_download
from safetensors.numpy import save_file

SR, HOP, NFFT = 16000, 160, 512
CHUNK_SECONDS = 25
BN_EPS = 1e-3

FRONTENDS = {"quartznet15x5": {"window": 320, "mels": 64}, "citrinet": {"window": 400, "mels": 80}}

CITRINET_TOKENIZER_REPO = "neongeckocom/stt_en_citrinet_512_gamma_0_25"
CITRINET_TOKENIZER_FILE = "onnx/tokenizer.spm"
CITRINET_FRAME_OFFSET_SECONDS = 0.32


def mel_filters(mels):
    return np.ascontiguousarray(librosa.filters.mel(sr=SR, n_fft=NFFT, n_mels=mels, fmin=0, fmax=SR / 2, htk=False, norm="slaney").T, dtype=np.float32)


def window(samples):
    return np.concatenate([np.hanning(samples + 1)[:-1], np.zeros(NFFT - samples)]).astype(np.float32)


def features(x, mel, win):
    x = np.concatenate([x[:1], x[1:] - 0.97 * x[:-1]])
    x = np.pad(x, NFFT // 2, mode="reflect")
    n_frames = 1 + (len(x) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = x[idx] * win
    spec = np.abs(np.fft.rfft(frames, n=NFFT, axis=1)) ** 2
    logmel = np.log(spec @ mel + 2**-24)
    mean = logmel.mean(axis=0, keepdims=True)
    std = logmel.std(axis=0, ddof=1, keepdims=True) + 1e-5
    return ((logmel - mean) / std).astype(np.float32)


def convert(graph):
    inits = {t.name: onnx.numpy_helper.to_array(t) for t in graph.initializer}
    used = set()
    counters = {}
    blocks = {}
    weights = {}
    for node in graph.node:
        if node.op_type != "Conv":
            continue
        attrs = {a.name: onnx.helper.get_attribute_value(a) for a in node.attribute}
        parts = node.name.split("/")
        weight = inits[node.input[1]]
        used.add(node.input[1])
        if parts[2].startswith("encoder."):
            n = int(parts[2].split(".")[1])
            block = blocks.setdefault(n, {"kernel": 1, "stride": 1, "dilation": 1, "repeat": 0, "residual": False})
            if parts[3].startswith("res"):
                key = f"encoder.{n}.res"
                block["residual"] = True
            elif attrs["group"] > 1:
                i = counters.get((n, "dw"), 0)
                counters[(n, "dw")] = i + 1
                key = f"encoder.{n}.dw.{i}"
                if i == 0:
                    block["in"] = int(weight.shape[0])
                block["kernel"] = int(attrs["kernel_shape"][0])
                block["stride"] = int(attrs["strides"][0])
                block["dilation"] = int(attrs["dilations"][0])
                block["repeat"] += 1
            else:
                i = counters.get((n, "pw"), 0)
                counters[(n, "pw")] = i + 1
                key = f"encoder.{n}.pw.{i}"
                block["out"] = int(weight.shape[0])
                block.setdefault("in", int(weight.shape[1]))
                if (n, "dw") not in counters:
                    block["repeat"] = 1
        else:
            key = "decoder"
        weights[f"{key}.weight"] = np.ascontiguousarray(weight.transpose(0, 2, 1))
        if len(node.input) > 2:
            weights[f"{key}.bias"] = inits[node.input[2]]
            used.add(node.input[2])
    unused = set(inits) - used
    if unused:
        raise SystemExit(f"initializers not mapped: {sorted(unused)[:5]}")
    ordered = [blocks[n] for n in sorted(blocks)]
    if any("in" not in b or "out" not in b for b in ordered):
        raise SystemExit("block with unknown channels")
    return weights, ordered


def convert_citrinet(graph):
    inits = {t.name: onnx.numpy_helper.to_array(t) for t in graph.initializer}
    used = set()
    counters = {}
    blocks = {}
    weights = {}
    for node in graph.node:
        if node.op_type not in ("Conv", "MatMul"):
            continue
        parts = node.name.split("/")
        weight = inits[node.input[1]]
        used.add(node.input[1])
        if node.op_type == "MatMul":
            n = int(parts[2].split(".")[1])
            layer = 0 if parts[5] == "fc.0" else 1
            weights[f"encoder.{n}.se.{layer}.weight"] = np.ascontiguousarray(weight.T)
            blocks[n]["se"] = int(min(weight.shape))
            continue
        attrs = {a.name: onnx.helper.get_attribute_value(a) for a in node.attribute}
        if parts[2].startswith("encoder."):
            n = int(parts[2].split(".")[1])
            block = blocks.setdefault(n, {"kernel": 1, "stride": 1, "repeat": 0, "residual": False})
            if parts[3].startswith("res"):
                key = f"encoder.{n}.res"
                block["residual"] = True
            elif attrs["group"] > 1:
                i = counters.get((n, "dw"), 0)
                counters[(n, "dw")] = i + 1
                key = f"encoder.{n}.dw.{i}"
                if i == 0:
                    block["in"] = int(weight.shape[0])
                block["kernel"] = int(attrs["kernel_shape"][0])
                block["stride"] = max(block["stride"], int(attrs["strides"][0]))
                block["repeat"] += 1
                if int(attrs["dilations"][0]) != 1:
                    raise SystemExit(f"{node.name}: dilation is not supported")
            else:
                i = counters.get((n, "pw"), 0)
                counters[(n, "pw")] = i + 1
                key = f"encoder.{n}.pw.{i}"
                block["out"] = int(weight.shape[0])
        else:
            key = "decoder"
        weights[f"{key}.weight"] = np.ascontiguousarray(weight.transpose(0, 2, 1))
        if len(node.input) > 2:
            weights[f"{key}.bias"] = inits[node.input[2]]
            used.add(node.input[2])
    unused = [name for name in set(inits) - used if inits[name].dtype.kind == "f"]
    if unused:
        raise SystemExit(f"initializers not mapped: {sorted(unused)[:5]}")
    ignored = sorted(set(inits) - used)
    ordered = [blocks[n] for n in sorted(blocks)]
    if any("in" not in b or "out" not in b or "se" not in b for b in ordered):
        raise SystemExit("block with unknown channels or squeeze-excite width")
    for n, block in enumerate(ordered):
        if block["stride"] > 1 and n not in (1, 7, 14):
            print(f"note: stride {block['stride']} in block {n}")
    return weights, ordered, ignored


def is_citrinet(graph):
    return [i.name for i in graph.input] == ["audio_signal", "length"]


def fetch_tokenizer(vocab, out):
    import sentencepiece as spm

    path = hf_hub_download(CITRINET_TOKENIZER_REPO, CITRINET_TOKENIZER_FILE)
    processor = spm.SentencePieceProcessor(model_file=path)
    inverse = {index: token for token, index in vocab.items()}
    pieces = processor.get_piece_size()
    if pieces + 1 != len(vocab):
        raise SystemExit(f"tokenizer has {pieces} pieces, vocab has {len(vocab)} entries")
    mismatched = [i for i in range(pieces) if processor.id_to_piece(i) != inverse[i]]
    if mismatched:
        raise SystemExit(f"tokenizer pieces differ from vocab.txt at {mismatched[:5]}")
    shutil.copy(path, out / "tokenizer.spm")
    print(f"tokenizer: {pieces} pieces match vocab.txt, copied to {out / 'tokenizer.spm'}")


def read_vocab(path):
    vocab = {}
    for line in path.read_text().splitlines():
        token, index = line.rsplit(" ", 1)
        vocab[token] = int(index)
    return vocab


TORCH_STORAGE = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64, "LongStorage": np.int64, "IntStorage": np.int32, "ByteStorage": np.uint8, "BoolStorage": np.bool_}


def read_checkpoint(raw):
    archive = zipfile.ZipFile(io.BytesIO(raw))
    prefix = archive.namelist()[0].split("/")[0]

    def rebuild(storage, offset, size, stride, *rest):
        key, dtype = storage
        flat = np.frombuffer(archive.read(f"{prefix}/data/{key}"), dtype=dtype)
        return np.lib.stride_tricks.as_strided(flat[offset:], tuple(size), tuple(s * flat.itemsize for s in stride)).copy()

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if name in TORCH_STORAGE:
                return TORCH_STORAGE[name]
            if name.startswith("_rebuild_tensor"):
                return rebuild
            if name == "OrderedDict":
                return collections.OrderedDict
            return super().find_class(module, name)

        def persistent_load(self, pid):
            return (pid[2], np.dtype(pid[1]))

    return Unpickler(io.BytesIO(archive.read(f"{prefix}/data.pkl"))).load()


def fold_batch_norm(weight, state, prefix):
    scale = state[f"{prefix}.weight"] / np.sqrt(state[f"{prefix}.running_var"] + BN_EPS)
    bias = state[f"{prefix}.bias"] - state[f"{prefix}.running_mean"] * scale
    return weight * scale[:, None, None], bias.astype(np.float32)


def module_indices(state, prefix):
    return sorted({int(key[len(prefix) :].split(".")[0]) for key in state if key.startswith(prefix)})


def convert_nemo(state, jasper):
    weights = {}
    blocks = []
    for n, spec in enumerate(jasper):
        prefix = f"encoder.encoder.{n}.mconv."
        block = {
            "kernel": int(spec["kernel"][0]),
            "stride": int(spec["stride"][0]),
            "dilation": int(spec["dilation"][0]),
            "repeat": int(spec["repeat"]),
            "residual": bool(spec["residual"]),
        }
        depthwise, pointwise, pending = 0, 0, None
        for index in module_indices(state, prefix):
            conv = state.get(f"{prefix}{index}.conv.weight")
            if conv is not None:
                if conv.shape[1] == 1 and conv.shape[2] > 1:
                    weights[f"encoder.{n}.dw.{depthwise}.weight"] = conv
                    pending = f"encoder.{n}.dw.{depthwise}"
                    depthwise += 1
                    block.setdefault("in", int(conv.shape[0]))
                else:
                    weights[f"encoder.{n}.pw.{pointwise}.weight"] = conv
                    pending = f"encoder.{n}.pw.{pointwise}"
                    pointwise += 1
                    block["out"] = int(conv.shape[0])
                    block.setdefault("in", int(conv.shape[1]))
                continue
            if f"{prefix}{index}.running_var" in state and pending is not None:
                folded, bias = fold_batch_norm(weights[f"{pending}.weight"], state, f"{prefix}{index}")
                weights[f"{pending}.weight"] = folded
                weights[f"{pending}.bias"] = bias
                pending = None
        if block["residual"]:
            residual = state[f"encoder.encoder.{n}.res.0.0.conv.weight"]
            folded, bias = fold_batch_norm(residual, state, f"encoder.encoder.{n}.res.0.1")
            weights[f"encoder.{n}.res.weight"] = folded
            weights[f"encoder.{n}.res.bias"] = bias
        blocks.append(block)

    weights["decoder.weight"] = state["decoder.decoder_layers.0.weight"]
    weights["decoder.bias"] = state["decoder.decoder_layers.0.bias"]
    return {key: np.ascontiguousarray(value.transpose(0, 2, 1)) if value.ndim == 3 else value for key, value in weights.items()}, blocks


def load_nemo(path):
    with tarfile.open(path) as archive:
        config = yaml.safe_load(archive.extractfile("./model_config.yaml").read())
        state = read_checkpoint(archive.extractfile("./model_weights.ckpt").read())
    weights, blocks = convert_nemo(state, config["encoder"]["jasper"])
    labels = ["▁" if label == " " else label for label in config["decoder"]["vocabulary"]]
    vocab = {label: index for index, label in enumerate(labels)}
    vocab["<blk>"] = len(labels)
    if len(vocab) != int(weights["decoder.weight"].shape[0]):
        raise SystemExit("vocabulary does not match the decoder")
    return weights, blocks, vocab


def conv1d(x, weight, bias, stride, dilation, groups):
    taps = weight.shape[1]
    pad = dilation * (taps - 1) // 2
    padded = np.pad(x, ((pad, pad), (0, 0)))
    frames = 1 + (padded.shape[0] - dilation * (taps - 1) - 1) // stride
    index = stride * np.arange(frames)[:, None] + dilation * np.arange(taps)[None, :]
    patches = padded[index]
    if groups == 1:
        return np.tensordot(patches, weight, axes=([1, 2], [1, 2])) + bias
    return np.einsum("ftc,ct->fc", patches, weight[:, :, 0]) + bias


def forward(weights, blocks, features):
    x = features
    for n, block in enumerate(blocks):
        residual = x
        for repeat in range(block["repeat"]):
            stride = block["stride"] if repeat == 0 else 1
            if f"encoder.{n}.dw.{repeat}.weight" in weights:
                x = conv1d(x, weights[f"encoder.{n}.dw.{repeat}.weight"], 0.0, stride, block["dilation"], x.shape[1])
                x = conv1d(x, weights[f"encoder.{n}.pw.{repeat}.weight"], weights[f"encoder.{n}.pw.{repeat}.bias"], 1, 1, 1)
            else:
                x = conv1d(x, weights[f"encoder.{n}.pw.{repeat}.weight"], weights[f"encoder.{n}.pw.{repeat}.bias"], stride, block["dilation"], 1)
            if repeat < block["repeat"] - 1:
                x = np.maximum(x, 0)
        if block["residual"]:
            x = x + conv1d(residual, weights[f"encoder.{n}.res.weight"], weights[f"encoder.{n}.res.bias"], 1, 1, 1)
        x = np.maximum(x, 0)
    logits = conv1d(x, weights["decoder.weight"], weights["decoder.bias"], 1, 1, 1)
    shifted = logits - logits.max(axis=1, keepdims=True)
    return (shifted - np.log(np.exp(shifted).sum(axis=1, keepdims=True))).astype(np.float32)


def decode_audio(path, seconds):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", str(seconds), "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)[: SR * seconds]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-repo", default="OpenVoiceOS/stt_en_quartznet15x5_onnx")
    parser.add_argument("--onnx-file-path", default="model.onnx")
    parser.add_argument("--out", required=True)
    parser.add_argument("--reference-audio")
    parser.add_argument("--nemo")
    args = parser.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    architecture = "quartznet15x5"
    if args.nemo:
        model_dir = None
        weights, blocks, vocab = load_nemo(pathlib.Path(args.nemo))
        (out / "vocab.txt").write_text("".join(f"{token} {index}\n" for token, index in vocab.items()))
    else:
        model_dir = pathlib.Path(snapshot_download(args.model_repo))
        model = onnx.load(str(model_dir / args.onnx_file_path))
        if is_citrinet(model.graph):
            architecture = "citrinet"
            weights, blocks, ignored = convert_citrinet(model.graph)
            print(f"ignored non-weight initializers: {ignored}")
        else:
            weights, blocks = convert(model.graph)
        vocab = read_vocab(model_dir / "vocab.txt")
        shutil.copy(model_dir / "vocab.txt", out / "vocab.txt")

    frontend = FRONTENDS[architecture]
    mel = mel_filters(frontend["mels"])
    win = window(frontend["window"])
    weights["frontend.mel_filters"] = mel
    weights["frontend.window"] = win
    save_file(weights, str(out / "model.safetensors"))

    total_stride = 1
    for block in blocks:
        total_stride *= block["stride"]
    config = {
        "architecture": architecture,
        "sampleRate": SR,
        "melBins": frontend["mels"],
        "windowSamples": frontend["window"],
        "samplesPerFrame": HOP * total_stride,
        "blank": vocab["<blk>"],
        "classes": len(vocab),
        "blocks": blocks,
    }
    if architecture == "citrinet":
        config["tokenizer"] = "sentencepiece"
        config["frameOffsetSeconds"] = CITRINET_FRAME_OFFSET_SECONDS
        fetch_tokenizer(vocab, out)
    (out / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    print(f"wrote {len(weights)} tensors, {len(blocks)} blocks, blank {config['blank']}, samples per frame {config['samplesPerFrame']}")

    if args.reference_audio:
        samples = decode_audio(args.reference_audio, CHUNK_SECONDS)
        feats = features(samples, mel, win)
        if model_dir is None:
            logprobs = forward(weights, blocks, feats)
        else:
            session = ort.InferenceSession(str(model_dir / args.onnx_file_path), providers=["CPUExecutionProvider"])
            feed = {"audio_signal": feats.T[None]}
            if architecture == "citrinet":
                feed["length"] = np.array([feats.shape[0]], dtype=np.int64)
            logprobs = session.run(["logprobs"], feed)[0][0]
            if architecture == "citrinet":
                short = dict(feed, length=np.array([feats.shape[0] - 400], dtype=np.int64))
                other = session.run(["logprobs"], short)[0][0]
                print(f"length check: feeding {feats.shape[0]} frames; a length of {feats.shape[0] - 400} changes the output by max {np.abs(other - logprobs).max():.3f}")
        save_file({"samples": samples, "features": feats, "logprobs": logprobs.astype(np.float32)}, str(out / "reference.safetensors"))
        inverse = {v: k for k, v in vocab.items()}
        text, last = "", -1
        for a in logprobs.argmax(axis=1):
            if a != last and a != config["blank"]:
                text += " " if inverse[int(a)] == "▁" else inverse[int(a)]
            last = a
        print(f"reference {samples.shape[0]} samples, {feats.shape} features, {logprobs.shape} logprobs")
        print(text)


if __name__ == "__main__":
    main()
