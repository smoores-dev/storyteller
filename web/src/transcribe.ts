import { exec as execCb, spawn } from "node:child_process"
import { mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import { type RecognitionResult, recognize, setGlobalOption } from "echogarden"
import { type WhisperCppModelId } from "echogarden/dist/recognition/WhisperCppSTT"
import simpleGit, { CheckRepoActions, GitConfigScope } from "simple-git"

import { type Settings, type WhisperModel } from "./database/settingsTypes"
import { WHISPER_BUILD_DIR } from "./directories"
import { logger } from "./logging"

const exec = promisify(execCb)

const WHISPER_REPO =
  process.env["STORYTELLER_WHISPER_REPO"] ??
  "https://github.com/ggerganov/whisper.cpp"

const WHISPER_VERSION = process.env["STORYTELLER_WHISPER_VERSION"] ?? "v1.8.2"
setGlobalOption("logLevel", "error")

export async function installWhisper(settings: Settings) {
  const whisperBuild = settings.whisperBuild ?? "cpu"
  const enableCuda = whisperBuild.startsWith("cublas")
  if (process.env.NODE_ENV === "development" && !process.env["DEV_CONTAINER"]) {
    return {
      build: "cpu",
    } as const
  }
  const repoDir = join(WHISPER_BUILD_DIR, whisperBuild)
  const executablePath = join(
    WHISPER_BUILD_DIR,
    whisperBuild,
    "build",
    "bin",
    "whisper-cli",
  )
  try {
    await stat(executablePath)
    return {
      build: "custom",
      ...(enableCuda && { enableGPU: true }),
      executablePath,
    } as const
  } catch {
    logger.info("Installing whisper.cpp")
    await mkdir(repoDir, { recursive: true })
    const git = simpleGit(repoDir)
    await git.addConfig(
      "safe.directory",
      WHISPER_BUILD_DIR,
      false,
      GitConfigScope.global,
    )
    if (await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)) {
      logger.info("Repo found, pulling the latest")
      await git.pull()
    } else {
      logger.info("Cloning source code")
      await git.clone(WHISPER_REPO, repoDir, [
        "--depth",
        "1",
        "--branch",
        WHISPER_VERSION,
      ])
    }
    let path = process.env["PATH"] ?? ""
    let libraryPath = process.env["LIBRARY_PATH"] ?? ""
    let ldLibraryPath = process.env["LD_LIBRARY_PATH"] ?? ""
    if (enableCuda) {
      if (whisperBuild === "cublas-11.8") {
        throw new Error(
          "CUDA 11 is no longer supported. Please upgrade to 12 or 13.",
        )
      }
      logger.info("CUDA enabled; installing cuda toolkit")
      const cudaVersions =
        whisperBuild === "cublas-13.0"
          ? {
              full: "13-0-local_13.0.2-580.95.05-1",
              semver: "13.0.2",
              majorMinor: "13.0",
              short: "13-0",
            }
          : {
              full: "12-6-local_12.6.3-560.35.05-1",
              semver: "12.6.3",
              majorMinor: "12.6",
              short: "12-6",
            }

      logger.info("Downloading toolkit package")
      await exec(
        `wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-ubuntu2404.pin`,
      )
      await exec(
        `mv cuda-ubuntu2404.pin /etc/apt/preferences.d/cuda-repository-pin-600`,
      )
      await exec(
        `wget --quiet https://developer.download.nvidia.com/compute/cuda/${cudaVersions.semver}/local_installers/cuda-repo-ubuntu2404-${cudaVersions.full}_amd64.deb`,
      )
      logger.info("Unpacking toolkit package")
      await exec(`dpkg -i cuda-repo-ubuntu2404-${cudaVersions.full}_amd64.deb`)
      await exec(
        `cp /var/cuda-repo-ubuntu2404-${cudaVersions.short}-local/cuda-*-keyring.gpg /usr/share/keyrings/`,
      )
      await exec(`rm cuda-repo-ubuntu2404-${cudaVersions.full}_amd64.deb`)
      await exec("apt update")
      logger.info("Installing toolkit")
      await exec(`apt-get -y install cuda-toolkit-${cudaVersions.short}`)
      path = `/usr/local/cuda-${cudaVersions.majorMinor}/bin:${path}`
      const stubsPath = `/usr/local/cuda-${cudaVersions.majorMinor}/lib64/stubs`
      libraryPath = `${stubsPath}:${libraryPath}`
      ldLibraryPath = `${stubsPath}:${ldLibraryPath}`

      // whisper.cpp looks for libcuda.so.1, but there's only a stub for libcuda.so,
      // so we just symlink it for the build. The actual run of the built binary
      // will use the host's libcuda.so.1 from the NVIDIA driver
      await exec(`ln -s ${stubsPath}/libcuda.so ${stubsPath}/libcuda.so.1`)
    } else if (whisperBuild === "hipblas") {
      logger.info("Installing ROCm and hipBLAS")
      await exec(
        "curl -sL http://repo.radeon.com/rocm/rocm.gpg.key | apt-key add -",
      )
      await exec(
        'printf "deb [arch=amd64] https://repo.radeon.com/rocm/apt/6.4.1/ jammy main" | tee /etc/apt/sources.list.d/rocm.list',
      )
      await exec(
        'printf "deb [arch=amd64] https://repo.radeon.com/amdgpu/6.4.1/ubuntu jammy main" | tee /etc/apt/sources.list.d/amdgpu.list',
      )
      await exec("apt-get update")
      await exec("apt-get -y install rocm-dev hipblas-dev", {
        env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      })
    }
    logger.info("Building whisper.cpp")

    // We use spawn here rather than exec so that we can
    // pipe the stdio to /dev/null, since we don't need it
    // and it can be very, very long!
    await new Promise<void>((resolve, reject) => {
      const make = spawn(
        "cmake",
        [
          "-B",
          "build",
          ...(enableCuda ? ["-DGGML_CUDA=1"] : []),
          ...(whisperBuild === "hipblas"
            ? [
                "-DGGML_HIPBLAS=1",
                // "-DGGML_HIP=ON",
                // "-DGPU_TARGETS=gfx1151",
                // "-DCMAKE_C_COMPILER=/opt/rocm/bin/amdclang",
                // "-DCMAKE_CXX_COMPILER=/opt/rocm/bin/amdclang++",
                // "-DCMAKE_PREFIX_PATH=/opt/rocm",
                // "-DGGML_ROCM=1",
              ]
            : []),
        ],
        {
          cwd: repoDir,
          shell: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: {
            ...process.env,
            ...(enableCuda && {
              PATH: path,
              LIBRARY_PATH: libraryPath,
              LD_LIBRARY_PATH: ldLibraryPath,
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

    await new Promise<void>((resolve, reject) => {
      const make = spawn(
        "cmake",
        [
          "--build",
          "build",
          `-j${settings.parallelWhisperBuild}`,
          "--config",
          "Release",
        ],
        {
          cwd: repoDir,
          shell: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: {
            ...process.env,
            ...(enableCuda && {
              PATH: path,
              LIBRARY_PATH: libraryPath,
              LD_LIBRARY_PATH: ldLibraryPath,
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
    logger.info("Successfully built whisper.cpp")
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
  locale: Intl.Locale,
  settings: Settings,
): Promise<Pick<RecognitionResult, "transcript" | "wordTimeline">> {
  if (
    !settings.transcriptionEngine ||
    settings.transcriptionEngine === "whisper.cpp"
  ) {
    const whisperOptions = await installWhisper(settings)

    logger.info(`Transcribing audio file ${trackPath}`)

    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "whisper.cpp",
      language: locale.language,
      whisperCpp: {
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

  logger.info(`Transcribing audio file ${trackPath}`)

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

  if (settings.transcriptionEngine === "openai-cloud") {
    if (!settings.openAiApiKey) {
      throw new Error(
        "Failed to start transcription with engine openai-cloud: missing api key",
      )
    }

    const { transcript, wordTimeline } = await recognize(trackPath, {
      engine: "openai-cloud",
      language: locale.language,
      openAICloud: {
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

  if (!settings.deepgramApiKey) {
    throw new Error(
      "Failed to start transcription with engine deepgram: missing api key",
    )
  }

  const { transcript, wordTimeline } = await recognize(trackPath, {
    engine: "deepgram",
    language: locale.language,
    deepgram: {
      apiKey: settings.deepgramApiKey,
      ...(settings.deepgramModel && { model: settings.deepgramModel }),
      punctuate: true,
    },
  })

  return { transcript, wordTimeline }
}
