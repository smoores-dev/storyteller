#!/usr/bin/env bash

MODEL_NAME=$1

models="tiny
tiny.en
tiny-q5_1
tiny.en-q5_1
tiny-q8_0
base
base.en
base-q5_1
base.en-q5_1
base-q8_0
small
small.en
small.en-tdrz
small-q5_1
small.en-q5_1
small-q8_0
medium
medium.en
medium-q5_0
medium.en-q5_0
medium-q8_0
large-v1
large-v2
large-v2-q5_0
large-v2-q8_0
large-v3
large-v3-q5_0
large-v3-turbo
large-v3-turbo-q5_0
large-v3-turbo-q8_0"

# if model name is not in the list, or is not "all", exit
if ! echo "$models" | grep -q -w "$MODEL_NAME" && [ "$MODEL_NAME" != "all" ]; then
    echo "Invalid model name: $MODEL_NAME"
    echo "Usage: $0 <model_name>"
    echo "Available models: $models"
    echo "Use 'all' to convert all models"
    exit 1
fi


# make sure we are in the correct directory
# base this on the directory of the script
cd "$(dirname "${BASH_SOURCE[0]}")"

# run uv install
uv sync

# clean up any existing whisper.cpp directory
rm -rf whisper.cpp

# clone the whisper.cpp repository
git clone https://github.com/ggerganov/whisper.cpp.git


cd whisper.cpp

# checkout the latest version
git checkout v1.8.2


if [ "$MODEL_NAME" != "all" ]; then
    models="$MODEL_NAME"
fi

for model in $models; do
        echo "Converting model: $model"
        ./models/download-ggml-model.sh $model
        uv run models/convert-whisper-to-coreml.py --model "$model" --encoder-only True --optimize-ane True
        xcrun coremlc compile models/coreml-encoder-$model.mlpackage models/
        rm -rf models/ggml-$model-encoder.mlmodelc
        mv -v models/coreml-encoder-$model.mlmodelc models/ggml-$model-encoder.mlmodelc
        tar -czvf whisper-${model}-coreml-encoder.tar.gz models/ggml-$model-encoder.mlmodelc
done


# upload it to the gitlab model registry
# gitlab-cli model upload --model-name "whisper-${MODEL_NAME}-encoder" --model-path "models/ggml-${MODEL_NAME}-encoder.mlmodelc"
echo "TODO: upload it to the gitlab model registry"


