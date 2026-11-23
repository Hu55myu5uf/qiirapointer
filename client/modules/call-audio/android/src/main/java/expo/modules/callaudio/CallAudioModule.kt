package expo.modules.callaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Call audio for in-app calls: keeps the phone in "call mode" (echo cancellation, call volume)
 * for the whole call and only moves the sound between the earpiece (or a headset) and the
 * loudspeaker. Switching the whole audio mode, as general media players do, makes calls
 * inconsistent when the speaker is toggled.
 */
class CallAudioModule : Module() {
  private var active = false
  private var focusRequest: AudioFocusRequest? = null

  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("CallAudio")

    Function("start") { speaker: Boolean -> startCall(speaker) }

    Function("setSpeaker") { speaker: Boolean -> routeSpeaker(speaker) }

    Function("stop") { -> stopCall() }

    OnDestroy { stopCall() }
  }

  private fun startCall(speaker: Boolean): Boolean {
    val am = audioManager ?: return false
    return try {
      if (!active) {
        requestFocus(am)
        active = true
      }
      am.mode = AudioManager.MODE_IN_COMMUNICATION
      route(am, speaker)
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun routeSpeaker(speaker: Boolean): Boolean {
    val am = audioManager ?: return false
    return try {
      if (am.mode != AudioManager.MODE_IN_COMMUNICATION) am.mode = AudioManager.MODE_IN_COMMUNICATION
      route(am, speaker)
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun stopCall(): Boolean {
    val am = audioManager ?: return false
    if (!active) return true
    return try {
      if (Build.VERSION.SDK_INT >= 31) {
        am.clearCommunicationDevice()
      } else {
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false
      }
      am.mode = AudioManager.MODE_NORMAL
      abandonFocus(am)
      true
    } catch (e: Exception) {
      false
    } finally {
      active = false
    }
  }

  private fun route(am: AudioManager, speaker: Boolean) {
    if (Build.VERSION.SDK_INT >= 31) {
      val devices = am.availableCommunicationDevices
      val target: AudioDeviceInfo? = if (speaker) {
        devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      } else {
        // A connected headset wins over the earpiece
        val order = listOf(
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLE_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_USB_HEADSET,
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        )
        order.firstNotNullOfOrNull { type -> devices.firstOrNull { it.type == type } }
      }
      if (target != null) am.setCommunicationDevice(target) else am.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      am.isSpeakerphoneOn = speaker
    }
  }

  private fun requestFocus(am: AudioManager) {
    if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setOnAudioFocusChangeListener { }
        .build()
      am.requestAudioFocus(request)
      focusRequest = request
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonFocus(am: AudioManager) {
    if (Build.VERSION.SDK_INT >= 26) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
  }
}
