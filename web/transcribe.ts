import { RecognitionResult, recognize, setGlobalOption } from "echogarden"
import { join } from "node:path"
import { WHISPER_BUILD_DIR } from "./directories"
import { mkdir, stat } from "node:fs/promises"
import simpleGit, { CheckRepoActions, GitConfigScope } from "simple-git"
import { exec as execCb, spawn } from "node:child_process"
import { promisify } from "node:util"
import { availableParallelism } from "node:os"
import { WhisperCppModelId } from "echogarden/dist/recognition/WhisperCppSTT"
import { Settings, WhisperModel } from "./database/settings"

const exec = promisify(execCb)

const WHISPER_REPO =
  process.env["STORYTELLER_WHISPER_REPO"] ??
  "https://github.com/ggerganov/whisper.cpp"

const WHISPER_VERSION = process.env["STORYTELLER_WHISPER_VERSION"] ?? "v1.7.2"
setGlobalOption("logLevel", "error")

async function installWhisper(settings: Settings) {
  const whisperBuild = settings.whisperBuild ?? "cpu"
  const enableCuda = whisperBuild.startsWith("cublas")
  if (process.env.NODE_ENV === "development") {
    return {
      build: "cpu",
    } as const
  }
  const repoDir = join(WHISPER_BUILD_DIR, whisperBuild)
  const executablePath = join(WHISPER_BUILD_DIR, whisperBuild, "main")
  try {
    await stat(executablePath)
    return {
      build: "custom",
      ...(enableCuda && { enableGPU: true }),
      executablePath,
    } as const
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
    if (enableCuda) {
      console.log("CUDA enabled; installing cuda toolkit")
      const cudaVersions =
        whisperBuild === "cublas-12.4"
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
    } else if (whisperBuild === "openblas") {
      console.log("Installing OpenBLAS")
      await exec("apt-get update")
      await exec("apt-get -y install libopenblas-dev")
    } else if (whisperBuild === "hipblas") {
      console.log("Installing ROCm and hipBLAS")
      await exec(
        "curl -sL http://repo.radeon.com/rocm/rocm.gpg.key | apt-key add -",
      )
      await exec(
        'printf "deb [arch=amd64] https://repo.radeon.com/rocm/apt/6.2.1/ noble main" | tee /etc/apt/sources.list.d/rocm.list',
      )
      await exec(
        'printf "deb [arch=amd64] https://repo.radeon.com/amdgpu/6.2.1/ubuntu noble main" | tee /etc/apt/sources.list.d/amdgpu.list',
      )
      await exec("apt-get update")
      await exec("apt-get -y install rocm-dev hipblas-dev", {
        env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      })
    }
    console.log("Building whisper.cpp")

    // We use spawn here rather than exec so that we can
    // pipe the stdio to /dev/null, since we don't need it
    // and it can be very, very long!
    await new Promise<void>((resolve, reject) => {
      const make = spawn(
        "make",
        [`-j${Math.min(1, availableParallelism() - 1)}`],
        {
          cwd: repoDir,
          shell: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: {
            ...process.env,
            ...(enableCuda && {
              WHISPER_CUDA: "1",
              PATH: path,
              LIBRARY_PATH: libraryPath,
            }),
            ...(whisperBuild === "openblas" && {
              WHISPER_OPENBLAS: "1",
            }),
            ...(whisperBuild === "hipblas" && {
              GGML_HIPBLAS: "1",
            }),
          },
        },
      )

      make.on("close", (code, signal) => {
        if (code !== 0 || signal) {
          reject(new Error("Failed to build whisper.cpp"))
          return
        }
        resolve()
      })
    })
  }

  return {
    build: "custom",
    ...((enableCuda || whisperBuild === "hipblas") && { enableGPU: true }),
    executablePath,
  } as const
}

function getWhisperCppModelId(
  language: string,
  modelType: WhisperModel | "large",
): WhisperCppModelId {
  if (modelType === "large") return "large-v3-turbo"
  // large-x models don't have English-specific variants
  if (language !== "en" || modelType.startsWith("large")) return modelType
  const quant = modelType.indexOf("-q")
  if (quant === -1) return `${modelType}.en` as WhisperCppModelId
  return `${modelType.slice(0, quant)}.en${modelType.slice(quant)}` as WhisperCppModelId
}

export async function transcribeTrack(
  trackPath: string,
  initialPrompt: string | null,
  locale: Intl.Locale,
  settings: Settings,
): Promise<Pick<RecognitionResult, "transcript" | "wordTimeline">> {
  console.log(`Transcribing audio file ${trackPath}`)

  if (
    !settings.transcriptionEngine ||
    settings.transcriptionEngine === "whisper.cpp"
  ) {
    const whisperOptions = await installWhisper(settings)
    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "whisper.cpp",
      language: locale.language,
      whisperCpp: {
        ...(initialPrompt && { prompt: initialPrompt }),
        enableFlashAttention: true,
        model: getWhisperCppModelId(
          locale.language,
          settings.whisperModel ?? "tiny",
        ),
        ...whisperOptions,
      },
    })
    return { transcript, wordTimeline }
  }

  if (settings.transcriptionEngine === "google-cloud") {
    if (!settings.googleCloudApiKey) {
      throw new Error(
        "Failed to start transcription with engine google-cloud: missing API key",
      )
    }

    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "google-cloud",
      language: locale.toString(),
      googleCloud: {
        apiKey: settings.googleCloudApiKey,
      },
    })
    return { transcript, wordTimeline }
  }

  if (settings.transcriptionEngine === "microsoft-azure") {
    if (!settings.azureServiceRegion) {
      throw new Error(
        "Failed to start transcription with engine microsoft-azure: missing service region",
      )
    }
    if (!settings.azureSubscriptionKey) {
      throw new Error(
        "Failed to start transcription with engine microsoft-azure: missing subscription key",
      )
    }

    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "microsoft-azure",
      language: locale.toString(),
      microsoftAzure: {
        serviceRegion: settings.azureServiceRegion,
        subscriptionKey: settings.azureSubscriptionKey,
      },
    })
    return { transcript, wordTimeline }
  }

  if (settings.transcriptionEngine === "amazon-transcribe") {
    if (!settings.amazonTranscribeRegion) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing region",
      )
    }
    if (!settings.amazonTranscribeAccessKeyId) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing access key id",
      )
    }
    if (!settings.amazonTranscribeSecretAccessKey) {
      throw new Error(
        "Failed to start transcription with engine amazon-transcribe: missing access secret access key",
      )
    }

    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "amazon-transcribe",
      language: locale.toString(),
      amazonTranscribe: {
        region: settings.amazonTranscribeRegion,
        accessKeyId: settings.amazonTranscribeAccessKeyId,
        secretAccessKey: settings.amazonTranscribeSecretAccessKey,
      },
    })
    return { transcript, wordTimeline }
  }

  if (!settings.openAiApiKey) {
    throw new Error(
      "Failed to start transcription with engine openai-cloud: missing api key",
    )
  }

  const { transcript, wordTimeline } = await recognize(trackPath, {
    engine: "openai-cloud",
    language: locale.language,
    openAICloud: {
      ...(initialPrompt && { prompt: initialPrompt }),
      apiKey: settings.openAiApiKey,
      ...(settings.openAiOrganization && {
        organization: settings.openAiOrganization,
      }),
      ...(settings.openAiBaseUrl && { baseURL: settings.openAiBaseUrl }),
      ...(settings.openAiBaseUrl &&
        settings.openAiModelName && { model: settings.openAiModelName }),
    },
  })
  return { transcript, wordTimeline }
}
