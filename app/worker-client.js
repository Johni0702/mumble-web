import MumbleClient from "mumble-client";
import Promise from "promise";
import EventEmitter from "events";
import { Writable, PassThrough } from "stream";
import toArrayBuffer from "to-arraybuffer";
import ByteBuffer from "bytebuffer";
import Worker from "./worker";

/**
 * Creates proxy MumbleClients to a real ones running on a web worker.
 * Only stuff which we need in mumble-web is proxied, i.e. this is not a generic solution.
 */
class WorkerBasedMumbleConnector {
  constructor() {
    this._reqId = 1;
    this._requests = {};
    this._clients = {};
    this._nextVoiceId = 1;
    this._voiceStreams = {};
  }

  setSampleRate(sampleRate) {
    this._postMessage({
      method: "_init",
      sampleRate: sampleRate,
    });
  }

  _postMessage(msg, transfer) {
    if (!this._worker) {
      this._worker = new Worker();
      this._worker.addEventListener("message", this._onMessage.bind(this));
    }
    try {
      this._worker.postMessage(msg, transfer);
    } catch (err) {
      console.error("Failed to postMessage", msg);
      throw err;
    }
  }

  _call(id, method, payload, transfer) {
    let reqId = this._reqId++;
    console.debug(method, id, payload);
    this._postMessage(
      {
        clientId: id.client,
        channelId: id.channel,
        userId: id.user,
        method: method,
        reqId: reqId,
        payload: payload,
      },
      transfer
    );
    return reqId;
  }

  _query(id, method, payload, transfer) {
    let reqId = this._call(id, method, payload, transfer);
    return new Promise((resolve, reject) => {
      this._requests[reqId] = [resolve, reject];
    });
  }

  _addCall(proxy, name, id) {
    let self = this;
    proxy[name] = function () {
      self._call(id, name, Array.from(arguments));
    };
  }

  connect(host, args) {
    return this._query({}, "_connect", { host: host, args: args }).then((id) =>
      this._client(id)
    );
  }

  _client(id) {
    let client = this._clients[id];
    if (!client) {
      client = new WorkerBasedMumbleClient(this, id);
      this._clients[id] = client;
    }
    return client;
  }

  _onMessage(ev) {
    let data = ev.data;
    if (data.reqId != null) {
      console.debug(data);
      let { reqId, result, error } = data;
      let [resolve, reject] = this._requests[reqId];
      delete this._requests[reqId];
      if (result) {
        resolve(result);
      } else {
        reject(error);
      }
    } else if (data.clientId != null) {
      console.debug(data);
      let client = this._client(data.clientId);

      let target;
      if (data.userId != null) {
        target = client._user(data.userId);
      } else if (data.channelId != null) {
        target = client._channel(data.channelId);
      } else {
        target = client;
      }

      if (data.event) {
        target._dispatchEvent(data.event, data.value);
      } else if (data.prop) {
        target._setProp(data.prop, data.value);
      }
    } else if (data.voiceId != null) {
      let stream = this._voiceStreams[data.voiceId];
      let buffer = data.buffer;
      if (buffer) {
        stream.write({
          target: data.target,
          buffer: Buffer.from(buffer),
        });
      } else {
        delete this._voiceStreams[data.voiceId];
        stream.end();
      }
    }
  }
}

export class WorkerBasedMumbleClient extends EventEmitter {
  constructor(connector, clientId) {
    super();
    this._connector = connector;
    this._id = clientId;
    this._users = {};
    this._channels = {};

    let id = { client: clientId };
    connector._addCall(this, "setSelfDeaf", id);
    connector._addCall(this, "setSelfMute", id);
    connector._addCall(this, "setSelfTexture", id);
    connector._addCall(this, "setAudioQuality", id);
    connector._addCall(this, "_send", id);

    connector._addCall(this, "disconnect", id);
    let _disconnect = this.disconnect;
    this.disconnect = () => {
      _disconnect.apply(this);
      delete connector._clients[id];
    };

    connector._addCall(this, "createVoiceStream", id);
    let _createVoiceStream = this.createVoiceStream;
    this.createVoiceStream = function () {
      let voiceId = connector._nextVoiceId++;

      let args = Array.from(arguments);
      args.unshift(voiceId);
      _createVoiceStream.apply(this, args);

      return new Writable({
        write(chunk, encoding, callback) {
          chunk = toArrayBuffer(chunk);
          connector._postMessage({
            voiceId: voiceId,
            chunk: chunk,
          });
          callback();
        },
        final(callback) {
          connector._postMessage({
            voiceId: voiceId,
          });
          callback();
        },
      });
    };

    // Dummy client used for bandwidth calculations
    this._dummyClient = new MumbleClient({ username: "dummy" });
    let defineDummyMethod = (name) => {
      this[name] = function () {
        return this._dummyClient[name].apply(this._dummyClient, arguments);
      };
    };
    defineDummyMethod("getMaxBitrate");
    defineDummyMethod("getActualBitrate");
    let _setAudioQuality = this.setAudioQuality;
    this.setAudioQuality = function () {
      this._dummyClient.setAudioQuality.apply(this._dummyClient, arguments);
      _setAudioQuality.apply(this, arguments);
    };
  }

  _user(id) {
    let user = this._users[id];
    if (!user) {
      user = new WorkerBasedMumbleUser(this._connector, this, id);
      this._users[id] = user;
    }
    return user;
  }

  _channel(id) {
    let channel = this._channels[id];
    if (!channel) {
      channel = new WorkerBasedMumbleChannel(this._connector, this, id);
      this._channels[id] = channel;
    }
    return channel;
  }

  _dispatchEvent(name, args) {
    if (name === "newChannel") {
      args[0] = this._channel(args[0]);
    } else if (name === "newUser") {
      args[0] = this._user(args[0]);
    } else if (name === "message") {
      args[0] = this._user(args[0]);
      args[2] = args[2].map((id) => this._user(id));
      args[3] = args[3].map((id) => this._channel(id));
      args[4] = args[4].map((id) => this._channel(id));
    }
    args.unshift(name);
    this.emit.apply(this, args);
  }

  _setProp(name, value) {
    if (name === "root") {
      name = "_rootId";
    }
    if (name === "self") {
      name = "_selfId";
    }
    if (name === "maxBandwidth") {
      this._dummyClient.maxBandwidth = value;
    }
    this[name] = value;
  }

  get root() {
    return this._channel(this._rootId);
  }

  get channels() {
    return Object.values(this._channels);
  }

  get users() {
    return Object.values(this._users);
  }

  get self() {
    return this._user(this._selfId);
  }
}

class WorkerBasedMumbleChannel extends EventEmitter {
  constructor(connector, client, channelId) {
    super();
    this._connector = connector;
    this._client = client;
    this._id = channelId;

    let id = { client: client._id, channel: channelId };
    connector._addCall(this, "sendMessage", id);
  }

  _dispatchEvent(name, args) {
    if (name === "update") {
      let [props] = args;
      Object.entries(props).forEach((entry) => {
        this._setProp(entry[0], entry[1]);
      });
      if (props.parent != null) {
        props.parent = this.parent;
      }
      if (props.links != null) {
        props.links = this.links;
      }
      args = [props];
    } else if (name === "remove") {
      delete this._client._channels[this._id];
    }
    args.unshift(name);
    this.emit.apply(this, args);
  }

  _setProp(name, value) {
    if (name === "parent") {
      name = "_parentId";
    }
    if (name === "links") {
      value = value.map((id) => this._client._channel(id));
    }
    this[name] = value;
  }

  get parent() {
    if (this._parentId != null) {
      return this._client._channel(this._parentId);
    }
  }

  get children() {
    return Object.values(this._client._channels).filter(
      (it) => it.parent === this
    );
  }
}

class WorkerBasedMumbleUser extends EventEmitter {
  constructor(connector, client, userId) {
    super();
    this._connector = connector;
    this._client = client;
    this._id = userId;

    let id = { client: client._id, user: userId };
    connector._addCall(this, "requestTexture", id);
    connector._addCall(this, "clearTexture", id);
    connector._addCall(this, "setMute", id);
    connector._addCall(this, "setDeaf", id);
    connector._addCall(this, "sendMessage", id);
    this.setChannel = (channel) => {
      connector._call(id, "setChannel", channel._id);
    };
  }

  _dispatchEvent(name, args) {
    if (name === "update") {
      let [actor, props] = args;
      Object.entries(props).forEach((entry) => {
        this._setProp(entry[0], entry[1]);
      });
      if (props.channel != null) {
        props.channel = this.channel;
      }
      if (props.texture != null) {
        props.texture = this.texture;
      }
      args = [this._client._user(actor), props];
    } else if (name === "voice") {
      let [id, target] = args;
      let stream = new PassThrough({
        objectMode: true,
      });
      this._connector._voiceStreams[id] = stream;
      stream.target = target;
      args = [stream];
    } else if (name === "remove") {
      delete this._client._users[this._id];
    }
    args.unshift(name);
    this.emit.apply(this, args);
  }

  _setProp(name, value) {
    if (name === "channel") {
      name = "_channelId";
    }
    if (name === "texture") {
      if (value) {
        let buf = ByteBuffer.wrap(value.buffer);
        buf.offset = value.offset;
        buf.limit = value.limit;
        value = buf;
      }
    }
    this[name] = value;
  }

  get channel() {
    return this._client._channels[this._channelId];
  }
}
export default WorkerBasedMumbleConnector;
