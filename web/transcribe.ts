import {
  RecognitionResult,
  recognize,
  setGlobalOption,
} from "echogarden/dist/api/API.js"
import { join } from "node:path"
import { WHISPER_BUILD_DIR } from "./directories"
import { mkdir, stat } from "node:fs/promises"
import simpleGit, { CheckRepoActions, GitConfigScope } from "simple-git"
import { exec as execCb } from "node:child_process"
import { promisify } from "node:util"
import { availableParallelism } from "node:os"
import { WhisperCppModelId } from "echogarden/dist/recognition/WhisperCppSTT"

const exec = promisify(execCb)

const WHISPER_BUILD =
  process.env["STORYTELLER_WHISPER_BUILD"]?.toLowerCase() ?? "cpu"

const WHISPER_REPO =
  process.env["STORYTELLER_WHISPER_REPO"] ??
  "https://github.com/ggerganov/whisper.cpp"

const WHISPER_VERSION = process.env["STORYTELLER_WHISPER_VERSION"] ?? "master"

type ModelType =
  | "tiny"
  | "tiny-q5_1"
  | "base"
  | "base-q5_1"
  | "small"
  | "small-q5_1"
  | "medium"
  | "medium-q5_0"
  | "large"
  | "large-v1"
  | "large-v2"
  | "large-v2-q5_0"
  | "large-v3"
  | "large-v3-q5_0"

const WHISPER_MODEL =
  (process.env["STORYTELLER_WHISPER_MODEL"] as ModelType | undefined) ?? "tiny"

const ENABLE_CUDA = WHISPER_BUILD.startsWith("cublas")

setGlobalOption("logLevel", "error")

async function installWhisper() {
  if (process.env.NODE_ENV === "development") {
    return null
  }
  const repoDir = join(WHISPER_BUILD_DIR, WHISPER_BUILD)
  const executablePath = join(WHISPER_BUILD_DIR, WHISPER_BUILD, "main")
  try {
    await stat(executablePath)
    return executablePath
  } catch {
    console.log("Installing whisper.cpp")
    await mkdir(repoDir, { recursive: true })
    const git = simpleGit(repoDir)
    await git.addConfig(
      "safe.directory",
      WHISPER_BUILD_DIR,
      false,
      GitConfigScope.global,
    )
    if (await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)) {
      console.log("Repo found, pulling the latest")
      await git.pull()
    } else {
      console.log("Cloning source code")
      await git.clone(WHISPER_REPO, repoDir, [
        "--depth",
        "1",
        "--branch",
        WHISPER_VERSION,
      ])
    }
    let path = process.env["PATH"] ?? ""
    let libraryPath = process.env["LIBRARY_PATH"] ?? ""
    if (ENABLE_CUDA) {
      console.log("CUDA enabled; installing cuda toolkit")
      const cudaVersions =
        WHISPER_BUILD === "cublas-12.4"
          ? {
              full: "12-4-local_12.4.0-550.54.14-1",
              semver: "12.4.0",
              majorMinor: "12.4",
              short: "12-4",
            }
          : {
              full: "11-8-local_11.8.0-520.61.05-1",
              semver: "11.8.0",
              majorMinor: "11.8",
              short: "11-8",
            }

      console.log("Downloading toolkit package")
      await exec(
        `wget --quiet https://developer.download.nvidia.com/compute/cuda/${cudaVersions.semver}/local_installers/cuda-repo-debian11-${cudaVersions.full}_amd64.deb`,
      )
      console.log("Unpacking toolkit package")
      await exec(`dpkg -i cuda-repo-debian11-${cudaVersions.full}_amd64.deb`)
      await exec(
        `cp /var/cuda-repo-debian11-${cudaVersions.short}-local/cuda-*-keyring.gpg /usr/share/keyrings/`,
      )
      await exec(`rm cuda-repo-debian11-${cudaVersions.full}_amd64.deb`)
      await exec("add-apt-repository contrib")
      await exec("apt update")
      console.log("Installing toolkit")
      await exec(`apt-get -y install cuda-toolkit-${cudaVersions.short}`)
      path = `/usr/local/cuda-${cudaVersions.majorMinor}/bin:${path}`
      libraryPath = `/usr/local/cuda-${cudaVersions.majorMinor}/lib64/stubs:${libraryPath}`
    }
    console.log("Building whisper.cpp")
    await exec(`make -j${availableParallelism()}`, {
      cwd: repoDir,
      env: {
        ...process.env,
        ...(ENABLE_CUDA && {
          WHISPER_CUDA: "1",
          PATH: path,
          LIBRARY_PATH: libraryPath,
        }),
      },
    })
  }

  return executablePath
}

function getWhisperCppModelId(
  language: string,
  modelType: ModelType,
): WhisperCppModelId {
  if (language !== "en") return modelType
  const quant = modelType.indexOf("-q")
  if (quant === -1) return `${modelType}.en` as WhisperCppModelId
  return `${modelType.slice(0, quant)}.en${modelType.slice(quant)}` as WhisperCppModelId
}

export async function transcribeTrack(
  trackPath: string,
  initialPrompt: string | null,
  language: string,
): Promise<Pick<RecognitionResult, "transcript" | "wordTimeline">> {
  console.log(`Transcribing audio file ${trackPath}`)

  const executablePath = await installWhisper()

  const { transcript, wordTimeline } = await recognize(trackPath, {
    engine: "whisper.cpp",
    language,
    whisperCpp: {
      ...(initialPrompt && { prompt: initialPrompt }),
      model: getWhisperCppModelId(language, WHISPER_MODEL),
      build: executablePath === null ? "cpu" : "custom",
      ...(ENABLE_CUDA && { enableGPU: true }),
      ...(executablePath && { executablePath }),
    },
  })

  return { transcript, wordTimeline }
}
