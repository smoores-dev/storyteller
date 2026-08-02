use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

#[napi(js_name = "InputImage")]
pub struct NapiInputImage {
  width: u16,
  height: u16,
  buf: Vec<u8>,
}

#[napi]
impl NapiInputImage {
  #[napi(constructor)]
  pub fn new(buf: Buffer, width: u32, height: u32) -> napi::Result<Self> {
    let width = u16::try_from(width).map_err(|_| napi::Error::from_reason("width too large"))?;
    let height = u16::try_from(height).map_err(|_| napi::Error::from_reason("height too large"))?;

    okmain::InputImage::from_bytes(width, height, &buf)
      .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(Self {
      width,
      height,
      buf: buf.to_vec(),
    })
  }

  /// decode an encoded image (jpeg, png, gif, webp) into an InputImage
  #[napi(factory)]
  pub fn from_image(buf: Buffer) -> napi::Result<Self> {
    let img = image::load_from_memory(&buf)
      .map_err(|e| napi::Error::from_reason(format!("failed to decode image: {e}")))?
      .into_rgb8();

    let width = u16::try_from(img.width())
      .map_err(|_| napi::Error::from_reason("decoded image width too large"))?;
    let height = u16::try_from(img.height())
      .map_err(|_| napi::Error::from_reason("decoded image height too large"))?;

    let raw = img.into_raw();

    Ok(Self {
      width,
      height,
      buf: raw,
    })
  }
}

#[napi(object)]
pub struct JsColor {
  pub r: u32,
  pub g: u32,
  pub b: u32,
}

#[napi(object)]
pub struct JsConfig {
  pub mask_saturated_threshold: f64,
  pub mask_weight: f64,
  pub mask_weighted_counts_weight: f64,
  pub chroma_weight: f64,
}

fn to_js_colors(result: Vec<okmain::rgb::RGB8>) -> Vec<JsColor> {
  result
    .into_iter()
    .map(|c| JsColor {
      r: c.r as u32,
      g: c.g as u32,
      b: c.b as u32,
    })
    .collect()
}

fn make_input(img: &NapiInputImage) -> okmain::InputImage<'_> {
  okmain::InputImage::from_bytes(img.width, img.height, &img.buf)
    .expect("already validated in constructor")
}

#[napi(js_name = "colors")]
pub fn napi_colors(input: &NapiInputImage) -> Vec<JsColor> {
  to_js_colors(okmain::colors(make_input(input)))
}

fn to_config(config: JsConfig) -> okmain::Config {
  okmain::Config {
    mask_saturated_threshold: config.mask_saturated_threshold as f32,
    mask_weight: config.mask_weight as f32,
    mask_weighted_counts_weight: config.mask_weighted_counts_weight as f32,
    chroma_weight: config.chroma_weight as f32,
  }
}

#[napi(js_name = "colorsWithConfig")]
pub fn napi_colors_with_config(
  input: &NapiInputImage,
  config: JsConfig,
) -> napi::Result<Vec<JsColor>> {
  okmain::colors_with_config(make_input(input), to_config(config))
    .map(to_js_colors)
    .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi(object)]
pub struct JsScoredColor {
  pub r: u32,
  pub g: u32,
  pub b: u32,
  /// mask-weighted fraction of pixels assigned to this color, in [0, 1]
  pub fraction: f64,
  /// oklab chroma normalized to [0, 1]
  pub chroma: f64,
  /// the final ranking score combining coverage and chroma
  pub score: f64,
}

// colors with coverage fraction, chroma, and ranking score
#[napi(js_name = "colorsDetailed")]
pub fn napi_colors_detailed(
  input: &NapiInputImage,
  config: Option<JsConfig>,
) -> napi::Result<Vec<JsScoredColor>> {
  let config = config.map(to_config).unwrap_or_default();
  let (colors, debug) = okmain::colors_debug(make_input(input), config)
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

  Ok(
    colors
      .into_iter()
      .map(|c| {
        let centroid = debug.scored_centroids.iter().find(|sc| sc.rgb == c);
        JsScoredColor {
          r: c.r as u32,
          g: c.g as u32,
          b: c.b as u32,
          fraction: centroid.map_or(0.0, |sc| sc.mask_weighted_counts as f64),
          chroma: centroid.map_or(0.0, |sc| sc.chroma as f64),
          score: centroid.map_or(0.0, |sc| sc.final_score as f64),
        }
      })
      .collect(),
  )
}
