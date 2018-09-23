// Handle messages coming from [Matrix] client if embedded as a [Widget] in some room.
// [Matrix]: https://matrix.org/
// [Widget]: https://docs.google.com/document/d/1uPF7XWY_dXTKVKV7jZQ2KmsI19wn9-kFRgQ1tFQP7wQ/edit

class MatrixWidget {
  constructor () {
    this.widgetId = null
    window.addEventListener('message', this.onMessage.bind(this))
  }

  onMessage (event) {
    this.widgetId = this.widgetId || event.data.widgetId

    switch (event.data.api) {
      case 'fromWidget':
        break
      case 'toWidget':
        switch (event.data.action) {
          case 'capabilities':
            this.sendResponse(event, {
              capabilities: ['m.always_on_screen']
            })
            break
        }
        break
      default:
        break
    }
  }

  sendContentLoaded () {
    this.sendMessage({
      action: 'content_loaded'
    })
  }

  setAlwaysOnScreen (value) {
    // Extension of main spec, see https://github.com/matrix-org/matrix-doc/issues/1354
    this.sendMessage({
      action: 'set_always_on_screen',
      value: value, // once for spec compliance
      data: { value: value } // and once for Riot
    })
  }

  sendMessage (message) {
    if (!this.widgetId) return
    message.api = message.api || 'fromWidget'
    message.widgetId = message.widgetId || this.widgetId
    message.requestId = message.requestId || Math.random().toString(36)
    window.parent.postMessage(message, '*')
  }

  sendResponse (event, response) {
    event.data.response = response
    event.source.postMessage(event.data, event.origin)
  }
}

window.matrixWidget = new MatrixWidget()
