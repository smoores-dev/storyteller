# Okmain (Swift port)

LLM-generated port of the Rust crate `okmain` v0.2.0
(https://github.com/si14/okmain), the dominant-color extractor the server uses
for cover palettes (`libraries/okmain`). Not human reviewed; everything in this
folder was machine-translated from the Rust sources.

The port is bit-exact with the Rust crate: it reproduces the seeded xoshiro256++
RNG (including rand 0.10's f32 and integer-range sampling), the oklab crate's
conversions with its custom cbrt approximation, and the fast-srgb8 lookup
tables, so the same image bytes produce the same colors as the server. Verified
against reference vectors generated from the Rust crate in
`Tests/StorytellerTests/llm_generated/OkmainTests.swift`.
