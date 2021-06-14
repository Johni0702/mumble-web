import { Writable } from 'stream'
import MicrophoneStream from 'microphone-stream'
import audioContext from 'audio-context'
import keyboardjs from 'keyboardjs'
import vad from 'voice-activity-detection'
import DropStream from 'drop-stream'
import { WorkerBasedMumbleClient } from './worker-client'
import workletUrl from './recorder.js'

class VoiceHandler extends Writable {
  constructor (client, settings) {
    super({ objectMode: true })
    this._client = client
    this._settings = settings
    this._outbound = null
    this._mute = false
  }

  setMute (mute) {
    this._mute = mute
    if (mute) {
      this._stopOutbound()
    }
  }

  _getOrCreateOutbound () {
    if (this._mute) {
      throw new Error('tried to send audio while self-muted')
    }
    if (!this._outbound) {
      if (!this._client) {
        this._outbound = DropStream.obj()
        this.emit('started_talking')
        return this._outbound
      }

      if (this._client instanceof WorkerBasedMumbleClient) {
        // Note: the samplesPerPacket argument is handled in worker.js and not passed on
        this._outbound = this._client.createVoiceStream(this._settings.samplesPerPacket)
      } else {
        this._outbound = this._client.createVoiceStream()
      }

      this.emit('started_talking')
    }
    return this._outbound
  }

  _stopOutbound () {
    if (this._outbound) {
      this.emit('stopped_talking')
      this._outbound.end()
      this._outbound = null
    }
  }

  _final (callback) {
    this._stopOutbound()
    callback()
  }
}

export class ContinuousVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
  }

  _write (data, _, callback) {
    if (this._mute) {
      callback()
    } else {
      this._getOrCreateOutbound().write(data, callback)
    }
  }
}

export class PushToTalkVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
    this._key = settings.pttKey
    this._pushed = false
    this._keydown_handler = () => this._pushed = true
    this._keyup_handler = () => {
      this._stopOutbound()
      this._pushed = false
    }
    keyboardjs.bind(this._key, this._keydown_handler, this._keyup_handler)
  }

  _write (data, _, callback) {
    if (this._pushed && !this._mute) {
      this._getOrCreateOutbound().write(data, callback)
    } else {
      callback()
    }
  }

  _final (callback) {
    super._final(e => {
      keyboardjs.unbind(this._key, this._keydown_handler, this._keyup_handler)
      callback(e)
    })
  }
}

export class VADVoiceHandler extends VoiceHandler {
  constructor (client, settings) {
    super(client, settings)
    let level = settings.vadLevel
    const self = this
    this._vad = vad(audioContext(), theUserMedia, {
      onVoiceStart () {
        console.log('vad: start')
        self._active = true
      },
      onVoiceStop () {
        console.log('vad: stop')
        self._stopOutbound()
        self._active = false
      },
      onUpdate (val) {
        self._level = val
        self.emit('level', val)
      },
      noiseCaptureDuration: 0,
      minNoiseLevel: level,
      maxNoiseLevel: level
    })
    // Need to keep a backlog of the last ~150ms (dependent on sample rate)
    // because VAD will activate with ~125ms delay
    this._backlog = []
    this._backlogLength = 0
    this._backlogLengthMin = 1024 * 6 * 4 // vadBufferLen * (vadDelay + 1) * bytesPerSample
  }

  _write (data, _, callback) {
    if (this._active && !this._mute) {
      if (this._backlog.length > 0) {
        for (let oldData of this._backlog) {
          this._getOrCreateOutbound().write(oldData)
        }
        this._backlog = []
        this._backlogLength = 0
      }
      this._getOrCreateOutbound().write(data, callback)
    } else {
      // Make sure we always keep the backlog filled if we're not (yet) talking
      this._backlog.push(data)
      this._backlogLength += data.length
      // Check if we can discard the oldest element without becoming too short
      if (this._backlogLength - this._backlog[0].length > this._backlogLengthMin) {
        this._backlogLength -= this._backlog.shift().length
      }
      callback()
    }
  }

  _final (callback) {
    super._final(e => {
      this._vad.destroy()
      callback(e)
    })
  }
}

var theUserMedia = null
var oldBufferNumber = 0;

export function initVoice (onData) {
  return window.navigator.mediaDevices.getUserMedia({ audio: true }).then((userMedia) => {
    theUserMedia = userMedia
    setTimeout(() => audioContext().audioWorklet.addModule(workletUrl).then(() => {
      console.log("AudioWorklet loaded!")
      const recorderNode = new window.AudioWorkletNode(
        audioContext(),
        'recorder-worklet'
      )
      const microphone = audioContext().createMediaStreamSource(userMedia)
      microphone.connect(recorderNode)

      const delay_buffer = []
      const delay_upperlimit = 30
      recorderNode.port.onmessage = e => {
        if (e.data.eventType === 'data') {
          // Determine the delay between audio packet delivery (recorder.postMessage) and reception and 
          // stop forwarding audio packets to the voice pipeline, when the average delay is higher than
          // delay_upperlimit.
          // This prevents possible audio glitches induced by too high delays.
          const timestamp = e.data.timestamp
          const delay = Date.now() - timestamp
          const newBufferNumber = e.data.number
          var avg = 0

          delay_buffer.push(delay)
          if (delay_buffer.length < 10) {
            console.debug("Not enough values!")
            oldBufferNumber = newBufferNumber
            return
          }
          if (delay_buffer.length > 10) {
            delay_buffer.shift()
          }
          for (var i = 0; i < delay_buffer.length; i++) {
            avg += delay_buffer[i]
          }
          avg /= delay_buffer.length
          if (avg >= delay_upperlimit) {
            console.log("Average delay too high! " + avg)
            oldBufferNumber = newBufferNumber
            return
          }

          // Only forward audio packets with higher buffer number (=new audio packets) 
          // to the voice pipe line
          if (oldBufferNumber >= newBufferNumber) {
            console.error("Old buffer occured!", oldBufferNumber, newBufferNumber)
          } else {
            if (oldBufferNumber + 1 != newBufferNumber) {
              console.log("Buffer numbers don't fit!", oldBufferNumber, newBufferNumber)
            }
            oldBufferNumber = newBufferNumber
            const audioData = e.data.audioBuffer
            onData(audioData)
          }
        }
      }
      console.log("AudioWorkletNode initialized!")
    }), 500)
    return userMedia
  })
}
