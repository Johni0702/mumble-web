import { Transform } from 'stream'
import mumbleConnect from 'mumble-client-websocket'
import toArrayBuffer from 'to-arraybuffer'
import chunker from 'stream-chunker'
import Resampler from 'libsamplerate.js'

// Polyfill nested webworkers for https://bugs.chromium.org/p/chromium/issues/detail?id=31666
import 'subworkers'

// Monkey-patch to allow webworkify-webpack and codecs to work inside of web worker
/* global URL */
window.URL = URL

// Using require to ensure ordering relative to monkey-patch above
let CodecsBrowser = require('mumble-client-codecs-browser')

export default function (self) {
  let sampleRate
  let nextClientId = 1
  let nextVoiceId = 1
  let voiceStreams = []
  let clients = []

  function postMessage (msg, transfer) {
    try {
      self.postMessage(msg, transfer)
    } catch (err) {
      console.error('Failed to postMessage', msg)
      throw err
    }
  }

  function resolve (reqId, value, transfer) {
    postMessage({
      reqId: reqId,
      result: value
    }, transfer)
  }

  function reject (reqId, value, transfer) {
    console.error(value)
    let jsonValue = JSON.parse(JSON.stringify(value))
    if (value.$type) {
      jsonValue.$type = { name: value.$type.name }
    }
    postMessage({
      reqId: reqId,
      error: jsonValue
    }, transfer)
  }

  function registerEventProxy (id, obj, event, transform) {
    obj.on(event, function (_) {
      postMessage({
        clientId: id.client,
        channelId: id.channel,
        userId: id.user,
        event: event,
        value: transform ? transform.apply(null, arguments) : Array.from(arguments)
      })
    })
  }

  function pushProp (id, obj, prop, transform) {
    let value = obj[prop]
    postMessage({
      clientId: id.client,
      channelId: id.channel,
      userId: id.user,
      prop: prop,
      value: transform ? transform(value) : value
    })
  }

  function setupOutboundVoice (voiceId, samplesPerPacket, stream) {
    let resampler = new Resampler({
      unsafe: true,
      type: Resampler.Type.SINC_FASTEST,
      ratio: 48000 / sampleRate
    })

    let buffer2Float32Array = new Transform({
      transform (data, _, callback) {
        callback(null, new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4))
      },
      readableObjectMode: true
    })

    resampler
      .pipe(chunker(4 * samplesPerPacket))
      .pipe(buffer2Float32Array)
      .pipe(stream)

    voiceStreams[voiceId] = resampler
  }

  function setupChannel (id, channel) {
    id = Object.assign({}, id, { channel: channel.id })

    registerEventProxy(id, channel, 'update', (actor, props) => {
      if (actor) {
        actor = actor.id
      }
      if (props.parent) {
        props.parent = props.parent.id
      }
      if (props.links) {
        props.links = props.links.map((it) => it.id)
      }
      return [actor, props]
    })
    registerEventProxy(id, channel, 'remove')

    pushProp(id, channel, 'parent', (it) => it ? it.id : it)
    pushProp(id, channel, 'links', (it) => it.map((it) => it.id))
    let props = [
      'position', 'name', 'description'
    ]
    for (let prop of props) {
      pushProp(id, channel, prop)
    }

    for (let child of channel.children) {
      setupChannel(id, child)
    }

    return channel.id
  }

  function setupUser (id, user) {
    id = Object.assign({}, id, { user: user.id })

    registerEventProxy(id, user, 'update', (actor, props) => {
      if (actor) {
        actor = actor.id
      }
      if (props.channel != null) {
        props.channel = props.channel.id
      }
      return [actor, props]
    })
    registerEventProxy(id, user, 'voice', (stream) => {
      let voiceId = nextVoiceId++

      let target

      // We want to do as little on the UI thread as possible, so do resampling here as well
      var resampler = new Resampler({
        unsafe: true,
        type: Resampler.Type.ZERO_ORDER_HOLD,
        ratio: sampleRate / 48000
      })

      // Pipe stream into resampler
      stream.on('data', (data) => {
        // store target so we can pass it on after resampling
        target = data.target
        resampler.write(Buffer.from(data.pcm.buffer))
      }).on('end', () => {
        resampler.end()
      })

      // Pipe resampler into output stream on UI thread
      resampler.on('data', (data) => {
        data = toArrayBuffer(data) // postMessage can't transfer node's Buffer
        postMessage({
          voiceId: voiceId,
          target: target,
          buffer: data
        }, [data])
      }).on('end', () => {
        postMessage({
          voiceId: voiceId
        })
      })

      return [voiceId]
    })
    registerEventProxy(id, user, 'remove')

    pushProp(id, user, 'channel', (it) => it ? it.id : it)
    let props = [
      'uniqueId', 'username', 'mute', 'deaf', 'suppress', 'selfMute', 'selfDeaf',
      'texture', 'textureHash', 'comment'
    ]
    for (let prop of props) {
      pushProp(id, user, prop)
    }

    return user.id
  }

  function setupClient (id, client) {
    id = { client: id }

    registerEventProxy(id, client, 'error')
    registerEventProxy(id, client, 'newChannel', (it) => [setupChannel(id, it)])
    registerEventProxy(id, client, 'newUser', (it) => [setupUser(id, it)])
    registerEventProxy(id, client, 'message', (sender, message, users, channels, trees) => {
      return [
        sender.id,
        message,
        users.map((it) => it.id),
        channels.map((it) => it.id),
        trees.map((it) => it.id)
      ]
    })
    client.on('dataPing', () => {
      pushProp(id, client, 'dataStats')
    })

    setupChannel(id, client.root)
    for (let user of client.users) {
      setupUser(id, user)
    }

    pushProp(id, client, 'root', (it) => it.id)
    pushProp(id, client, 'self', (it) => it.id)
    pushProp(id, client, 'welcomeMessage')
    pushProp(id, client, 'serverVersion')
    pushProp(id, client, 'maxBandwidth')
  }

  function onMessage (data) {
    let { reqId, method, payload } = data
    if (method === '_init') {
      sampleRate = data.sampleRate
    } else if (method === '_connect') {
      payload.args.codecs = CodecsBrowser
      mumbleConnect(payload.host, payload.args).then((client) => {
        let id = nextClientId++
        clients[id] = client
        setupClient(id, client)
        return id
      }).done((id) => {
        resolve(reqId, id)
      }, (err) => {
        reject(reqId, err)
      })
    } else if (data.clientId != null) {
      let client = clients[data.clientId]

      let target
      if (data.userId != null) {
        target = client.getUserById(data.userId)
        if (method === 'setChannel') {
          payload = [client.getChannelById(payload)]
        }
      } else if (data.channelId != null) {
        target = client.getChannelById(data.channelId)
      } else {
        target = client
        if (method === 'createVoiceStream') {
          let voiceId = payload.shift()
          let samplesPerPacket = payload.shift()

          let stream = target.createVoiceStream.apply(target, payload)

          setupOutboundVoice(voiceId, samplesPerPacket, stream)
          return
        }
        if (method === 'disconnect') {
          delete clients[data.clientId]
        }
      }

      target[method].apply(target, payload)
    } else if (data.voiceId != null) {
      let stream = voiceStreams[data.voiceId]
      let buffer = data.chunk
      if (buffer) {
        stream.write(Buffer.from(buffer))
      } else {
        delete voiceStreams[data.voiceId]
        stream.end()
      }
    }
  }

  self.addEventListener('message', (ev) => {
    try {
      onMessage(ev.data)
    } catch (ex) {
      console.error('exception during message event', ev.data, ex)
    }
  })
}
