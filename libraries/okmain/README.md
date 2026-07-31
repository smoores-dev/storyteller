# `@storyteller-platform/okmain`

`napi-rs` port of [okmain](https://github.com/si14/okmain) by
[Dan Groshev](https://github.com/si14).

Provides a `colors` function that extracts the dominant colors from an image.

## Usage

```ts
import { colors } from "@storyteller-platform/okmain"

const image = await readFile("image.jpg")
const colors = await colors(image)
console.log(colors) // [ { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 } ]
```

You can also get more detailed information about the colors by using the
`colorsDetailed` function.

```ts
import { colorsDetailed } from "@storyteller-platform/okmain"

const image = await readFile("image.jpg")
const colors = await colorsDetailed(image)
console.log(colors)
```

> [!NOTE] The `fraction` is not the actual percentage of the color in the image,
> as there are likely many many more colors in the image than the number of
> colors returned, even though they add up to 1.

<!-- prettier-ignore -->
```ts
[
  {
    r: 149,
    g: 127,
    b: 88,
    fraction: 0.22490103542804718,
    chroma: 0.18930703401565552,
    score: 0.19998523592948914,
  },
  {
    r: 81,
    g: 63,
    b: 44,
    fraction: 0.23482361435890198,
    chroma: 0.12230689078569412,
    score: 0.15606191754341125,
  },
  {
    r: 13,
    g: 13,
    b: 18,
    fraction: 0.35603994131088257,
    chroma: 0.032296959310770035,
    score: 0.12941986322402954,
  },
  {
    r: 206,
    g: 204,
    b: 183,
    fraction: 0.18423539400100708,
    chroma: 0.09051288664340973,
    score: 0.11862964183092117,
  },
]
```

## Development

```bash
git submodule update --init --recursive

# build the native addon
yarn build

# run the tests
yarn test
```
