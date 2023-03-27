export function audioBufferToWav(buffer, meta, sampleRate, bitDepth, masterNumChannels) {
  let numChannels = buffer.numberOfChannels;
  let format = meta?.float32 ? 3 : 1;

  let result;
  if (meta.channel && masterNumChannels === 1) {
    numChannels = 1;
    if (meta.channel === 'L') { result = buffer.getChannelData(0); }
    if (meta.channel === 'R') { result = buffer.getChannelData(1); }
    if (meta.channel === 'S') {
      result = new Float32Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        result[i] = (buffer.getChannelData(0)[i] + buffer.getChannelData(1)[i]) / 2;
      }
    }
  } else {
    if (numChannels === 2) {
      result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }
  }
  return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}

DataView.prototype.setInt24 = function(pos, val, littleEndian) {
  this.setInt8(pos, val & ~4294967040, littleEndian);
  this.setInt16(pos + 1, val >> 8, littleEndian);
}

export function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
  var bytesPerSample = bitDepth / 8;
  var blockAlign = numChannels * bytesPerSample;

  var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  var view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true);
  if (bitDepth === 16) { // Raw PCM
    floatTo16BitPCM(view, 44, samples);
  } else if (bitDepth === 24) {
    floatTo24BitPCM(view, 44, samples);
  } else {
    writeFloat32(view, 44, samples);
  }
  return buffer;
}

function interleave(inputL, inputR) {
  var length = inputL.length + inputR.length;
  var result = new Float32Array(length);

  var index = 0;
  var inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeFloat32(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}

function floatTo16BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function floatTo24BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 3) {
    var s = Math.floor(input[i] * 8388608 + 0.5);
    output.setInt24(offset, s, true);
  }
}

function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
export function Resampler(fromSampleRate, toSampleRate, channels, inputBuffer) {
  //JavaScript Audio Resampler
  //Copyright (C) 2011-2015 Grant Galitz
  //Released to Public Domain https://raw.githubusercontent.com/taisel/XAudioJS/master/resampler.js
  //Input Sample Rate:
  this.fromSampleRate = +fromSampleRate;
  //Output Sample Rate:
  this.toSampleRate = +toSampleRate;
  //Number of channels:
  this.channels = channels | 0;
  //Type checking the input buffer:
  if (typeof inputBuffer != "object") {
    throw(new Error("inputBuffer is not an object."));
  }
  if (!(inputBuffer instanceof Array) && !(inputBuffer instanceof Float32Array) && !(inputBuffer instanceof Float64Array)) {
    throw(new Error("inputBuffer is not an array or a float32 or a float64 array."));
  }
  this.inputBuffer = inputBuffer;
  //Initialize the resampler:
  this.initialize();
}
Resampler.prototype.initialize = function () {
  //Perform some checks:
  if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
    if (this.fromSampleRate == this.toSampleRate) {
      //Setup a resampler bypass:
      this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
      this.ratioWeight = 1;
      this.outputBuffer = this.inputBuffer;
    }
    else {
      this.ratioWeight = this.fromSampleRate / this.toSampleRate;
      if (this.fromSampleRate < this.toSampleRate) {
        /*
          Use generic linear interpolation if upsampling,
          as linear interpolation produces a gradient that we want
          and works fine with two input sample points per output in this case.
        */
        this.compileLinearInterpolationFunction();
        this.lastWeight = 1;
      }
      else {
        /*
          Custom resampler I wrote that doesn't skip samples
          like standard linear interpolation in high downsampling.
          This is more accurate than linear interpolation on downsampling.
        */
        this.compileMultiTapFunction();
        this.tailExists = false;
        this.lastWeight = 0;
      }
      this.initializeBuffers();
    }
  }
  else {
    throw(new Error("Invalid settings specified for the resampler."));
  }
}
Resampler.prototype.compileLinearInterpolationFunction = function () {
  var toCompile = "var outputOffset = 0;\
    if (bufferLength > 0) {\
        var buffer = this.inputBuffer;\
        var weight = this.lastWeight;\
        var firstWeight = 0;\
        var secondWeight = 0;\
        var sourceOffset = 0;\
        var outputOffset = 0;\
        var outputBuffer = this.outputBuffer;\
        for (; weight < 1; weight += " + this.ratioWeight + ") {\
            secondWeight = weight % 1;\
            firstWeight = 1 - secondWeight;";
  for (var channel = 0; channel < this.channels; ++channel) {
    toCompile += "outputBuffer[outputOffset++] = (this.lastOutput[" + channel + "] * firstWeight) + (buffer[" + channel + "] * secondWeight);";
  }
  toCompile += "}\
        weight -= 1;\
        for (bufferLength -= " + this.channels + ", sourceOffset = Math.floor(weight) * " + this.channels + "; sourceOffset < bufferLength;) {\
            secondWeight = weight % 1;\
            firstWeight = 1 - secondWeight;";
  for (var channel = 0; channel < this.channels; ++channel) {
    toCompile += "outputBuffer[outputOffset++] = (buffer[sourceOffset" + ((channel > 0) ? (" + " + channel) : "") + "] * firstWeight) + (buffer[sourceOffset + " + (this.channels + channel) + "] * secondWeight);";
  }
  toCompile += "weight += " + this.ratioWeight + ";\
            sourceOffset = Math.floor(weight) * " + this.channels + ";\
        }";
  for (var channel = 0; channel < this.channels; ++channel) {
    toCompile += "this.lastOutput[" + channel + "] = buffer[sourceOffset++];";
  }
  toCompile += "this.lastWeight = weight % 1;\
    }\
    return outputOffset;";
  this.resampler = Function("bufferLength", toCompile);
}
Resampler.prototype.compileMultiTapFunction = function () {
  var toCompile = "var outputOffset = 0;\
    if (bufferLength > 0) {\
        var buffer = this.inputBuffer;\
        var weight = 0;";
  for (var channel = 0; channel < this.channels; ++channel) {
    toCompile += "var output" + channel + " = 0;"
  }
  toCompile += "var actualPosition = 0;\
        var amountToNext = 0;\
        var alreadyProcessedTail = !this.tailExists;\
        this.tailExists = false;\
        var outputBuffer = this.outputBuffer;\
        var currentPosition = 0;\
        do {\
            if (alreadyProcessedTail) {\
                weight = " + this.ratioWeight + ";";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "output" + channel + " = 0;"
  }
  toCompile += "}\
            else {\
                weight = this.lastWeight;";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "output" + channel + " = this.lastOutput[" + channel + "];"
  }
  toCompile += "alreadyProcessedTail = true;\
            }\
            while (weight > 0 && actualPosition < bufferLength) {\
                amountToNext = 1 + actualPosition - currentPosition;\
                if (weight >= amountToNext) {";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "output" + channel + " += buffer[actualPosition++] * amountToNext;"
  }
  toCompile += "currentPosition = actualPosition;\
                    weight -= amountToNext;\
                }\
                else {";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "output" + channel + " += buffer[actualPosition" + ((channel > 0) ? (" + " + channel) : "") + "] * weight;"
  }
  toCompile += "currentPosition += weight;\
                    weight = 0;\
                    break;\
                }\
            }\
            if (weight <= 0) {";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "outputBuffer[outputOffset++] = output" + channel + " / " + this.ratioWeight + ";"
  }
  toCompile += "}\
            else {\
                this.lastWeight = weight;";
  for (channel = 0; channel < this.channels; ++channel) {
    toCompile += "this.lastOutput[" + channel + "] = output" + channel + ";"
  }
  toCompile += "this.tailExists = true;\
                break;\
            }\
        } while (actualPosition < bufferLength);\
    }\
    return outputOffset;";
  this.resampler = Function("bufferLength", toCompile);
}
Resampler.prototype.bypassResampler = function (upTo) {
  return upTo;
}
Resampler.prototype.initializeBuffers = function () {
  //Initialize the internal buffer:
  var outputBufferSize = (Math.ceil(this.inputBuffer.length * this.toSampleRate / this.fromSampleRate / this.channels * 1.000000476837158203125) * this.channels) + this.channels;
  try {
    this.outputBuffer = new Float32Array(outputBufferSize);
    this.lastOutput = new Float32Array(this.channels);
  }
  catch (error) {
    this.outputBuffer = [];
    this.lastOutput = [];
  }
}

CanvasRenderingContext2D.prototype.clear =
    CanvasRenderingContext2D.prototype.clear || function (preserveTransform) {
      if (preserveTransform) {
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
      }

      this.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.beginPath();

      if (preserveTransform) {
        this.restore();
      }
    };
/*Resources used:
  https://github.com/Jam3/audiobuffer-to-wav
  https://github.com/eh2k/uwedit/blob/master/core/MidiSDS.cpp
  https://css-tricks.com/making-an-audio-waveform-visualizer-with-vanilla-javascript/
*/
