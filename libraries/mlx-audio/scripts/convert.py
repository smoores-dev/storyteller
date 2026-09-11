import argparse
import json
import pathlib
import shutil
import subprocess

import librosa
import numpy as np
import onnx
import onnxruntime as ort
from huggingface_hub import snapshot_download
from safetensors.numpy import save_file

SR, WIN, HOP, NFFT, NMEL = 16000, 320, 160, 512, 64
CHUNK_SECONDS = 25


def mel_filters():
    return np.ascontiguousarray(librosa.filters.mel(sr=SR, n_fft=NFFT, n_mels=NMEL, fmin=0, fmax=SR / 2, htk=False, norm="slaney").T, dtype=np.float32)


def window():
    return np.concatenate([np.hanning(WIN + 1)[:-1], np.zeros(NFFT - WIN)]).astype(np.float32)


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


def read_vocab(path):
    vocab = {}
    for line in path.read_text().splitlines():
        token, index = line.rsplit(" ", 1)
        vocab[token] = int(index)
    return vocab


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
    args = parser.parse_args()

    model_dir = pathlib.Path(snapshot_download(args.model_repo))
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = onnx.load(str(model_dir / args.onnx_file_path))
    weights, blocks = convert(model.graph)
    mel = mel_filters()
    win = window()
    weights["frontend.mel_filters"] = mel
    weights["frontend.window"] = win
    save_file(weights, str(out / "model.safetensors"))

    vocab = read_vocab(model_dir / "vocab.txt")
    shutil.copy(model_dir / "vocab.txt", out / "vocab.txt")
    config = {
        "architecture": "quartznet15x5",
        "sampleRate": SR,
        "melBins": NMEL,
        "samplesPerFrame": HOP * blocks[0]["stride"],
        "blank": vocab["<blk>"],
        "classes": len(vocab),
        "blocks": blocks,
    }
    (out / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    print(f"wrote {len(weights)} tensors, {len(blocks)} blocks, blank {config['blank']}")

    if args.reference_audio:
        samples = decode_audio(args.reference_audio, CHUNK_SECONDS)
        feats = features(samples, mel, win)
        session = ort.InferenceSession(str(model_dir / args.onnx_file_path), providers=["CPUExecutionProvider"])
        logprobs = session.run(["logprobs"], {"audio_signal": feats.T[None]})[0][0]
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
