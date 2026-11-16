// Measures the microphone level on the audio thread and reports it about
// every 10 ms. The engine also uses these reports as its clock for opening
// and closing the mic, because ordinary timers are slowed down when the
// window is in the background behind a game.

class Meter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sum = 0;
    this.count = 0;
    // 128-frame blocks: this many make roughly 10 ms.
    this.every = Math.max(1, Math.round((sampleRate * 0.01) / 128));
    this.blocks = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) this.sum += ch[i] * ch[i];
      this.count += ch.length;
    }
    if (++this.blocks >= this.every) {
      const rms = this.count ? Math.sqrt(this.sum / this.count) : 0;
      this.port.postMessage(rms > 0 ? 20 * Math.log10(rms) : -100);
      this.sum = 0;
      this.count = 0;
      this.blocks = 0;
    }
    return true;
  }
}
registerProcessor("meter", Meter);
