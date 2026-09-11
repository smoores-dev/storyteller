import { execFile } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const PROJECT_ID = "67994333"
const PROJECT_PATH = "storyteller-platform/storyteller"
const API = `https://gitlab.com/api/v4/projects/${PROJECT_ID}`
const MLFLOW = `projects/${PROJECT_ID}/ml/mlflow/api/2.0/mlflow`
const UPLOAD_FILES = ["model.safetensors", "config.json", "vocab.txt", "model.onnx"]
const OPTIONAL_FILES = ["tokenizer.spm"]
const ARCHITECTURE_LABELS = { quartznet15x5: "QuartzNet15x5", citrinet: "Citrinet" }

function usage() {
  console.error(
    [
      "usage: node scripts/upload-ctc-model.mjs <model-dir>... [--name <package>] [--version <semver>] [--description <text>]",
      "",
      "Publishes converted CTC model directories to the gitlab ml model registry.",
      `${UPLOAD_FILES.join(", ")} are uploaded, plus ${OPTIONAL_FILES.join(", ")} when the directory has them.`,
      "Everything else in the directory is ignored. --name only applies to a single directory.",
      "",
      "Reads and creates the model through glab, which handles its own login.",
      "The file upload endpoint only accepts a personal access token or a ci job",
      "token, so put one with the api scope in GITLAB_TOKEN. glab picks that up too,",
      "which is fine as long as the token can read the project. Without GITLAB_TOKEN the",
      "registered model and version are still created and the file upload is skipped.",
    ].join("\n"),
  )
  process.exit(1)
}

function parseArguments(argv) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]
    if (argument.startsWith("--")) {
      const value = argv[++i]
      if (value === undefined) usage()
      options[argument.slice(2)] = value
    } else {
      positional.push(argument)
    }
  }
  if (positional.length === 0) usage()
  if (positional.length > 1 && options["name"] !== undefined) usage()
  return { modelDirs: positional, options }
}

function readToken() {
  const token =
    process.env["GITLAB_TOKEN"] ??
    process.env["GLAB_TOKEN"] ??
    process.env["STORYTELLER_GITLAB_TOKEN"]

  return token === undefined || token === "" ? null : token
}

async function glabJson(args) {
  const { stdout } = await execFileAsync("glab", args, {
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout.trim() === "" ? null : JSON.parse(stdout)
}

async function glabPostJson(path, body) {
  const child = execFile("glab", [
    "api",
    "--method",
    "POST",
    path,
    "--header",
    "Content-Type: application/json",
    "--input",
    "-",
  ])
  child.stdin.end(JSON.stringify(body))

  const chunks = []
  child.stdout.on("data", (chunk) => chunks.push(chunk))
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  })

  if (code !== 0) {
    throw new Error(`glab api ${path} exited with ${code}`)
  }

  return JSON.parse(chunks.map((chunk) => chunk.toString("utf8")).join(""))
}

async function getRegisteredModel(name) {
  try {
    return await glabJson([
      "api",
      `${MLFLOW}/registered-models/get?name=${encodeURIComponent(name)}`,
    ])
  } catch {
    return null
  }
}

async function ensureRegisteredModel(name, description) {
  if (await getRegisteredModel(name)) {
    console.log(`model ${name} is already registered`)
    return
  }

  await glabPostJson(`${MLFLOW}/registered-models/create`, { name, description })
  console.log(`registered model ${name}`)
}

async function ensureModelVersion(name, version) {
  const model = await getRegisteredModel(name)
  const existing = model?.registered_model?.latest_versions?.find((candidate) =>
    candidate.aliases?.includes(version),
  )

  if (existing) {
    console.log(`version ${version} already exists as model version ${existing.version}`)
    return Number(existing.version)
  }

  const created = await glabPostJson(`${MLFLOW}/model-versions/create`, {
    name,
    source: "",
    tags: [{ key: "gitlab.version", value: version }],
  })
  console.log(`created model version ${created.model_version.version}`)
  return Number(created.model_version.version)
}

async function findPackage(name, version) {
  const packages =
    (await glabJson([
      "api",
      `projects/${PROJECT_ID}/packages?package_type=ml_model&package_name=${encodeURIComponent(name)}&per_page=100`,
    ])) ?? []
  return packages.find((candidate) => candidate.version === version)
}

async function listPackageFiles(packageId) {
  const files =
    (await glabJson([
      "api",
      `projects/${PROJECT_ID}/packages/${packageId}/package_files?per_page=100`,
    ])) ?? []

  const sizes = new Map()
  for (const file of files) {
    sizes.set(decodeURIComponent(file.file_name), file.size)
  }
  return sizes
}

async function uploadFile(token, modelVersionId, modelDir, fileName) {
  const body = await readFile(join(modelDir, fileName))
  const response = await fetch(
    `${API}/packages/ml_models/${modelVersionId}/files/${encodeURIComponent(fileName)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body,
    },
  )

  if (!response.ok) {
    throw new Error(
      `upload of ${fileName} failed: ${response.status} ${response.statusText}`,
    )
  }

  console.log(`uploaded ${fileName}, ${body.byteLength} bytes`)
}

async function fileSizes(modelDir) {
  const sizes = new Map()
  for (const fileName of UPLOAD_FILES) {
    sizes.set(fileName, (await stat(join(modelDir, fileName))).size)
  }
  for (const fileName of OPTIONAL_FILES) {
    const size = await stat(join(modelDir, fileName)).catch(() => null)
    if (size) sizes.set(fileName, size.size)
  }
  return sizes
}

async function describe(modelDir, name) {
  const config = JSON.parse(await readFile(join(modelDir, "config.json"), "utf8"))
  const label = ARCHITECTURE_LABELS[config.architecture]
  if (!label) {
    throw new Error(`${modelDir}: unknown architecture ${config.architecture}`)
  }
  return `${label} CTC acoustic model, MLX safetensors and the source onnx graph (${name}).`
}

async function publish(modelDir, options, token) {
  const name = options["name"] ?? basename(modelDir)
  const version = options["version"] ?? "1.0.0"
  const description = options["description"] ?? (await describe(modelDir, name))

  const sizes = await fileSizes(modelDir)

  await ensureRegisteredModel(name, description)
  const modelVersionId = await ensureModelVersion(name, version)

  const target = await findPackage(name, version)
  if (!target) {
    throw new Error(`${name}@${version} did not show up in the package registry`)
  }

  const uploaded = token ? await listPackageFiles(target.id) : new Map()
  for (const [fileName, size] of sizes) {
    if (!token) {
      console.log(`skipping ${fileName}, ${size} bytes, GITLAB_TOKEN is not set`)
      continue
    }
    if (uploaded.get(fileName) === size) {
      console.log(`${fileName} is already uploaded`)
      continue
    }
    await uploadFile(token, modelVersionId, modelDir, fileName)
  }

  console.log("")
  console.log(`https://gitlab.com/${PROJECT_PATH}/-/packages/${target.id}`)
  console.log(`  ${name.replace(/-/g, "_")}: {`)
  console.log(`    name: "${name}",`)
  console.log(`    version: CTC_MODEL_VERSION,`)
  console.log(`    packageId: ${target.id},`)
  console.log(`    modelVersionId: ${modelVersionId},`)
  console.log(`    subdir: "${name}",`)
  console.log(`    entryFile: "model.safetensors",`)
  console.log(`  },`)
  console.log("")
}

async function main() {
  const { modelDirs, options } = parseArguments(process.argv.slice(2))
  const token = readToken()

  for (const modelDir of modelDirs) {
    console.log(`--- ${modelDir}`)
    await publish(modelDir, options, token)
  }

  if (!token) {
    console.log(
      [
        "No files were uploaded: the registry upload endpoint only accepts a personal",
        "access token or a ci job token, never glab's oauth session. Run this again with",
        "a token that has the api scope to fill the packages:",
        "",
        `  GITLAB_TOKEN=<personal access token> node scripts/upload-ctc-model.mjs ${modelDirs.join(" ")}`,
      ].join("\n"),
    )
  }
}

await main()
