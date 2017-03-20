import 'stream-browserify' // see https://github.com/ericgundrum/pouch-websocket-sync-example/commit/2a4437b013092cc7b2cd84cf1499172c84a963a3
import url from 'url'
import mumbleConnect from 'mumble-client-websocket'
import CodecsBrowser from 'mumble-client-codecs-browser'
import BufferQueueNode from 'web-audio-buffer-queue'
import MicrophoneStream from 'microphone-stream'
import audioContext from 'audio-context'
import chunker from 'stream-chunker'
import Resampler from 'libsamplerate.js'
import getUserMedia from 'getusermedia'
import ko from 'knockout'
import _dompurify from 'dompurify'

const dompurify = _dompurify(window)

function sanitize (html) {
  return dompurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'b', 'i', 'u', 'a', 'span', 'p']
  })
}

// GUI

function ConnectDialog () {
  var self = this
  self.address = ko.observable('')
  self.port = ko.observable('443')
  self.token = ko.observable('')
  self.username = ko.observable('')
  self.visible = ko.observable(true)
  self.show = self.visible.bind(self.visible, true)
  self.hide = self.visible.bind(self.visible, false)
  self.connect = function () {
    self.hide()
    ui.connect(self.username(), self.address(), self.port(), self.token())
  }
}

function ConnectionInfo () {
  var self = this
  self.visible = ko.observable(false)
  self.show = function () {
    self.visible(true)
  }
}

function CommentDialog () {
  var self = this
  self.visible = ko.observable(false)
  self.show = function () {
    self.visible(true)
  }
}

function SettingsDialog () {
  var self = this
  self.visible = ko.observable(false)
  self.show = function () {
    self.visible(true)
  }
}

class GlobalBindings {
  constructor () {
    this.client = null
    this.connectDialog = new ConnectDialog()
    this.connectionInfo = new ConnectionInfo()
    this.commentDialog = new CommentDialog()
    this.settingsDialog = new SettingsDialog()
    this.log = ko.observableArray()
    this.thisUser = ko.observable()
    this.root = ko.observable()
    this.messageBox = ko.observable('')
    this.selected = ko.observable()

    this.select = element => {
      this.selected(element)
    }

    this.getTimeString = () => {
      return '[' + new Date().toLocaleTimeString('en-US') + ']'
    }

    this.connect = (username, host, port, token) => {
      this.resetClient()

      log('Connecting to server ', host)

      // TODO: token
      mumbleConnect(`wss://${host}:${port}`, {
        username: username,
        codecs: CodecsBrowser
      }).done(client => {
        log('Connected!')

        this.client = client

        // Prepare for connection errors
        client.on('error', function (err) {
          log('Connection error:', err)
          this.resetClient()
        })

        // Register all channels, recursively
        const registerChannel = channel => {
          this._newChannel(channel)
          channel.children.forEach(registerChannel)
        }
        registerChannel(client.root)

        // Register all users
        client.users.forEach(user => this._newUser(user))

        // Register future channels
        client.on('newChannel', channel => this._newChannel(channel))
        // Register future users
        client.on('newUser', user => this._newUser(user))

        // Handle messages
        client.on('message', (sender, message, users, channels, trees) => {
          ui.log.push({
            type: 'chat-message',
            user: sender.__ui,
            channel: channels.length > 0,
            message: sanitize(message)
          })
        })

        // Set own user and root channel
        this.thisUser(client.self.__ui)
        this.root(client.root.__ui)
        // Upate linked channels
        this._updateLinks()
        // Log welcome message
        if (client.welcomeMessage) {
          this.log.push({
            type: 'welcome-message',
            message: sanitize(client.welcomeMessage)
          })
        }
      }, err => {
        log('Connection error:', err)
      })
    }

    this._newUser = user => {
      const simpleProperties = {
        uniqueId: 'uid',
        username: 'name',
        mute: 'mute',
        deaf: 'deaf',
        suppress: 'suppress',
        selfMute: 'selfMute',
        selfDeaf: 'selfDeaf',
        comment: 'comment'
      }
      var ui = user.__ui = {
        model: user,
        talking: ko.observable('off'),
        channel: ko.observable()
      }
      Object.entries(simpleProperties).forEach(key => {
        ui[key[1]] = ko.observable(user[key[0]])
      })
      ui.state = ko.pureComputed(userToState, ui)
      if (user.channel) {
        ui.channel(user.channel.__ui)
        ui.channel().users.push(ui)
        ui.channel().users.sort(compareUsers)
      }

      user.on('update', (actor, properties) => {
        Object.entries(simpleProperties).forEach(key => {
          if (properties[key[0]] !== undefined) {
            ui[key[1]](properties[key[0]])
          }
        })
        if (properties.channel !== undefined) {
          if (ui.channel()) {
            ui.channel().users.remove(ui)
          }
          ui.channel(properties.channel.__ui)
          ui.channel().users.push(ui)
          ui.channel().users.sort(compareUsers)
          this._updateLinks()
        }
      }).on('remove', () => {
        if (ui.channel()) {
          ui.channel().users.remove(ui)
        }
      }).on('voice', stream => {
        console.log(`User ${user.username} started takling`)
        var userNode = new BufferQueueNode({
          audioContext: audioContext
        })
        userNode.connect(audioContext.destination)

        var resampler = new Resampler({
          unsafe: true,
          type: Resampler.Type.ZERO_ORDER_HOLD,
          ratio: audioContext.sampleRate / 48000
        })
        resampler.pipe(userNode)

        stream.on('data', data => {
          if (data.target === 'normal') {
            ui.talking('on')
          } else if (data.target === 'shout') {
            ui.talking('shout')
          } else if (data.target === 'whisper') {
            ui.talking('whisper')
          }
          resampler.write(Buffer.from(data.pcm.buffer))
        }).on('end', () => {
          console.log(`User ${user.username} stopped takling`)
          ui.talking('off')
          resampler.end()
        })
      })
    }

    this._newChannel = channel => {
      const simpleProperties = {
        position: 'position',
        name: 'name',
        description: 'description'
      }
      var ui = channel.__ui = {
        model: channel,
        expanded: ko.observable(true),
        parent: ko.observable(),
        channels: ko.observableArray(),
        users: ko.observableArray(),
        linked: ko.observable(false)
      }
      Object.entries(simpleProperties).forEach(key => {
        ui[key[1]] = ko.observable(channel[key[0]])
      })
      if (channel.parent) {
        ui.parent(channel.parent.__ui)
        ui.parent().channels.push(ui)
        ui.parent().channels.sort(compareChannels)
      }
      this._updateLinks()

      channel.on('update', properties => {
        Object.entries(simpleProperties).forEach(key => {
          if (properties[key[0]] !== undefined) {
            ui[key[1]](properties[key[0]])
          }
        })
        if (properties.parent !== undefined) {
          if (ui.parent()) {
            ui.parent().channel.remove(ui)
          }
          ui.parent(properties.parent.__ui)
          ui.parent().channels.push(ui)
          ui.parent().channels.sort(compareChannels)
        }
        if (properties.links !== undefined) {
          this._updateLinks()
        }
      }).on('remove', () => {
        if (ui.parent()) {
          ui.parent().channels.remove(ui)
        }
        this._updateLinks()
      })
    }

    this.resetClient = () => {
      if (this.client) {
        this.client.disconnect()
      }
      this.client = null
      this.thisUser(null).root(null).selected(null)
    }

    this.connected = () => this.thisUser() != null

    this.messageBoxHint = ko.pureComputed(() => {
      if (!this.thisUser()) {
        return '' // Not yet connected
      }
      var target = this.selected()
      if (!target) {
        target = this.thisUser()
      }
      if (target === this.thisUser()) {
        target = target.channel()
      }
      if (target.users) { // Channel
        return "Type message to channel '" + target.name() + "' here"
      } else { // User
        return "Type message to user '" + target.name() + "' here"
      }
    })

    this.submitMessageBox = () => {
      this.sendMessage(this.selected(), this.messageBox())
      this.messageBox('')
    }

    this.sendMessage = (target, message) => {
      if (this.connected()) {
        // If no target is selected, choose our own user
        if (!target) {
          target = this.thisUser()
        }
        // If target is our own user, send to our channel
        if (target === this.thisUser()) {
          target = target.channel()
        }
        // Send message
        target.model.sendMessage(message)
        if (target.users) { // Channel
          this.log.push({
            type: 'chat-message-self',
            message: sanitize(message),
            channel: target
          })
        } else { // User
          this.log.push({
            type: 'chat-message-self',
            message: sanitize(message),
            user: target
          })
        }
      }
    }

    this.requestMove = (user, channel) => {
      if (this.connected()) {
        user.model.setChannel(channel.model)
      }
    }

    this.requestMute = user => {
      if (this.connected()) {
        if (user === this.thisUser) {
          this.client.setSelfMute(true)
        } else {
          user.model.setMute(true)
        }
      }
    }

    this.requestDeaf = user => {
      if (this.connected()) {
        if (user === this.thisUser) {
          this.client.setSelfDeaf(true)
        } else {
          user.model.setDeaf(true)
        }
      }
    }

    this.requestUnmute = user => {
      if (this.connected()) {
        if (user === this.thisUser) {
          this.client.setSelfMute(false)
        } else {
          user.model.setMute(false)
        }
      }
    }

    this.requestUndeaf = user => {
      if (this.connected()) {
        if (user === this.thisUser) {
          this.client.setSelfDeaf(false)
        } else {
          user.model.setDeaf(false)
        }
      }
    }

    this._updateLinks = () => {
      if (!this.thisUser()) {
        return
      }

      var allChannels = getAllChannels(this.root(), [])
      var ownChannel = this.thisUser().channel().model
      var allLinked = findLinks(ownChannel, [])
      allChannels.forEach(channel => {
        channel.linked(allLinked.indexOf(channel.model) !== -1)
      })

      function findLinks (channel, knownLinks) {
        knownLinks.push(channel)
        channel.links.forEach(next => {
          if (next && knownLinks.indexOf(next) === -1) {
            findLinks(next, knownLinks)
          }
        })
        allChannels.map(c => c.model).forEach(next => {
          if (next && knownLinks.indexOf(next) === -1 && next.links.indexOf(channel) !== -1) {
            findLinks(next, knownLinks)
          }
        })
        return knownLinks
      }

      function getAllChannels (channel, channels) {
        channels.push(channel)
        channel.channels().forEach(next => getAllChannels(next, channels))
        return channels
      }
    }

    this.openSourceCode = () => {
      var homepage = require('../package.json').homepage
      window.open(homepage, '_blank').focus()
    }
  }
}
var ui = new GlobalBindings()

// Used only for debugging
window.mumbleUi = ui

window.onload = function () {
  var queryParams = url.parse(document.location.href, true).query
  if (queryParams.address) {
    ui.connectDialog.address(queryParams.address)
  }
  if (queryParams.port) {
    ui.connectDialog.port(queryParams.port)
  }
  if (queryParams.token) {
    ui.connectDialog.token(queryParams.token)
  }
  if (queryParams.username) {
    ui.connectDialog.username(queryParams.username)
  }
  ko.applyBindings(ui)
}

function log () {
  console.log.apply(console, arguments)
  var args = []
  for (var i = 0; i < arguments.length; i++) {
    args.push(arguments[i])
  }
  ui.log.push({
    type: 'generic',
    value: args.join(' ')
  })
}

function compareChannels (c1, c2) {
  if (c1.position() === c2.position()) {
    return c1.name() === c2.name() ? 0 : c1.name() < c2.name() ? -1 : 1
  }
  return c1.position() - c2.position()
}

function compareUsers (u1, u2) {
  return u1.name() === u2.name() ? 0 : u1.name() < u2.name() ? -1 : 1
}

function userToState () {
  var flags = []
  // TODO: Friend
  if (this.uid()) {
    flags.push('Authenticated')
  }
  // TODO: Priority Speaker, Recording
  if (this.mute()) {
    flags.push('Muted (server)')
  }
  if (this.deaf()) {
    flags.push('Deafened (server)')
  }
  // TODO: Local Ignore (Text messages), Local Mute
  if (this.selfMute()) {
    flags.push('Muted (self)')
  }
  if (this.selfDeaf()) {
    flags.push('Deafened (self)')
  }
  return flags.join(', ')
}

// Audio input

var resampler = new Resampler({
  unsafe: true,
  type: Resampler.Type.SINC_FASTEST,
  ratio: 48000 / audioContext.sampleRate
})

var voiceStream
resampler.pipe(chunker(4 * 480)).on('data', function (data) {
  if (!voiceStream && ui.client) {
    voiceStream = ui.client.createVoiceStream()
  }
  if (voiceStream) {
    voiceStream.write(new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4))
  }
})

getUserMedia({ audio: true }, function (err, userMedia) {
  if (err) {
    log('Cannot initialize user media. Microphone will not work:', err)
  } else {
    var micStream = new MicrophoneStream(userMedia, { objectMode: true })
    micStream.on('data', function (data) {
      resampler.write(Buffer.from(data.getChannelData(0).buffer))
    })
  }
})
