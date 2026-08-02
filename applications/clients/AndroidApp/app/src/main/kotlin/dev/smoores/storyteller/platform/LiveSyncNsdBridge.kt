package dev.smoores.storyteller.platform

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import androidx.annotation.Keep
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge
import java.util.ArrayDeque

// Discovery lives in Kotlin because Android exposes mDNS only through NsdManager.
@Keep
object LiveSyncNsdBridge {
    private const val TAG = "LiveSyncNsd"
    private const val SERVICE_TYPE = "_storyteller-lrs._udp"

    private var nsdManager: NsdManager? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var ownInstanceID = ""

    @Volatile
    private var registeredName: String? = null

    // NsdManager rejects concurrent resolves; run them one at a time.
    private val resolveQueue = ArrayDeque<NsdServiceInfo>()
    private var resolving = false

    @JvmStatic
    fun initialize(context: Context) {
        if (nsdManager == null) {
            nsdManager = context.applicationContext
                .getSystemService(Context.NSD_SERVICE) as? NsdManager
        }
    }

    @JvmStatic
    fun start(instanceID: String, port: Int) {
        val manager = nsdManager ?: run {
            Log.w(TAG, "start() before initialize(); NSD unavailable")
            return
        }
        stop()
        ownInstanceID = instanceID

        val info = NsdServiceInfo().apply {
            serviceName = instanceID
            serviceType = SERVICE_TYPE
            setPort(port)
        }
        registrationListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(registered: NsdServiceInfo) {
                registeredName = registered.serviceName
            }

            override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Service registration failed: $errorCode")
            }

            override fun onServiceUnregistered(info: NsdServiceInfo) {}

            override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) {}
        }.also { manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, it) }

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "Discovery start failed: $errorCode")
            }

            override fun onDiscoveryStopped(serviceType: String) {}

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}

            override fun onServiceFound(service: NsdServiceInfo) {
                if (service.serviceName == ownInstanceID ||
                    service.serviceName == registeredName
                ) {
                    return
                }
                synchronized(resolveQueue) { resolveQueue.add(service) }
                pumpResolveQueue()
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                StorytellerAndroidBridge.liveSyncPeerLost(service.serviceName)
                    .whenComplete { _, error ->
                        if (error != null) Log.w(TAG, "peerLost failed", error)
                    }
            }
        }.also { manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, it) }
    }

    @JvmStatic
    fun stop() {
        val manager = nsdManager ?: return
        discoveryListener?.let { runCatching { manager.stopServiceDiscovery(it) } }
        discoveryListener = null
        registrationListener?.let { runCatching { manager.unregisterService(it) } }
        registrationListener = null
        registeredName = null
        synchronized(resolveQueue) {
            resolveQueue.clear()
            resolving = false
        }
    }

    private fun pumpResolveQueue() {
        val manager = nsdManager ?: return
        var next: NsdServiceInfo? = null
        synchronized(resolveQueue) {
            if (resolving) return
            next = resolveQueue.poll()
            if (next != null) resolving = true
        }
        val service = next ?: return
        manager.resolveService(service, object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Resolve failed for ${info.serviceName}: $errorCode")
                finishResolve()
            }

            override fun onServiceResolved(info: NsdServiceInfo) {
                @Suppress("DEPRECATION")
                val host = info.host?.hostAddress
                if (host != null && !host.contains(":")) {
                    StorytellerAndroidBridge
                        .liveSyncPeerFound(info.serviceName, host, info.port)
                        .whenComplete { _, error ->
                            if (error != null) Log.w(TAG, "peerFound failed", error)
                        }
                }
                finishResolve()
            }
        })
    }

    private fun finishResolve() {
        synchronized(resolveQueue) { resolving = false }
        pumpResolveQueue()
    }
}
