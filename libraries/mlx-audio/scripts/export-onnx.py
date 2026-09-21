import argparse
import json
import pathlib

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import load_file

from convert import CHUNK_SECONDS, HOP, NFFT, decode_audio, features, forward

OPSET = 17
SIGNAL_INPUT = "signal"
FEATURES = "audio_signal"
LENGTH = "length"


def initializer(tensors, name, array):
    tensors.append(numpy_helper.from_array(np.ascontiguousarray(array, dtype=np.float32), name))
    return name


def conv(nodes, tensors, name, x, weight, bias, stride, dilation):
    channels, inputs_per_group, taps = weight.shape
    groups = channels if inputs_per_group == 1 and taps > 1 else 1
    inputs = [x, initializer(tensors, f"{name}.weight", weight)]
    if bias is not None:
        inputs.append(initializer(tensors, f"{name}.bias", bias))
    pad = dilation * (taps - 1) // 2
    nodes.append(
        helper.make_node(
            "Conv",
            inputs,
            [f"{name}.out"],
            name=name,
            dilations=[dilation],
            group=groups,
            kernel_shape=[taps],
            pads=[pad, pad],
            strides=[stride],
        )
    )
    return f"{name}.out"


def relu(nodes, name, x):
    nodes.append(helper.make_node("Relu", [x], [f"{name}.out"], name=name))
    return f"{name}.out"


def prepared_signal(samples):
    """The part of the front end that stays outside the graph: pre-emphasis and
    reflect padding, one linear pass over the samples."""
    x = np.concatenate([samples[:1], samples[1:] - 0.97 * samples[:-1]])
    return np.pad(x, NFFT // 2, mode="reflect").astype(np.float32)


def frontend(mel, win, with_length):
    """Mel front end as graph nodes, from a prepared signal [batch, 1, samples]
    to normalised log mel features [batch, mels, frames]. The short-time Fourier
    transform is a convolution whose 2 * bins output channels hold the windowed
    cosine and sine bases, so it runs on every execution provider."""
    bins = NFFT // 2 + 1
    n = np.arange(NFFT)
    k = np.arange(bins)
    angles = 2 * np.pi * np.outer(k, n) / NFFT
    basis = np.concatenate([np.cos(angles), -np.sin(angles)]) * win[None, :]
    p = "frontend"
    tensors = [
        numpy_helper.from_array(basis.astype(np.float32)[:, None, :], f"{p}.stft.weight"),
        numpy_helper.from_array(np.ascontiguousarray(mel.T, dtype=np.float32), f"{p}.mel"),
        numpy_helper.from_array(np.array(2.0**-24, dtype=np.float32), f"{p}.log_guard"),
        numpy_helper.from_array(np.array(1e-5, dtype=np.float32), f"{p}.std_guard"),
        numpy_helper.from_array(np.array(1.0, dtype=np.float32), f"{p}.one"),
        numpy_helper.from_array(np.array([2], dtype=np.int64), f"{p}.time_axis"),
    ]
    nodes = [
        helper.make_node("Conv", [SIGNAL_INPUT, f"{p}.stft.weight"], [f"{p}.stft"], name=f"{p}.stft", kernel_shape=[NFFT], strides=[HOP]),
        helper.make_node("Split", [f"{p}.stft"], [f"{p}.re", f"{p}.im"], name=f"{p}.split", axis=1),
        helper.make_node("Mul", [f"{p}.re", f"{p}.re"], [f"{p}.re2"], name=f"{p}.re2"),
        helper.make_node("Mul", [f"{p}.im", f"{p}.im"], [f"{p}.im2"], name=f"{p}.im2"),
        helper.make_node("Add", [f"{p}.re2", f"{p}.im2"], [f"{p}.power"], name=f"{p}.power"),
        helper.make_node("MatMul", [f"{p}.mel", f"{p}.power"], [f"{p}.melpower"], name=f"{p}.melpower"),
        helper.make_node("Add", [f"{p}.melpower", f"{p}.log_guard"], [f"{p}.guarded"], name=f"{p}.guard"),
        helper.make_node("Log", [f"{p}.guarded"], [f"{p}.logmel"], name=f"{p}.log"),
        helper.make_node("ReduceMean", [f"{p}.logmel"], [f"{p}.mean"], name=f"{p}.mean", axes=[2], keepdims=1),
        helper.make_node("Sub", [f"{p}.logmel", f"{p}.mean"], [f"{p}.centered"], name=f"{p}.center"),
        helper.make_node("Mul", [f"{p}.centered", f"{p}.centered"], [f"{p}.squares"], name=f"{p}.squares"),
        helper.make_node("ReduceSum", [f"{p}.squares", f"{p}.time_axis"], [f"{p}.sumsq"], name=f"{p}.sumsq", keepdims=1),
        helper.make_node("Shape", [f"{p}.logmel"], [f"{p}.shape"], name=f"{p}.shape"),
        helper.make_node("Gather", [f"{p}.shape", f"{p}.time_axis"], [f"{p}.frames"], name=f"{p}.frames", axis=0),
        helper.make_node("Cast", [f"{p}.frames"], [f"{p}.frames_f"], name=f"{p}.frames_cast", to=TensorProto.FLOAT),
        helper.make_node("Sub", [f"{p}.frames_f", f"{p}.one"], [f"{p}.ddof"], name=f"{p}.ddof"),
        helper.make_node("Div", [f"{p}.sumsq", f"{p}.ddof"], [f"{p}.variance"], name=f"{p}.variance"),
        helper.make_node("Sqrt", [f"{p}.variance"], [f"{p}.std"], name=f"{p}.std"),
        helper.make_node("Add", [f"{p}.std", f"{p}.std_guard"], [f"{p}.scale"], name=f"{p}.scale"),
        helper.make_node("Div", [f"{p}.centered", f"{p}.scale"], [FEATURES], name=f"{p}.normalize"),
    ]
    if with_length:
        tensors.append(numpy_helper.from_array(np.array([0], dtype=np.int64), f"{p}.batch_axis"))
        nodes += [
            helper.make_node("Gather", [f"{p}.shape", f"{p}.batch_axis"], [f"{p}.batch"], name=f"{p}.batch", axis=0),
            helper.make_node("Expand", [f"{p}.frames", f"{p}.batch"], [LENGTH], name=f"{p}.length"),
        ]
    return nodes, tensors


def signal_input():
    return helper.make_tensor_value_info(SIGNAL_INPUT, TensorProto.FLOAT, ["batch", 1, "samples"])


def build(weights, blocks, classes):
    nodes, tensors = frontend(weights["frontend.mel_filters"], weights["frontend.window"], with_length=False)
    x = FEATURES
    for n, block in enumerate(blocks):
        entry = x
        for repeat in range(block["repeat"]):
            stride = block["stride"] if repeat == 0 else 1
            depthwise = weights.get(f"encoder.{n}.dw.{repeat}.weight")
            pointwise = weights[f"encoder.{n}.pw.{repeat}.weight"]
            bias = weights[f"encoder.{n}.pw.{repeat}.bias"]
            if depthwise is not None:
                x = conv(nodes, tensors, f"encoder.{n}.dw.{repeat}", x, depthwise.transpose(0, 2, 1), None, stride, block["dilation"])
                x = conv(nodes, tensors, f"encoder.{n}.pw.{repeat}", x, pointwise.transpose(0, 2, 1), bias, 1, 1)
            else:
                x = conv(nodes, tensors, f"encoder.{n}.pw.{repeat}", x, pointwise.transpose(0, 2, 1), bias, stride, block["dilation"])
            if repeat < block["repeat"] - 1:
                x = relu(nodes, f"encoder.{n}.relu.{repeat}", x)
        if block["residual"]:
            skip = conv(nodes, tensors, f"encoder.{n}.res", entry, weights[f"encoder.{n}.res.weight"].transpose(0, 2, 1), weights[f"encoder.{n}.res.bias"], 1, 1)
            nodes.append(helper.make_node("Add", [x, skip], [f"encoder.{n}.add.out"], name=f"encoder.{n}.add"))
            x = f"encoder.{n}.add.out"
        x = relu(nodes, f"encoder.{n}.relu", x)
    x = conv(nodes, tensors, "decoder", x, weights["decoder.weight"].transpose(0, 2, 1), weights["decoder.bias"], 1, 1)
    nodes.append(helper.make_node("Transpose", [x], ["transposed"], name="transpose", perm=[0, 2, 1]))
    nodes.append(helper.make_node("LogSoftmax", ["transposed"], ["logprobs"], name="logsoftmax", axis=-1))

    graph = helper.make_graph(
        nodes,
        "quartznet15x5",
        [signal_input()],
        [helper.make_tensor_value_info("logprobs", TensorProto.FLOAT, ["batch", "frames", classes])],
        tensors,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", OPSET)], producer_name="storyteller-export-onnx")
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


def splice(model, mel, win):
    """Puts the front end in front of an encoder graph that takes features and,
    for Citrinet, a length. Already spliced graphs come back unchanged."""
    graph = model.graph
    inputs = [i.name for i in graph.input]
    if SIGNAL_INPUT in inputs:
        return model, False
    if FEATURES not in inputs:
        raise SystemExit(f"cannot splice a front end onto inputs {inputs}")
    nodes, tensors = frontend(mel, win, with_length=LENGTH in inputs)
    existing = list(graph.node)
    del graph.node[:]
    graph.node.extend(nodes + existing)
    graph.initializer.extend(tensors)
    del graph.input[:]
    graph.input.append(signal_input())
    return model, True


def to_fp16(model):
    """Casts the encoder to half precision. The front end stays float32 since
    the log of a power spectrum spans far more than half precision holds."""
    model = onnx.ModelProto.FromString(model.SerializeToString())
    graph = model.graph
    for tensor in graph.initializer:
        if tensor.data_type == TensorProto.FLOAT and not tensor.name.startswith("frontend."):
            tensor.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(tensor).astype(np.float16), tensor.name))
    normalize = next(n for n in graph.node if n.name == "frontend.normalize")
    normalize.output[0] = "frontend.features"
    cast_in = helper.make_node("Cast", ["frontend.features"], [FEATURES], name="frontend.cast", to=TensorProto.FLOAT16)
    logsoftmax = next(n for n in graph.node if n.op_type == "LogSoftmax")
    before = logsoftmax.input[0]
    logsoftmax.input[0] = f"{before}.f32"
    cast_out = helper.make_node("Cast", [before], [f"{before}.f32"], name="decoder.cast", to=TensorProto.FLOAT)
    nodes = list(graph.node)
    nodes.insert(nodes.index(normalize) + 1, cast_in)
    nodes.remove(logsoftmax)
    nodes += [cast_out, logsoftmax]
    del graph.node[:]
    graph.node.extend(nodes)
    onnx.checker.check_model(model)
    return model


def check(path, samples, expected, label):
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    actual = session.run(["logprobs"], {SIGNAL_INPUT: prepared_signal(samples)[None, None]})[0][0]
    if actual.shape != expected.shape:
        raise SystemExit(f"{label}: shape mismatch, onnx {actual.shape}, numpy {expected.shape}")
    agreement = float((actual.argmax(axis=1) == expected.argmax(axis=1)).mean())
    difference = float(np.abs(actual - expected).max())
    print(f"{label} vs numpy forward: {expected.shape} logprobs, max abs diff {difference:.6f}, argmax agreement {agreement:.4f}")
    return difference, agreement


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model_dir")
    parser.add_argument("--reference-audio")
    parser.add_argument("--no-fp16", action="store_true")
    args = parser.parse_args()

    model_dir = pathlib.Path(args.model_dir)
    config = json.loads((model_dir / "config.json").read_text())
    weights = load_file(str(model_dir / "model.safetensors"))
    out = model_dir / "model.onnx"
    out16 = model_dir / "model_fp16.onnx"

    if config["architecture"] == "quartznet15x5":
        model = build(weights, config["blocks"], config["classes"])
        onnx.save(model, str(out))
        print(f"wrote {out}, {out.stat().st_size} bytes, {len(model.graph.node)} nodes")
        if not args.no_fp16:
            half = to_fp16(model)
            onnx.save(half, str(out16))
            print(f"wrote {out16}, {out16.stat().st_size} bytes")
    else:
        model, changed = splice(onnx.load(str(out)), weights["frontend.mel_filters"], weights["frontend.window"])
        if changed:
            onnx.checker.check_model(model)
            onnx.save(model, str(out))
            print(f"spliced the front end into {out}, {out.stat().st_size} bytes, {len(model.graph.node)} nodes")
        else:
            print(f"{out} already has the front end")
        print(f"{config['architecture']} is exported once in float32, the half precision cast only covers quartznet graphs")

    if args.reference_audio and config["architecture"] == "quartznet15x5":
        samples = decode_audio(args.reference_audio, CHUNK_SECONDS)
        feats = features(samples, weights["frontend.mel_filters"], weights["frontend.window"])
        expected = forward({k: v for k, v in weights.items() if not k.startswith("frontend.")}, config["blocks"], feats)
        difference, agreement = check(out, samples, expected, "float32")
        if difference > 2e-2 or agreement < 1.0:
            raise SystemExit("the exported graph does not match the numpy forward")
        if not args.no_fp16:
            _, agreement16 = check(out16, samples, expected, "float16")
            if agreement16 < 0.99:
                raise SystemExit("the half precision graph disagrees with the numpy forward")


if __name__ == "__main__":
    main()
