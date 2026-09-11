import argparse
import json
import pathlib

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import load_file

from convert import CHUNK_SECONDS, decode_audio, features, forward

OPSET = 17


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


def build(weights, blocks, mel_bins, classes):
    nodes = []
    tensors = []
    x = "audio_signal"
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
        [helper.make_tensor_value_info("audio_signal", TensorProto.FLOAT, ["batch", mel_bins, "time"])],
        [helper.make_tensor_value_info("logprobs", TensorProto.FLOAT, ["batch", "frames", classes])],
        tensors,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", OPSET)], producer_name="storyteller-export-onnx")
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model_dir")
    parser.add_argument("--reference-audio")
    args = parser.parse_args()

    model_dir = pathlib.Path(args.model_dir)
    config = json.loads((model_dir / "config.json").read_text())
    if config["architecture"] != "quartznet15x5":
        raise SystemExit(f"{model_dir}: only quartznet15x5 is exported, {config['architecture']} models come from an onnx export already")

    weights = load_file(str(model_dir / "model.safetensors"))
    model = build(weights, config["blocks"], config["melBins"], config["classes"])
    out = model_dir / "model.onnx"
    onnx.save(model, str(out))
    print(f"wrote {out}, {out.stat().st_size} bytes, {len(model.graph.node)} nodes")

    if args.reference_audio:
        samples = decode_audio(args.reference_audio, CHUNK_SECONDS)
        feats = features(samples, weights["frontend.mel_filters"], weights["frontend.window"])
        expected = forward(weights, config["blocks"], feats)
        session = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
        actual = session.run(["logprobs"], {"audio_signal": feats.T[None]})[0][0]
        if actual.shape != expected.shape:
            raise SystemExit(f"shape mismatch: onnx {actual.shape}, numpy {expected.shape}")
        agreement = float((actual.argmax(axis=1) == expected.argmax(axis=1)).mean())
        difference = float(np.abs(actual - expected).max())
        print(f"onnx vs numpy forward: {expected.shape} logprobs, max abs diff {difference:.6f}, argmax agreement {agreement:.4f}")
        if difference > 1e-3 or agreement < 1.0:
            raise SystemExit("the exported graph does not match the numpy forward")


if __name__ == "__main__":
    main()
