# @storyteller-platform/mlx-audio

[node-swift] bindings for some of the models in
[mlx-audio-swift](https://github.com/Blaizzy/mlx-audio-swift)

This library is ESM only.

Current models supported are:

- `Wav2Vec2CTC`

Also includes two novel model implementations:

- [`Quartznet15x5`](https://catalog.ngc.nvidia.com/orgs/nvidia/-/models/quartznet15x5/-?_lr=1):
  [./Sources/StorytellerMLXAudioCore/Quartznet15x5.swift](./Sources/StorytellerMLXAudioCore/Quartznet15x5.swift)
- [`Citrinet`](https://catalog.ngc.nvidia.com/orgs/nvidia/nemo/models/stt_en_citrinet_1024/-):
  [./Sources/StorytellerMLXAudioCore/Citrinet.swift](./Sources/StorytellerMLXAudioCore/Citrinet.swift)

## Usage

Download the model from
[our Gitlab repository](https://gitlab.com/storyteller-platform/storyteller/-/ml/models/3008171/versions/3023067#/artifacts).

```ts
import { loadModel, compute } from "@storyteller-platform/mlx-audio"

const model = await loadModel("path/to/unpacked/model")

const normalizedAudio = await readFile("path/to/audio.pcm")
const audio = new Float32Array(
  normalizedAudio,
  normalizedAudio.byteOffset,
  normalizedAudio.length / 4,
)

const emissions = await compute(model, audio)

console.log(emissions)
```
