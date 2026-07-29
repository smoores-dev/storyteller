package dev.smoores.storyteller.platform

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge

/** Supplies Android's network-path state to the shared Storyteller source actor. */
object AndroidNetworkMonitor {
    private const val TAG = "StorytellerNetwork"
    private var started = false
    private var lastAvailability: Boolean? = null

    @Synchronized
    fun start(context: Context) {
        if (started) return
        started = true

        val connectivity = context.applicationContext
            .getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = publish(connectivity)

            override fun onLost(network: Network) = publish(connectivity)

            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities,
            ) = publish(connectivity)
        }
        connectivity.registerNetworkCallback(
            NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build(),
            callback,
        )
        publish(connectivity)
    }

    fun isNetworkAvailable(context: Context): Boolean {
        val connectivity = context.applicationContext
            .getSystemService(ConnectivityManager::class.java)
        return isNetworkAvailable(connectivity)
    }

    @Synchronized
    private fun publish(connectivity: ConnectivityManager) {
        val available = isNetworkAvailable(connectivity)
        if (lastAvailability == available) return
        lastAvailability = available
        StorytellerAndroidBridge.androidNetworkAvailabilityDidChange(available)
            .whenComplete { _, error ->
                if (error != null) Log.e(TAG, "Could not update network status", error)
            }
    }

    private fun isNetworkAvailable(connectivity: ConnectivityManager): Boolean =
        connectivity.activeNetwork
            ?.let(connectivity::getNetworkCapabilities)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
}
