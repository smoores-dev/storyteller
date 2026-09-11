from numpy.core.multiarray import ndarray
from platform import architecture
import safetensors
import safetensors.numpy
from mimetypes import init
import os
import onnx
import pathlib
import numpy as np
import onnx_safetensors
import argparse

from huggingface_hub import snapshot_download


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--model-repo", type=str, required=True)
    parser.add_argument(
        "--onnx-file-path", type=str, required=False, default="onnx/model.onnx"
    )
    parser.add_argument("--out", type=str, required=True)
    args = parser.parse_args()

    model_repo = args.model_repo
    onnx_file_path = args.onnx_file_path
    output_file_path = args.out

    MODEL_DIR = pathlib.Path(snapshot_download(model_repo))

    # Provide your ONNX model here
    model = onnx.load(os.path.join(MODEL_DIR, onnx_file_path))

    tensor_file = os.path.join(MODEL_DIR, "model.safetensors")
    base_dir = MODEL_DIR
    data_path = os.path.join(MODEL_DIR, "model.safetensors")

    # Apply weights from the safetensors file to the model and turn them to in memory tensor
    # NOTE: If model size becomes >2GB you will need to offload weights with onnx_safetensors.save_file, or onnx.save with external data options to keep the onnx model valid
    # model = onnx_safetensors.load_file(model, tensor_file)

    # If you want to use the safetensors file in ONNX Runtime:
    # Use safetensors as external data in the ONNX model
    # model_with_external_data = onnx_safetensors.load_file_as_external_data(model, data_path, base_dir=base_dir)

    # Save the modified model
    # This model is a valid ONNX model using external data from the safetensors file
    # onnx_safetensors.save_file(model, tensor_file, base_dir=base_dir, replace_data=False)

    g = model.graph

    inits = {t.name: onnx.numpy_helper.to_array(t) for t in g.initializer}

    counters: dict[tuple[int, str], int] = {}
    out: dict[str, ndarray] = {}


    config = {
        "architecture": "quartznet15x5",
        "sampleRate": 16000,
        "melBins": 64,
        "samplesPerFrame": 320,
        "blank": 28,
        "blocks": {}
    }

    for node in g.node:
        if node.op_type != "Conv": continue

        attrs = { a.name: onnx.helper.get_attribute_value(a) for a in node.attribute }
        parts = node.name.split("/")
        block = parts[2]
        print("attrs", attrs)
        print("block", block)
        if block.startswith("encoder."):
            n = int(block.split(".")[1])
            if parts[3].startswith("res"):
                key = f"encoder.{n}.res"
            else:
                # dw = depth wise convolution. "context window"
                # pw = point wise convolution. basic matrix multip
                kind = "dw" if attrs["group"] > 1 else "pw"
                i = counters.get((n,kind), 0)
                counters[(n,kind)] = i + 1
                key = f"encoder.{n}.{kind}.{i}"

                kernel = attrs["kernel_shape"][0]
                stride = attrs["strides"][0]
                dilation = attrs["dilations"][0]

                if kind == "dw":
                    config["blocks"][n] = {"kernel": kernel, "stride": stride, "dilation": dilation, "residual": False}
                else:
                    config["blocks"][n] = {"kernel": kernel, "stride": stride, "dilation": dilation, "residual": False}

        else:
            key = "decoder"

        # onnx weights are output/intput/kernelposition
        # mlx weights are output/kernel/input
        # transpose(0,2,1) means 0->0, 1->2, 2->1
        # empty transpose is transpose(0,1,2)?
        out[f"{key}.weight"] =  inits[node.input[1]].transpose(0,2,1)

        if len(node.input) > 2:
            out[f"{key}.bias"] = inits[node.input[2]]

    print(config)
    safetensors.numpy.save_file(out, filename='../_models/aa.safetensors')




if __name__ == "__main__":
    main()
