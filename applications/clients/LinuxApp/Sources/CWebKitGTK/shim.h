#pragma once

#include <webkit/webkit.h>

static inline gulong storyteller_signal_connect(
    gpointer instance,
    const char *detailed_signal,
    GCallback handler,
    gpointer data)
{
    return g_signal_connect_data(instance, detailed_signal, handler, data, NULL, (GConnectFlags)0);
}
