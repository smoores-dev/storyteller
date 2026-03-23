{
  "targets": [
    {
      "target_name": "error_align_native",
      "sources": [
        "src/errorAlign/cpp/edit_distance.cpp",
        "src/errorAlign/cpp/beam_search.cpp",
        "src/errorAlign/cpp/module.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "cflags_cc": ["-std=c++17", "-fexceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17"]
        }
      }
    }
  ]
}
