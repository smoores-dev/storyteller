#include <napi.h>

void InitEditDistance(Napi::Env env, Napi::Object exports);
void InitBeamSearch(Napi::Env env, Napi::Object exports);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    InitEditDistance(env, exports);
    InitBeamSearch(env, exports);
    return exports;
}

NODE_API_MODULE(error_align_native, Init)
