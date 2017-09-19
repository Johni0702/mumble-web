import { Writable } from 'stream'
import MicrophoneStream from 'microphone-stream'
import audioContext from 'audio-context'
import chunker from 'stream-chunker'
import Resampler from 'libsamplerate.js'
import getUserMedia from 'getusermedia'

class VoiceHandler extends Writable {
  constructor (client) {
    super({ objectMode: true })
    this._client = client
    this._outbound = null
  }

  _getOrCreateOutbound () {
    if (!this._outbound) {
      this._outbound = this._client.createVoiceStream()
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
  constructor (client) {
    super(client)
  }

  _write (data, _, callback) {
    this._getOrCreateOutbound().write(data, callback)
  }
}

export function initVoice (onData, onUserMediaError) {
  var resampler = new Resampler({
    unsafe: true,
    type: Resampler.Type.SINC_FASTEST,
    ratio: 48000 / audioContext.sampleRate
  })

  resampler.pipe(chunker(4 * 480)).on('data', data => {
    onData(data)
  })

  getUserMedia({ audio: true }, (err, userMedia) => {
    if (err) {
      onUserMediaError(err)
    } else {
      var micStream = new MicrophoneStream(userMedia, { objectMode: true })
      micStream.on('data', data => {
        resampler.write(Buffer.from(data.getChannelData(0).buffer))
      })
    }
  })
}
