import {audioBufferToWav} from './resources.js';

const editPanelEl = document.getElementById('editPanel');
const editableItemsEl = document.getElementById('editableItems');
const editEl = document.getElementById('editorPanelContent');
let editing;
let conf; // {audioCtx, masterSR, masterChannels, masterBitDepth}
let multiplier = 1;
let selection = {
  start: 0,
  end: 0,
  step: 0
};

export function setEditorConf(options) {
  conf = options;
}
export function showEditor(item, options, sliceEditor = false) {
  conf = options;
  editing = item;
  multiplier = 1;
  selection.end = item.buffer.length;
  selection.start = 0;
  selection.step = Math.round(item.buffer.length / (1024 * multiplier));
  renderEditableItems();
  renderEditor(editing);
  updateSelectionEl();
  editPanelEl.classList.add('show');
  renderEditPanelWaveform();
}
export function renderEditor(item) {
  editing = item === editing ? editing : item;
  editEl.innerHTML = `
  <button onclick="digichain.playFile(event);" class="button-outline check">Play</button>
  <button onclick="digichain.stopPlayFile(event);" class="button-outline check">Stop</button>
  <div class="zoom-level float-right">
    <button class="zoom-1x button-outline check" onclick="digichain.editor.zoomLevel('editor', 1)">1x</button>
    <button class="zoom-2x button-outline check" onclick="digichain.editor.zoomLevel('editor', 2)">2x</button>
    <button class="zoom-4x button-outline check" onclick="digichain.editor.zoomLevel('editor', 4)">4x</button>
  </div>
  <div class="waveform-container">
    <div>
      <canvas class="edit-panel-waveform"
        oncontextmenu="return false;"
        onclick="digichain.editor.changeSelectionPoint(event)"
        onauxclick="digichain.editor.changeSelectionPoint(event, true)"></canvas>
      <div id="editLines">
        <div class="line"></div>
      </div>
    </div>
  </div>
  <div class="sample-op-buttons">
  <button title="Normalize the volume of the sample." class="normalize button-outline" onclick="digichain.editor.normalize(event)">Normalize</button>
  <button title="Reverses the sample playback" class="reverse button-outline" onclick="digichain.editor.reverse(event)">Reverse</button>&nbsp;&nbsp;-&nbsp;
  <button title="Trims any zero valued audio from the end of the sample." class="trim-right button-outline" onclick="digichain.editor.trimRight(event)">Trim Right</button>
  <button title="Half the speed of the sample" class="pitch button-outline" onclick="digichain.editor.perSamplePitch(event, .5)">Half-speed</button>
  <button title="Double the speed of the sample" class="pitch button-outline" onclick="digichain.editor.perSamplePitch(event, 2)">Double-speed</button>
  </div>
  <span>
    Normalize & Reverse affect the selected part of the sample, Trim Right, Half-speed, Double-speed affect the whole sample.<br>
    Note: sample operations are destructive, applied immediately, no undo.
  </span>
<!--  <button onclick="digichain.editWaveformAction(event, false, true)" class="float-right button-outline has-shift-mod" style="margin-top: 1rem;">Add to samples</button>-->
  `;


}

function renderEditableItems() {
  editableItemsEl.innerHTML = `
      <div class="input-set">
      <label for="editFileName" class="before-input">File Name</label>
      <input type="text" onblur="digichain.editor.updateFile(event)" placeholder="Sample file name" id="editFileName" value="${getNiceFileName('', editing, true)}" readonly>
      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFileName')"><i class="gg-pen"></i></button>
    </div><br>
    <div class="input-set">
    <label for="editFilePath" class="before-input">File Path</label>
      <input type="text" onblur="digichain.editor.updateFile(event)" placeholder="File path of the sample (if known)" id="editFilePath" value="${editing.file.path}" id="editFilePath" readonly>
      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFilePath')"><i class="gg-pen"></i></button>
    </div>
  `;
}

function renderEditPanelWaveform(multiplier = 1) {
  const waveformWidth = 1024 * multiplier;
  const editPanelWaveformEl = document.querySelector(`.edit-panel-waveform`);
  drawWaveform(editing, editPanelWaveformEl, editing.meta.channel, {
    width: waveformWidth, height: 128, multiplier
  });
}
export function drawWaveform(file, el, channel, dimensions) {
  let drawData = [];
  let drawResolution = Math.floor(file.buffer.length / 32);
  if (conf.masterChannels === 2 && file.buffer.numberOfChannels > 1) { channel = 'S'; }
  if (file.buffer.length > 512) {
    drawResolution = (drawResolution > 4096 ? 4096: drawResolution) * (((dimensions?.multiplier || 0) * 2) || 1);
  } else {
    drawResolution = file.buffer.length;
  }
  for (let y = 0; y < file.buffer.length; y += Math.floor(file.buffer.length / drawResolution)) {
    // if (channel === 'S') {
    //   drawData.push(
    //       (file.buffer.getChannelData(0)[y] + file.buffer.getChannelData(1)[y]) / 2
    //   );
    // } else {
    //   drawData.push(file.buffer.getChannelData((channel === 'R' ? 1 : 0))[y]);
    // }
    drawData.push(
        (file.buffer.getChannelData(0)[y] + file.buffer.getChannelData(file.buffer.numberOfChannels - 1)[y]) / 2
    );
  }
  draw(drawData, file.meta.id, el, dimensions);
}

export function getNiceFileName(name, file, excludeExtension, includePath) {
  let fname = file ? `${file.file.name.replace(/\.[^.]*$/,'')}${file.meta?.dupeOf ? '-d' : ''}${file.meta?.sliceNumber ? '-s' + file.meta.sliceNumber : ''}.wav`:
      name.replace(
          /\.syx$|\.wav$/, '');
  fname = (includePath && file.file.path) ? `${file.file.path.replace(/\//gi, '-')}` + fname : fname;
  return excludeExtension ? fname.replace(/\.[^.]*$/,'') : fname;
}


function draw(normalizedData, id, canvas, dimensions) {
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
  const dpr = window.devicePixelRatio || 1;
  const padding = 0;
  canvas.width = dimensions?.width || 150; //canvas.offsetWidth * dpr;
  canvas.height = dimensions?.height || 60;// (canvas.offsetHeight + padding * 2) * dpr;
  const ctx = canvas.getContext('2d');
  //ctx.scale(dpr, dpr);
  ctx.translate(0, canvas.offsetHeight / 2 + padding); // set Y = 0 to be in the middle of the canvas

  // draw the line segments
  const width = canvas.offsetWidth / normalizedData.length;
  for (let i = 0; i < normalizedData.length; i++) {
    const x = width * i;
    let height = (normalizedData[i] / 2) * canvas.offsetHeight - padding;
    if (height < 0) {
      height = 0;
    } else if (height > canvas.offsetHeight / 2) {
      height = height > canvas.offsetHeight / 2;
    }
    drawLineSegment(ctx, x, height, width, (i + 1) % 2);
  }
}
function updateFile(event) {
  const target = event.target;
  if (!target) { return ; }
  if (target.id === 'editFileName') {
    editing.file.name = target.value;
  }
  if (target.id === 'editFilePath') {
    editing.file.path = target.value;
  }
}

function toggleReadOnlyInput(inputId) {
  const input = document.getElementById(inputId);
  input.readOnly ? input.removeAttribute('readonly') : input.setAttribute('readonly', true);
}

function getSelectionStartPoint() {
  return Math.round(selection.start / selection.step);
}

function getSelectionEndPoint() {
  const end = Math.floor((selection.end - selection.start) / selection.step);
  const max = (1024 * multiplier) - getSelectionStartPoint();
  return end > max ? max : end;
}

function updateSelectionEl() {
  const selection = document.querySelector('#editLines .line');
  const width = getSelectionEndPoint() >= (1024 * multiplier) ? (1024 * multiplier) : getSelectionEndPoint();
  selection.style.marginLeft = `${getSelectionStartPoint()}px`;
  selection.style.width = `${width}px`;

}

function zoomLevel(view, level) {
  if (view === 'editor') {
    renderEditPanelWaveform(level);
    selection.step = Math.round(editing.buffer.length / (1024 * level));
    multiplier = level;
    updateSelectionEl();
    const waveformContainerEl = document.querySelector('.waveform-container');
  }
}

function changeSelectionPoint(event, shiftKey = false) {
  event.preventDefault();
  const max =  (1024 * multiplier);
  if (event.shiftKey || shiftKey) { //set end point if shift key is down
    let end = 0;
    if (event.offsetX <= max && event.offsetX > -1) {
      end = Math.round(event.offsetX * selection.step);
    } else if (event.offsetX > max) {
      end = editing.buffer.length;
    }
    selection.end = end;
    selection.start = selection.start >= selection.end? selection.end - 1: selection.start;
  } else {
    let start = 0;
    if (event.offsetX <= max && event.offsetX > -1) {
      start = Math.round(event.offsetX * selection.step);
    } else if (event.offsetX > max) {
      start = editing.buffer.length;
    }
    selection.start = start;
    selection.end = selection.end <= selection.start? selection.start + 1 : selection.end;
  }
  selection.end = selection.end > editing.buffer.length? editing.buffer.length : selection.end;
  //selection.start = selection.start >= selection.end? selection.end - 50 : selection.start;
  updateSelectionEl();
}

function perSamplePitch(event, pitchValue, id) {
  const item = editing;

  if (item.buffer.length < 1024 && pitchValue > 1) {
    return alert('Sample too small to be pitched up further.');
  }

  const pitchedWav = audioBufferToWav(item.buffer, item.meta, (conf.masterSR * pitchValue), conf.masterBitDepth, item.buffer.numberOfChannels);
  const pitchedBlob = new window.Blob([new DataView(pitchedWav)], {
    type: 'audio/wav',
  });
  (async () => {
    let linkedFile = await fetch(URL.createObjectURL(pitchedBlob));
    let arrBuffer = await linkedFile.arrayBuffer();
    await conf.audioCtx.decodeAudioData(arrBuffer, buffer => {
      item.buffer = buffer;
      item.meta = {
        ...item.meta,
        length: buffer.length,
        duration: Number(buffer.length / conf.masterSR).toFixed(3),
        startFrame: 0, endFrame: buffer.length
      };
      renderEditPanelWaveform(multiplier);
      selection.end = Math.round(selection.end / pitchValue);
      selection.start = Math.round(selection.start / pitchValue);
      selection.step = Math.round(item.buffer.length / (1024 * multiplier));
      updateSelectionEl();
      item.waveform = false;
    });
  })();
}

function normalize(event, item, renderEditPanel = true) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  let maxSample = 0;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel);
    for (let i = selection.start; i < selection.end; i++) {
      maxSample = Math.max(Math.abs(data[i]), maxSample);
    }
  }
  maxSample = !maxSample ? 1 : maxSample;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel);
    for (let i = selection.start; i < selection.end; i++) {
      if (item.buffer.getChannelData(channel)[i] && item.buffer.getChannelData(channel)[i] / maxSample !== 0) {
        item.buffer.getChannelData(channel)[i] = item.buffer.getChannelData(channel)[i] / maxSample;
      }
    }
  }
  if (renderEditPanel) {
    renderEditPanelWaveform(multiplier);
  }
  item.waveform = false;
}

function reverse(event, item, renderEditPanel = true) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel).slice(selection.start, selection.end).reverse();
    let dataCount = 0;
    for (let i = selection.start; i < selection.end; i++) {
      item.buffer.getChannelData(channel)[i] = data[dataCount];
      dataCount++;
    }
  }
  if (renderEditPanel) {
    renderEditPanelWaveform(multiplier);
  }
  item.waveform = false;
}

function trimRight(event, item, renderEditPanel = true, ampFloor = 0.003) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  let trimIndex = [];
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    trimIndex.push(item.buffer.length);
    let data = item.buffer.getChannelData(channel);
    for (let i = item.buffer.length; i > 0; i--) {
      if (Math.abs(data[i]) > ampFloor && data[i] !== undefined && data[i] !== null) {
        trimIndex[channel] = i + 1;
        break;
      }
    }
  }
  const audioArrayBuffer = conf.audioCtx.createBuffer(
      item.buffer.numberOfChannels,
      +Math.max(...trimIndex),
      conf.masterSR
  );
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    for (let i = 0; i < audioArrayBuffer.length; i++) {
      audioArrayBuffer.getChannelData(channel)[i] = item.buffer.getChannelData(channel)[i];
    }
  }
  item.buffer = audioArrayBuffer;
  item.meta = {
    ...item.meta,
    length: audioArrayBuffer.length,
    duration: Number(audioArrayBuffer.length / conf.masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length
  };
  if (renderEditPanel) {
    renderEditPanelWaveform(multiplier);
  }
  item.waveform = false;
}
export const editor = {
  updateFile,
  toggleReadOnlyInput,
  zoomLevel,
  changeSelectionPoint,
  normalize,
  trimRight,
  perSamplePitch,
  reverse
};
