//JavaScript Audio Resampler
//Copyright (C) 2011-2015 Grant Galitz
//Released to Public Domain https://raw.githubusercontent.com/taisel/XAudioJS/master/resampler.js
function Resampler(fromSampleRate, toSampleRate, channels, inputBuffer) {
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


const uploadInput = document.getElementById('uploadInput');
const masterSR = 48000;
const audioCtx = new AudioContext({sampleRate: masterSR});
let files = [];
let unsorted = [];
let lastSort = '';
let sliceGrid = 0;
let shiftKeyDown = false;

const getFileById = (id) => {
  return files.find(f => f.meta.id === id);
};
const getFileIndexById = (id) => {
  return files.findIndex(f => f.meta.id === id);
};
const getRowElementById = (id) => {
  return document.querySelector(`tr[data-id="${id}"]`);
};
function setWavLink(file, linkEl) {

  const wav = audioBufferToWav(file.buffer, file.meta);
  const blob = new window.Blob([new DataView(wav)], {
    type: 'audio/wav',
  });

  linkEl.href = URL.createObjectURL(blob);
  linkEl.setAttribute('download', file.file.name.replace('.syx', '.wav'));
}

function downloadAll() {
  files.filter(f => f.meta.checked).forEach(file => {
    setTimeout(
        () => downloadFile(file.meta.id), 100
    )
  });
}

function downloadFile(id) {
  const el = getRowElementById(id).querySelector('.wav-link-hidden');
  const file = getFileById(id);
  setWavLink(file, el);
  el.click();
}

function removeSelected() {
  files = files.filter(f => !f.meta.checked);
  unsorted = unsorted.filter(id => files.find(f => f.meta.id === id));
  renderList();
}

function showInfo() {
  const name = document.querySelector('meta[name=author]').content;
  const description = document.querySelector('meta[name=description]').content;
  const infoPanelContent = document.querySelector('.info-panel-md .content');
  infoPanelContent.innerHTML = `<h3>DigiChain</h3><p>${description}</p><p class="float-right">${name}</p>`;
  document.querySelector('.info-panel-md').style.display = 'block';
}

function joinAll(pad = false) {
  const _files = files.filter(f => f.meta.checked);
  if (pad && sliceGrid !== 0 && _files.length < sliceGrid) {
    while (_files.length !== sliceGrid) {
      _files.push(_files[_files.length - 1]);
    }
  }
  const largest = _files.reduce((big, cur) => big > cur.buffer.length ? big : cur.buffer.length, 0);
  const totalLength = _files.reduce((total, file) => {
    total +=  pad ? largest : file.buffer.length;
    return total;
  }, 0);
  const audioArrayBuffer = audioCtx.createBuffer(
      1,
      totalLength,
      masterSR
  );
  let totalWrite = 0;
  _files.forEach((file, idx) => {
    const bufferLength = pad ? largest : file.buffer.length;
    let result = new Float32Array(file.buffer.length);

    if (file.meta.channel) {
      if (file.meta.channel === 'L') { result = file.buffer.getChannelData(0); }
      if (file.meta.channel === 'R') { result = file.buffer.getChannelData(1); }
      if (file.meta.channel === 'S') {
        for (let i = 0; i < file.buffer.length; i++) {
          result[i] = (file.buffer.getChannelData(0)[i] + file.buffer.getChannelData(1)[i]) / 2;
        }
      }
    } else {
      result = file.buffer.getChannelData(0);
    }

    for (let i = 0; i < bufferLength; i++) {
      audioArrayBuffer.getChannelData(0)[totalWrite] = result[i];
      totalWrite++;
    }
  });
  const joinedEl = document.getElementById('getJoined');
  setWavLink({file: {name: 'joined.wav'}, buffer: audioArrayBuffer, meta: {}}, joinedEl);
  joinedEl.click();
}

const playFile = (id) => {
  const source = audioCtx.createBufferSource();
  const file = getFileById(id);
  source.buffer = file.buffer;
  source.connect(audioCtx.destination);
  source.start();
};

const toggleCheck = (id) => {
  const el = getRowElementById(id).querySelector('.toggle-check');
  const file = getFileById(id);
  file.meta.checked = !file.meta.checked;
  file.meta.checked ? el.classList.remove('button-outline') : el.classList.add('button-outline');
  document.getElementById('fileNum').textContent = `${files.length}/${files.filter(f => f.meta.checked).length}`;
};

const changeChannel = (id, channel) => {
  const el = getRowElementById(id).querySelector('.channel-option-' + channel);
  const file = getFileById(id);
  file.meta.channel = channel;
  getRowElementById(id).querySelectorAll('.channel-options a').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
};

const selectSliceAmount = (size) => {
  const options = [0, 4, 8, 16, 32, 64];
  sliceGrid = size;
  options.forEach(option => {
    const el = document.querySelector(`.sel-${option}`);
    option === size ?
        el.classList.remove('button-outline') :
        el.classList.add('button-outline');
  });
  files.forEach(f => f.meta.checked = false);
  for (let i = 0; i < (size < files.length ? size : files.length) ; i++) {
    toggleCheck(files[i].meta.id);
  }
  renderList();
}

const duplicate = (id) => {
  const file = getFileById(id);
  const fileIdx = getFileIndexById(id);
  const item = Object.assign({}, file);
  item.meta = Object.assign({}, file.meta);
  item.meta.dupeOf = id;
  item.waveform = false;
  item.meta.id = crypto.randomUUID();
  files.splice((shiftKeyDown ? files.length : fileIdx + 1), 0, item);
  unsorted.push(item.meta.id);
  renderList();
};

const remove = (id) => {
  const fileIdx = getFileIndexById(id);
  files.splice(fileIdx, 1);
  const unsortIdx = unsorted.findIndex(uuid => uuid === id);
  unsorted.splice(unsortIdx, 1);
  renderList();
}

const move = (id, direction) => {
  const from = getFileIndexById(id);
  const to = direction === 1 ? (from + 1) : (from - 1);
  const item = files.splice(from, 1)[0];
  if (shiftKeyDown) { /*If shift key, move to top or bottom of list.*/
    from > to ? files.splice(0, 0, item): files.splice(files.length, 0, item);
  } else {
    files.splice(to, 0, item);
  }
  renderList();
};
const sort = (by) => {
  if (by === 'id') {
    files = unsorted.map(key => files.find(f => f.meta.id === key));
    lastSort = '';
  } else {
    if (lastSort === by) {
      files.reverse();
    } else {
      files = by === 'name' ?
          files.sort((a, b) => a.file[by].localeCompare(b.file[by])) :
          files.sort((a, b) => a.meta[by].localeCompare(b.meta[by]));
      lastSort = by;
    }
  }
  renderList();
};

const draw = (normalizedData, id) => {
  const drawLineSegment = (ctx, x, height, width, isEven) => {
    ctx.lineWidth = 1; // how thick the line is
    ctx.strokeStyle = '#a8a8a8'; // what color our line is
    ctx.beginPath();
    height = isEven ? height : -height;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.arc(x + width / 2, height, width / 2, Math.PI, 0, isEven);
    ctx.lineTo(x + width, 0);
    ctx.stroke();
  };
  // set up the canvas
  const canvas = document.querySelector('canvas.waveform-'+id);
  const dpr = window.devicePixelRatio || 1;
  const padding = 0;
  canvas.width = 150; //canvas.offsetWidth * dpr;
  canvas.height = 60;// (canvas.offsetHeight + padding * 2) * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(0, canvas.offsetHeight / 2 + padding); // set Y = 0 to be in the middle of the canvas

  // draw the line segments
  const width = canvas.offsetWidth / normalizedData.length;
  for (let i = 0; i < normalizedData.length; i++) {
    const x = width * i;
    let height = (normalizedData[i] / 3) * canvas.offsetHeight - padding;
    if (height < 0) {
      height = 0;
    } else if (height > canvas.offsetHeight / 2) {
      height = height > canvas.offsetHeight / 2;
    }
    drawLineSegment(ctx, x, height, width, (i + 1) % 2);
  }
};

const renderList = () => {
  const listEl = document.getElementById('fileList');
  listEl.innerHTML = files.map( f => `
      <tr data-id="${f.meta.id}">
        <td>
            <button onclick="toggleCheck('${f.meta.id}')" class="${f.meta.checked ? '' : 'button-outline'} check toggle-check">&nbsp;</button>
        </td>
        <td>
            <button title="Move up in sample list." onclick="move('${f.meta.id}', -1)" class="button-clear move-up"><i class="gg-chevron-up-r"></i></button>
        </td>
        <td>
            <button title="Move down in sample list." onclick="move('${f.meta.id}', 1)" class="button-clear move-down"><i class="gg-chevron-down-r"></i></button>
        </td>
        <td>
            <canvas onclick="playFile('${f.meta.id}')" class="waveform waveform-${f.meta.id}"></canvas>
        </td>
        <td>
            <a title="Download processed wav file of sample." class="wav-link" onclick="downloadFile('${f.meta.id}')">${f.file.name.replace(
      /\.syx$|\.wav$/, '')}</a>${f.meta.dupeOf ? ' d' : ''}<a class="wav-link-hidden"></a>
        </td>
        <td>
            <span>${f.meta.duration} s</span>
        </td>
        <td>
            <div class="channel-options" style="display: ${f.buffer.numberOfChannels > 1 ? 'block' : 'none'}">
            <a title="Left channel" onclick="changeChannel('${f.meta.id}', 'L')" class="${f.meta.channel === 'L' ? 'selected' : ''} channel-option-L">L</a>
            <a title="Sum to mono" onclick="changeChannel('${f.meta.id}', 'S')" class="${f.meta.channel === 'S' ? 'selected' : ''} channel-option-S">S</a>
            <a title="Right channel" onclick="changeChannel('${f.meta.id}', 'R')" class="${f.meta.channel === 'R' ? 'selected' : ''} channel-option-R">R</a>
            </div>
        </td>
        <td>
            <button title="Duplicate sample." onclick="duplicate('${f.meta.id}')" class="button-clear duplicate"><i class="gg-duplicate"></i></button>
        </td>
        <td>
            <button title="Remove sample (double-click)." ondblclick="remove('${f.meta.id}')" class="button-clear remove"><i class="gg-trash"></i></button>
        </td>
      </tr>
    `).join('');
  if (files.length === 0) {
    listEl.innerHTML = `<tr><td colspan="6" style="text-align: center;padding: 5rem; opacity: .25;"><h4>Load some samples to get started...</h4></td></tr>`;
  }

  document.querySelectorAll('.waveform').forEach((el, i) => {
    if (files[i].waveform) {
      el.replaceWith(files[i].waveform);
    } else {
      draw([...files[i].buffer.getChannelData(0)].filter((x, i) => !(i /50 % 1)), files[i].meta.id);
      files[i].waveform = el;
    }
  });
  document.getElementById('fileNum').textContent = `${files.length}/${files.filter(f => f.meta.checked).length}`;
};
const bytesToInt = (bh, bm, bl) => {
  return ((bh & 0x7f) << 7 << 7) + ((bm & 0x7f) << 7) + (bl & 0x7f);
};
const parseSds = (fd, file) => {
  // Check header is correct.
  if (!(fd[0] === 240 && fd[1] === 126 && fd[3] === 1 && fd[20] === 247)) {
    return false;
  }
  const uuid = crypto.randomUUID();
  const bitRate = fd[6];
  const sampleRate = Math.ceil(10e7 / bytesToInt(fd[9], fd[8], fd[7])) * 10;
  const length = bytesToInt(fd[12], fd[11], fd[10]);
  let loopStart = bytesToInt(fd[15], fd[14], fd[13]);
  let loopEnd = bytesToInt(fd[18], fd[17], fd[16]) + 1;
  const loopType = fd[19];

  if (loopType === 0x7f) { loopStart = loopEnd = length; }
  if (sampleRate < 4000 || sampleRate > 96000) { return false; }
  if (bitRate !== 16) { return false; }

  const startIndex = fd.findIndex(
      (x, i) => (x === 0xf0 && fd[i + 1] === 0x7e && fd[i + 3] === 0x02 && fd[i + 126] === 0xf7));

  let idx = startIndex;
  let lengthRead = 0;
  let data = [];

  while (lengthRead < length) {
    for (let t = (idx + 5); t < (idx + 125) && lengthRead < length; t += 3) {
      let val = (((fd[t] << 9) | (fd[t + 1] << 2) | (fd[t + 2] >> 5)) - 0x8000);
      data[lengthRead++] = val;
    }
    idx = idx + 127;
  }

  const resample = new Resampler(sampleRate, masterSR, 1, data.filter(x => x !== undefined));
  resample.resampler(resample.inputBuffer.length);
  const audioArrayBuffer = audioCtx.createBuffer(
      1,
      resample.outputBuffer.length - ((resample.outputBuffer.length / 120) * 5),
      masterSR
  );
  resample.outputBuffer.filter(x => x !== undefined).forEach((y, i) => audioArrayBuffer.getChannelData(0)[i] = y / 32767);

  files.push({
    file: file, buffer: audioArrayBuffer, meta: {
      bitRate, masterSR, length: resample.outputBuffer.length, loopStart, loopEnd, loopType,
      duration: Number(resample.outputBuffer.length / masterSR).toFixed(4),
      checked: true, id: uuid
    }
  });
  unsorted.push(uuid);
  return uuid;
};

const parseWav = (audioArrayBuffer, file) => {
  const uuid = crypto.randomUUID();
  /*duration, length, numberOfChannels, sampleRate*/
  files.push({
    file: file, buffer: audioArrayBuffer, meta: {
      masterSR, length: audioArrayBuffer.length,
      duration: Number(audioArrayBuffer.length / masterSR).toFixed(4),
      checked: true, id: uuid,
      channel: 'L'
    }
  });
  unsorted.push(uuid);
  return uuid;
};

const renderListWhenReady = (count) => {
  count = count.filter(c => c !== false);
  if (count.every(c => unsorted.includes(c))) {
    renderList();
  } else {
    setTimeout(() => renderListWhenReady(count), 1000);
  }
}

uploadInput.addEventListener(
    'change',
    () => {
      // Calculate total size
      let numberOfBytes = 0;
      let count = [];
      [...uploadInput.files].forEach((file, idx) => {
        numberOfBytes += file.size;
        var reader = new FileReader();
        reader.onload = async function(e) {
          if (file.name.toLowerCase().endsWith('.syx')) {
            // binary data
            const buffer = e.target.result;
            const bufferByteLength = buffer.byteLength;
            const bufferUint8Array = new Uint8Array(buffer, 0, bufferByteLength);
            count.push(parseSds(bufferUint8Array, file));
          }

          if (file.name.toLowerCase().endsWith('.wav')) {
            await audioCtx.decodeAudioData(e.target.result, data => count.push(parseWav(data, file)));
          }
          document.getElementById('fileNum').textContent = `${files.length}/${files.length}`;
        };
        reader.readAsArrayBuffer(file);
      });
      setTimeout(() => renderListWhenReady(count), 500);
    },
    false,
);

addEventListener('click', (event) => {
  shiftKeyDown = event.shiftKey;
});

/*---*/

function audioBufferToWav(buffer, meta) {
  const sampleRate = masterSR;
  const format = meta.float32 ? 3 : 1;
  const bitDepth = (meta.format || meta.bitRate) === 3 ? 32 : 16;
  let numChannels = buffer.numberOfChannels;

  let result;
  if (meta.channel) {
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

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
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
  if (format === 1) { // Raw PCM
    floatTo16BitPCM(view, 44, samples);
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

function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/*Resources used:
  https://github.com/Jam3/audiobuffer-to-wav
  https://github.com/eh2k/uwedit/blob/master/core/MidiSDS.cpp
  https://css-tricks.com/making-an-audio-waveform-visualizer-with-vanilla-javascript/
*/
