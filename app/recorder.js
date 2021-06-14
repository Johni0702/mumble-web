class RecorderWorkletProcessor extends AudioWorkletProcessor {
	process(inputs, outputs, parameters) {
		if (this._number === undefined) {
			this._number = 1
		}

		const timestamp = Date.now()
		const buffer = new Uint8Array(inputs[0][0].buffer)
		this.port.postMessage({ eventType: 'data', audioBuffer: buffer, timestamp: timestamp, number: this._number })
		this._number++

		return true
	}
}

registerProcessor('recorder-worklet', RecorderWorkletProcessor)
