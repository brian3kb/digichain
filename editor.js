import {
  audioBufferToWav, bufferToFloat32Array,
  buildOpData,
  encodeAif,
  Resampler,
} from './resources.js';

const editPanelEl = document.getElementById('editPanel');
const editableItemsEl = document.getElementById('editableItems');
const editEl = document.getElementById('editorPanelContent');

const opExportPanelEl = document.getElementById('opExportPanel');
const opExportEl = document.getElementById('opExportPanelContent');
const rightButtonsEl = document.querySelector('.right-buttons');

const views = ['sample', 'slice', 'opExport'];

let editing;
let conf; // {audioCtx, masterSR, masterChannels, masterBitDepth}
let multiplier = 1;
let selection = {
  start: 0,
  end: 0,
  step: 0,
  selStart: true
};
let showStereoWaveform = false;

let samples = [];
let folders = [];

export function setEditorConf(options) {
  conf = options;
}
export function showEditor(data, options, view = 'sample', folderOptions = []) {
  conf = options;
  folders = folderOptions;
  if (view === 'sample') {
    if (editing && editing.meta) {
      editing.meta.editing = false;
    }
    editing = data;
    multiplier = 1;
    selection.end = editing.buffer.length;
    selection.start = 0;
    selection.step = editing.buffer.length / (1024 * multiplier);
    selection.selStart = true;
    showStereoWaveform = conf.masterChannels > 1;
    editing.meta.editing = true;
    render();
    return;
  }
  if (view === 'opExport') {
    samples = data;
    createOpData();
    renderOpExport();
    opExportPanelEl.classList.add('show');
    rightButtonsEl.classList.add('fade');
  }
}

function render() {
  renderEditableItems();
  renderEditor(editing);
  updateSelectionEl();
  if (!editPanelEl.open) { editPanelEl.showModal(); }
  renderSliceList();
  renderEditPanelWaveform();
}

function createOpData() {
  samples.json = samples.json || buildOpData([], conf.masterChannels, true);
}

function renderKey(color, index) {
  return `
    <div class="op-key ${color} key-${index}"
         ondragenter="this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="this.classList.remove('drag-over')"
         >
        <div class="left-a"
           ondragenter="this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="this.classList.remove('drag-over')"
        >L</div>     
        <div class="right-b"
           ondragenter="this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="this.classList.remove('drag-over')"
        >R</div>     
    </div>   
  `;
}

function renderOpExport() {
  const keys = {
    black: [  1,  3,  5,      8, 10,     13, 15, 17,     20, 22],
    white: [0,  2,  4,  6,  7,  9, 11, 12, 14, 16, 18, 19, 21, 23]
  };
  //    <div className="sample-list float-left">${renderOpSampleList()}</div>
  opExportEl.innerHTML = `
    <div>
    <div class="op-keys row">
            <div class="white-keys float-right">${keys.white.reduce((a, i) => a += renderKey('white', i), '')}</div>
        <div class="black-keys float-right">${keys.black.reduce((a, i) => a += renderKey('black', i), '')}</div>
    </div><br>
      <div class="op-buttons row">
        <button class="button float-right" onclick="digichain.editor.buildOpKit()">Build Kit</button>
      </div>
    </div>
  `;
}

function buildOpKit() {
  const linkEl = document.querySelector('.aif-link-hidden');
  const dataView =  encodeAif(samples[0].buffer, samples.json);
  let blob = new window.Blob([dataView], {
    type: 'audio/aiff',
  });
  linkEl.href = URL.createObjectURL(blob);
  linkEl.setAttribute('download', 'test-kit.aif');
  linkEl.click();
}

function sliceSelect(event) {
  const sliceSelectEl = document.querySelector('#sliceSelection');
  const selectionEl = document.querySelector('#editLines .edit-line');
  if (+sliceSelectEl.value === -1) {
    return resetSelectionPoints();
  }
  const slices = digichain.getSlicesFromMetaFile(editing);
  const slice = slices.at(+sliceSelectEl.value);
  selection.start = slice.s;
  selection.end = slice.e;
  updateSelectionEl();
  selectionEl.scrollIntoViewIfNeeded();
}
function sliceUpdate(event) {
  const sliceSelectEl = document.querySelector('#sliceSelection');
  if (+sliceSelectEl.value === -1) {
    return;
  }
  const slices = digichain.getSlicesFromMetaFile(editing);
  const slice = slices.at(+sliceSelectEl.value);
  slice.s = selection.start;
  slice.e = selection.end;
  slice.l = -1;
  digichain.removeMetaFile(editing.meta.id);
  editing.meta.slices = slices;
}
function sliceRemove(event) {
  const sliceSelectEl = document.querySelector('#sliceSelection');
  if (+sliceSelectEl.value === -1) {
    return;
  }
  const slices = digichain.getSlicesFromMetaFile(editing);
  editing.meta.slices = slices.filter(
      (slice, idx) => idx !== +sliceSelectEl.value
  );
  digichain.removeMetaFile(editing.meta.id);
  sliceSelectEl.value = -1;
  selection.start = 0;
  selection.end = editing.buffer.length;
  updateSelectionEl();
  renderSliceList();
}
function sliceCreate(event) {
  const slices = digichain.getSlicesFromMetaFile(editing);
  const slice = slices.push({
    n: '',
    s: selection.start,
    e: selection.end,
    l: -1
  });
  digichain.removeMetaFile(editing.meta.id);
  editing.meta.slices = slices;
  renderSliceList();
  const sliceSelectEl = document.querySelector('#sliceSelection');
  sliceSelectEl.value = slices.length > 0 ? slices.length - 1 : -1;
}

export function renderEditor(item) {
  editing = item === editing ? editing : item;
  const canvasMarkup = `
  <canvas class="edit-panel-waveform"
        oncontextmenu="return false;"
        onclick="digichain.editor.changeSelectionPoint(event)"
        ></canvas>
  `;
  editEl.innerHTML = `
<div class="slice-options input-set">
  <label for="sliceSelection" class="before-input">Slice</label>
  <select title="Choose a slice marker to edit." name="sliceSelection" id="sliceSelection" onchange="digichain.editor.sliceSelect(event);"></select>
  <button title="Update the slice marker start/end points." onclick="digichain.editor.sliceUpdate(event);" class="button-outline">Update Slice</button>
  <button title="Remove the current slice marker." onclick="digichain.editor.sliceRemove(event);" class="button-outline">Remove Slice</button>
  <button title="Add the current range as a new slice marker." onclick="digichain.editor.sliceCreate(event);" class="button-outline">New Slice</button>
</div>
<div class="above-waveform-buttons">
  <div class="sample-selection-buttons text-align-left float-left">
      <button title="Clicking on the waveform will set the selection start point." onclick="digichain.editor.setSelStart(true);" class="button check btn-select-start">Start</button>
    <button title="Clicking on the waveform will set the selection end point." onclick="digichain.editor.setSelStart(false);" class="button-outline check btn-select-end">End</button>
      <button title="Reset the waveform selection to the whole sample." onclick="digichain.editor.resetSelectionPoints();" class="button-outline check">All</button>
  </div>  
  <div class="channel-options editor-channel-options float-right" style="border: 0.1rem solid #d79c4e; display: ${editing.buffer.numberOfChannels >
  1 && conf.masterChannels === 1 ? 'inline-block' : 'none'}">
            <a title="Left channel" onclick="digichain.editor.changeChannel(event, 'L')" class="${editing.meta.channel ===
  'L' ? 'selected' : ''} channel-option-L">L</a>
            <a title="Sum to mono" onclick="digichain.editor.changeChannel(event, 'S')" class="${editing.meta.channel ===
  'S' ? 'selected' : ''} channel-option-S">S</a>
            <a title="Right channel" onclick="digichain.editor.changeChannel(event, 'R')" class="${editing.meta.channel ===
  'R' ? 'selected' : ''} channel-option-R">R</a>
            <a title="Difference between Left and Right channels" onclick="digichain.editor.changeChannel(event, 'D')" class="${editing.meta.channel ===
  'D' ? 'selected' : ''} channel-option-D">D</a>
  </div>
</div>

  <div class="playback-controls text-align-right float-left" style="position: absolute;">
    <button title="Play selection" onclick="digichain.editor.editorPlayFile(event);" class="button-clear check"><i class="gg-play-button"></i></button>
    <button title="Loop playback of selection" onclick="digichain.editor.editorPlayFile(event, true);" class="button-clear check"><i class="gg-repeat"></i></button>
    <button title="Stop playback" onclick="digichain.editor.editorPlayFile(event, false, true);" class="button-clear check"><i class="gg-play-stop"></i></button>  
  </div>
  <div class="zoom-level text-align-right float-right">
    <button title="Zoom out waveform view." class="zoom-out button-outline check" style="width:2.5rem;" onclick="digichain.editor.zoomLevel('editor', .5)">-</button>
    <button title="Reset zoom level waveform view."  class="zoom-reset button-outline check" onclick="digichain.editor.zoomLevel('editor', 1)">1x</button>
    <button title="Zoom in on waveform view."  class="zoom-in button-outline check" style="width:2.5rem;" onclick="digichain.editor.zoomLevel('editor', 2)">+</button>
  </div>

 </div>
  <div class="waveform-container">
    <div>
    ${Array.from('.'.repeat(Math.floor((conf.masterChannels + editing.buffer.numberOfChannels)/2))).reduce((a, v) => a += canvasMarkup, '')}
      <div id="editLines">
        <div class="edit-line"></div>
      </div>
    </div>
  </div>

  <div class="sample-op-buttons">
  <div class="edit-btn-group float-left">
  
  <button title="Normalize the volume of the sample." class="normalize button button-outline" onclick="digichain.editor.normalize(event)">Normalize</button>
  
  <button title="Reverses the sample playback" class="reverse button button-outline" onclick="digichain.editor.reverse(event)">Reverse</button>
  <button title="Crop the sample to the selected area." class="trim-right button button-outline" onclick="digichain.editor.truncate(event)">Crop</button>
  <button title="Fade in the selected audio." class="fade-in button button-outline" onclick="digichain.editor.fade('in')">Fade In</button>
  <button title="Silence the selected audio." class="silence button button-outline" onclick="digichain.editor.fade()">Silence</button>
  <button title="Fade out the selected audio." class="fade-out button button-outline" onclick="digichain.editor.fade('out')">Fade Out</button>
</div>
<div class="edit-btn-group float-right">
    <div class="edit-pitch-btn-group pitch-semi-tones">  
    <button title="Lower pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, .5, 12)">-12</button>
    <button title="Lower pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(-1/12), 1)">-1</button>
    &nbsp;<a href="javascript:;" onclick="digichain.editor.togglePitchSemitoneCents(event, 'cent')" title="Click to toggle between semi-tones and cents."> Pitch (semitones) </a>&nbsp;
    <button title="Increase pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(1/12), -1)">+1</button>
    <button title="Increase pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2, -12)">+12</button>
    </div>
    <div class="edit-pitch-btn-group pitch-cents hide">  
    <button title="Lower pitch by 10 cents" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(-1/120), 1)">-10</button>
    <button title="Lower pitch by 1 cent" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(-1/1200), 1)">-1</button>
    &nbsp;<a href="javascript:;" onclick="digichain.editor.togglePitchSemitoneCents(event, 'semi')" title="Click to toggle between semi-tones and cents." style="display: inline-block; width: 13rem;"> Pitch (cents) </a>&nbsp;
    <button title="Increase pitch by 1 cent" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(1/1200), 1)">+1</button>
    <button title="Increase pitch by 10 cents" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(1/120), 1)">+10</button>
    </div>
    <br>
      <button title="Trims any zero valued audio from the end of the sample." class="trim-right button button-outline" onclick="digichain.editor.trimRight(event)">Trim Right</button>
      <button class="trim-right button button-outline hide ${editing.buffer.numberOfChannels > 1 ? '' : 'hide'}" onclick="digichain.editor.interpolate(event)">Interpolate</button>
  </div>
</div>
  <span class="edit-info">
    Normalize, Silence, Fade In, Fade Out, Crop, and Reverse affect the selected part of the sample; Trim Right and Pitch Adjustments affect the whole sample.<br>
    Note: sample operations are destructive, applied immediately, no undo. Pitch adjustments are done via sample-rate, cumulative changes will affect sample quality.
  </span>
  `;
}

function renderEditableItems() {
  editableItemsEl.innerHTML = `
      <div class="input-set">
      <label for="editFileName" class="before-input">File Name</label>
      <input type="text" onkeyup="digichain.editor.updateFile(event)" placeholder="Sample file name" id="editFileName" value="${getNiceFileName('', editing, true)}" readonly>
      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFileName')"><i class="gg-pen"></i></button>
    </div><br>
    <div class="input-set">
    <label for="editFilePath" class="before-input">File Path</label>
      <input type="text" onkeyup="digichain.editor.updateFile(event)" placeholder="File path of the sample (if known)" id="editFilePath" value="${editing.file.path}" id="editFilePath" list="folderOptions" readonly>
      <datalist id="folderOptions">
        ${folders.map(f => '<option value="' + f + '">').join('')}
      </datalist>
      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFilePath')"><i class="gg-pen"></i></button>
    </div>
  `;
}

function renderSliceList() {
  const sliceSelectEl = document.querySelector('#sliceSelection');
  const slices = digichain.getSlicesFromMetaFile(editing);
  if (Array.isArray(slices)) {
    sliceSelectEl.innerHTML = slices.reduce((a, v, i) => a += `
        <option value="${i}">${i+1}</option>
    `, '<option value="-1">None</option>');
  }
  const selectedSlice = slices.findIndex(s => s.s === selection.start && s.e === selection.end);
  if (selectedSlice !== -1) {
    sliceSelectEl.value = selectedSlice;
  }
}

function renderEditPanelWaveform(multiplier = 1) {
  const waveformWidth = 1024 * multiplier;
  const editPanelWaveformEl = document.querySelector(`.edit-panel-waveform`);
  const editPanelWaveformEls = document.querySelectorAll(`.edit-panel-waveform`);
  if (showStereoWaveform) {
    editPanelWaveformEls.forEach((editPanelWaveformEl, idx) => {
      drawWaveform(editing, editPanelWaveformEl, idx, {
        width: waveformWidth, height: (128/editPanelWaveformEls.length), multiplier
      });
    });
  } else {
    drawWaveform(editing, editPanelWaveformEl, -1, {
      width: waveformWidth, height: 128, multiplier
    });
  }

}
export function drawWaveform(file, el, channel, dimensions) {
  let drawData = [];
  let drawResolution = Math.floor(file.buffer.length / 32);
  let drawBuffer;
  if (file.buffer.length > 512) {
    drawResolution = (drawResolution > 4096 ? 4096: drawResolution) * (((dimensions?.multiplier || 0) * 2) || 1);
  } else {
    drawResolution = file.buffer.length;
  }
  if (channel === 0 || channel === 1) {
    drawBuffer = file.buffer.getChannelData(channel);
  } else {
    drawBuffer = bufferToFloat32Array(file.buffer, Number.isInteger(channel) ? file.meta?.channel : channel);
  }
  if (file.buffer.numberOfChannels > 1) {
    let dualMonoCheck = [];
    for (let y = 0; y < file.buffer.length; y += Math.floor(file.buffer.length / drawResolution)) {
      drawData.push(drawBuffer[y]);
      dualMonoCheck.push((file.buffer.getChannelData(0)[y] - file.buffer.getChannelData(1)[y]) / 2);
    }
    file.meta.dualMono = dualMonoCheck.every(x => x === 0);
  } else {
    for (let y = 0; y < file.buffer.length; y += Math.floor(file.buffer.length / drawResolution)) {
      drawData.push(drawBuffer[y]);
    }
  }
  draw(drawData, file.meta.id, el, dimensions);
}

export function getNiceFileName(name, file, excludeExtension, includePath) {
  let fname = file ? `${file.file.name.replace(/\.[^.]*$/,'')}${file.meta?.dupeOf ? '-d' : ''}${file.meta?.sliceNumber ? '-s' + file.meta.sliceNumber : ''}.wav`:
      name.replace(
          /\.syx$|\.wav$|\.aif$|\.flac$|\.webm$|\.m4a$/, '');
  fname = (includePath && file.file.path) ? `${file.file.path.replace(/\//gi, '-')}` + fname : fname;
  return excludeExtension ? fname.replace(/\.[^.]*$/,'') : fname;
}

export function getUniqueName(files, name) {
  const parts = name.split('.');
  const ext = parts.pop();
  const fname = parts.join('.');
  const count = files.filter(f => (f.file.name || f.file.filename).includes(fname)).length;
  return count > 0 ? `${fname}_${count + 1}.${ext}` : name;
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

function togglePitchSemitoneCents(event, toggle) {
  const semiTonesDiv = document.querySelector('.pitch-semi-tones');
  const centsDiv = document.querySelector('.pitch-cents');

  semiTonesDiv.classList[toggle === 'cent' ? 'add' : 'remove']('hide');
  centsDiv.classList[toggle === 'semi' ? 'add' : 'remove']('hide');
}

function changeChannel(event, channel) {
  editing.meta.channel = channel;
  render();
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
  const selectionEl = document.querySelector('#editLines .edit-line');
  const width = getSelectionEndPoint() >= (1024 * multiplier) ? (1024 * multiplier) : getSelectionEndPoint();
  selectionEl.style.marginLeft = `${getSelectionStartPoint()}px`;
  selectionEl.style.width = `${width}px`;

}

function zoomLevel(view, level) {
  if (view === 'editor') {
    const selectionEl = document.querySelector('#editLines .edit-line');
    if (level !== 1) {
      level = multiplier * level;
    }
    const step = editing.buffer.length / (1024 * level);
    if ((1024 * level) < 1024 || (1024 * level) > 32768 || step < 1) {
      return alert('Unable to zoom any further');
    }
    renderEditPanelWaveform(level);
    selection.step = step;
    multiplier = level;
    updateSelectionEl();
    selectionEl.scrollIntoViewIfNeeded();
  }
}

function setSelStart(value) {
  const startBtnEl = document.querySelector('.btn-select-start');
  const endBtnEl = document.querySelector('.btn-select-end');
  selection.selStart = value;
  startBtnEl.classList[!value ? 'add' : 'remove']('button-outline');
  endBtnEl.classList[value ? 'add' : 'remove']('button-outline');
}

function changeSelectionPoint(event, shiftKey = false) {
  event.preventDefault();
  const lastSelection = {...selection};
  const max =  (1024 * multiplier);
  if ((event.shiftKey || shiftKey) || !selection.selStart) { //set end point if shift key is down
    let end = 0;
    if (event.offsetX <= max && event.offsetX > -1) {
      end = Math.round(event.offsetX * selection.step);
    } else if (event.offsetX > max) {
      end = editing.buffer.length;
    }
    selection.end = end;
    if (event.ctrlKey) {
      selection.start = lastSelection.end;
    }
    selection.start = selection.start >= selection.end? selection.end - 1: selection.start;
  } else {
    let start = 0;
    if (event.offsetX <= max && event.offsetX > -1) {
      start = Math.round(event.offsetX * selection.step);
    } else if (event.offsetX > max) {
      start = editing.buffer.length;
    }
    selection.start = start;
    if (event.ctrlKey) {
      selection.end = lastSelection.start;
    }
    selection.end = selection.end <= selection.start? selection.start + 1 : selection.end;
  }
  selection.end = selection.end >= editing.buffer.length? editing.buffer.length : selection.end;
  //selection.start = selection.start >= selection.end? selection.end - 50 : selection.start;
  selection.start = selection.start >= selection.end ? selection.end - 1 : selection.start;
  updateSelectionEl();
}

function resetSelectionPoints() {
  selection.start = 0;
  selection.end = editing.buffer.length;
  selection.selStart = true;
  updateSelectionEl();
}

function reSamplePitch(event, pitchValue, pitchSteps, item, renderEditPanel = true, volumeAdjust = 1, bitDepthOverride) {
  item = item || editing;

  if (item.buffer.length < 1024 && pitchValue > 1) {
    return alert('Sample too small to be pitched up further.');
  }

  const newSR = (conf.masterSR * pitchValue);
  let audioArrayBuffer;

  if (volumeAdjust !== 1) {
    audioArrayBuffer = conf.audioCtx.createBuffer(
        item.buffer.numberOfChannels,
        item.buffer.length,
        conf.masterSR
    );
    for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
      for (let i = 0; i < item.buffer.length; i++) {
        audioArrayBuffer.getChannelData(channel)[i] = item.buffer.getChannelData(channel)[i] / volumeAdjust;
      }
    }
  }

  const pitchedWav = audioBufferToWav((audioArrayBuffer || item.buffer), item.meta, newSR, (bitDepthOverride || 32), item.buffer.numberOfChannels, 0.4);
  const pitchedBlob = new window.Blob([new DataView(pitchedWav)], {
    type: 'audio/wav',
  });
  (async () => {
    let linkedFile = await fetch(URL.createObjectURL(pitchedBlob));
    let arrBuffer = await linkedFile.arrayBuffer();
    await new AudioContext({sampleRate: newSR, latencyHint: 'interactive'}).decodeAudioData(arrBuffer, buffer => {

      let resampledArrayBuffer;
      let resample, resampleR;
      resample = new Resampler(newSR, conf.masterSR, 1,
          buffer.getChannelData(0));
      resample.resampler(resample.inputBuffer.length);

      if (item.buffer.numberOfChannels === 2) {
        resampleR = new Resampler(newSR, conf.masterSR, 1,
            buffer.getChannelData(1));
        resampleR.resampler(resampleR.inputBuffer.length);
      }

      resampledArrayBuffer = conf.audioCtx.createBuffer(
          item.buffer.numberOfChannels,
          resample.outputBuffer.length,
          conf.masterSR
      );

      if (item.buffer.numberOfChannels === 2) {
        for (let i = 0; i < resample.outputBuffer.length; i++) {
          resampledArrayBuffer.getChannelData(0)[i] = resample.outputBuffer[i];
          resampledArrayBuffer.getChannelData(1)[i] = resampleR.outputBuffer[i];
        }
      } else {
        for (let i = 0; i < resample.outputBuffer.length; i++) {
          resampledArrayBuffer.getChannelData(0)[i] = resample.outputBuffer[i];
        }
      }

      item.buffer = resampledArrayBuffer;
      item.meta = {
        ...item.meta,
        opPitch: (item.meta.opPitch??0) + (512 * pitchSteps),
        length: resampledArrayBuffer.length,
        duration: Number(resampledArrayBuffer.length / conf.masterSR).toFixed(3),
        startFrame: 0, endFrame: resampledArrayBuffer.length,
        note: false,
        editing: false,
        slices: item.meta.slices ? item.meta.slices.map(slice => ({
          ...slice,
          n: slice.n, s: Math.round(slice.s / pitchValue),
          e: Math.round(slice.e / pitchValue)
        })) : false
      };
      if (renderEditPanel) {
        renderEditPanelWaveform(multiplier);
        selection.end = Math.round(selection.end / pitchValue);
        selection.start = Math.round(selection.start / pitchValue);
        selection.step = item.buffer.length / (1024 * multiplier);
        updateSelectionEl();
        item.waveform = false;
      }
    });
  })();
}

function normalize(event, item, renderEditPanel = true, findPeakOnly = false) {
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
  item.meta.peak = maxSample;
  if (findPeakOnly) {
    return maxSample;
  }
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

function interpolate(event, item, renderEditPanel = true) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  const audioArrayBuffer = conf.audioCtx.createBuffer(
      1,
      item.buffer.length,
      conf.masterSR
  );

  for (let i = 0; i < item.buffer.length; i++) {
    const value = i + 2 < item.buffer.length ? (item.buffer.getChannelData(i % 2)[i] + item.buffer.getChannelData(i % 2)[i + 2]) / 2 :
        item.buffer.getChannelData(i % 2)[i];
    audioArrayBuffer.getChannelData(0)[i] = value;
  }

  item.buffer = audioArrayBuffer;
  item.meta.channel = 'L';
  showStereoWaveform = false;

  if (renderEditPanel) {
    item.meta.editing = false;
    editPanelEl.close();
    digichain.stopPlayFile(false, digichain.editor.getLastItem());
    setTimeout(() => digichain.showEditPanel(event, item.meta.id), 250);
  }
  item.waveform = false;
}

function fade(type, item, renderEditPanel = true, start = 0, end = 0, absolute = false) {
  if (!renderEditPanel && item) {
    selection.start = start;
    selection.end = end > 0 ? end : item.buffer.length;
  }
  item = item || editing;

  const numChannels = item.buffer.numberOfChannels;
  const sampleRate = item.buffer.sampleRate;
  const fadeDuration = (selection.end - selection.start);
  const numSamples = fadeDuration * numChannels;
  const fadeSamples = fadeDuration * sampleRate;

  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel);
    if (type === 'out') {
      if (absolute) {
        data[selection.end] = 0;
      }
      for (let i = selection.start; i < selection.end; i++) {
          data[i] = data[i] *
              ((fadeDuration - (i - selection.start)) / fadeDuration);
      }
    } else if (type === 'in') {
      if (absolute) {
        data[selection.start] = 0;
      }
      for (let i = selection.end; i > selection.start; i--) {
          data[i] = data[i] /
              ((fadeDuration - (i - selection.end)) / fadeDuration);
      }
    } else if (type === 'fuzz') {
      for (let i = selection.start; i < selection.end; i++) {
        const x = ((fadeDuration + i) / fadeDuration) / (data[i] + 0.001) * Math.random();
        data[i] = Math.abs(x) > 1 ? (data[i] + 0.001) : x;
      }
    } else {
      for (let i = selection.end; i > selection.start; i--) {
        data[i] = 0;
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
  item.meta = {...item.meta};
  if (selection.start === 0 && selection.end === item.buffer.length) {
    item.meta.slices = item.meta.slices ? item.meta.slices.map(slice => ({
      ...slice,
      n: slice.n, s: selection.end - slice.e,
      e: selection.end - slice.s
    })) : false;
  } else {
    //item.meta.slices = false;
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
  if (item.meta.slices && item.meta.slices.length > 0) {
    item.meta.slices[item.meta.slices.length - 1].e = item.buffer.length;
  }
  if (renderEditPanel) {
    showEditor(editing, conf, 'sample', folders);
    //renderEditPanelWaveform(multiplier);
  }
  item.waveform = false;
}

function perSamplePitch(event, pitchValue, pitchSteps, item, renderEditPanel = true, volumeAdjust = 1, bitDepthOverride) {
  (item || editing).meta.editing = true;
  if (event.shiftKey) {
    stretch(event, item, renderEditPanel, ((item || editing).buffer.length / pitchValue));
  } else {
    reSamplePitch(event, pitchValue, pitchSteps, item, renderEditPanel, volumeAdjust, bitDepthOverride);
  }
}

function stretch(event, item, renderEditPanel = true, targetLength) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  const originalLength = item.buffer.length;
  const factor = targetLength / originalLength;
  const audioArrayBuffer = conf.audioCtx.createBuffer(
      item.buffer.numberOfChannels,
      targetLength,
      conf.masterSR
  );

  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    for (let i = 0; i < targetLength; i++) {
      const index = i / factor;
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.ceil(index);
      const interpolationFactor = index - lowerIndex;

      if (upperIndex >= originalLength) {
        audioArrayBuffer.getChannelData(channel)[i] = item.buffer.getChannelData(channel)[lowerIndex];
      } else {
        audioArrayBuffer.getChannelData(channel)[i] =
            (1 - interpolationFactor) * item.buffer.getChannelData(channel)[lowerIndex] +
            interpolationFactor * item.buffer.getChannelData(channel)[upperIndex];
      }
    }
  }

  item.buffer = audioArrayBuffer;
  item.meta = {
    ...item.meta,
    //opPitch: (item.meta.opPitch??0) + (512 * pitchSteps),
    length: audioArrayBuffer.length,
    duration: Number(audioArrayBuffer.length / conf.masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length,
    note: false,
    editing: false,
    slices: item.meta.slices ? item.meta.slices.map(slice => ({
      ...slice,
      n: slice.n, s: Math.round(slice.s * factor),
      e: Math.round(slice.e * factor)
    })) : false
  };
  if (renderEditPanel) {
    renderEditPanelWaveform(multiplier);
    selection.end = Math.round(selection.end * factor);
    selection.start = Math.round(selection.start * factor);
    selection.step = item.buffer.length / (1024 * multiplier);
    updateSelectionEl();
    item.waveform = false;
  }

}

function truncate(event, item, renderEditPanel = true, lengthInSeconds = 3) {
  const attemptToFindCrossingPoint = JSON.parse(
      localStorage.getItem('attemptToFindCrossingPoint')) ?? false;

  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = conf.masterSR * lengthInSeconds;
  }
  item = item || editing;

  if (attemptToFindCrossingPoint) {
    // match start and end sample values
    for (let i = (selection.start - Math.floor(((selection.start/4)*3))); i < selection.end; i++) {
      if (
          (item.buffer.getChannelData(0)[selection.end - i] === selection.start) &&
          (item.buffer.numberOfChannels > 1 ? item.buffer.getChannelData(1)[selection.end - i] === selection.start : true)
      ) {
        selection.end = selection.end - i;
      }
    }
  }


  let truncIndex = selection.end - selection.start;

  if (truncIndex > item.buffer.length) {
    // don't need to truncate as sample is shorter than the trim length.
    return;
  }

  const audioArrayBuffer = conf.audioCtx.createBuffer(
      item.buffer.numberOfChannels,
      truncIndex,
      conf.masterSR
  );
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let x = 0;
    for (let i = selection.start; i < selection.end; i++) {
      audioArrayBuffer.getChannelData(channel)[x] = item.buffer.getChannelData(channel)[i];
      x++;
    }
  }
  item.buffer = audioArrayBuffer;
  item.meta = {
    ...item.meta,
    length: audioArrayBuffer.length,
    duration: Number(audioArrayBuffer.length / conf.masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length
  };
  if (item.meta.slices) {
    item.meta.slices = false;
  }
  digichain.removeMetaFile(item.meta.id);
  if (renderEditPanel) {
    showEditor(editing, conf, 'sample', folders);
  }
  item.waveform = false;
}

function double(event, item, reverse = false, renderEditPanel = true) {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  const audioArrayBuffer = conf.audioCtx.createBuffer(
      item.buffer.numberOfChannels,
      item.buffer.length * 2,
      conf.masterSR
  );
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let x = 0;
    for (let i = selection.start; i < selection.end; i++) {
      audioArrayBuffer.getChannelData(channel)[x] = item.buffer.getChannelData(channel)[i];
      x++;
    }
    let data = item.buffer.getChannelData(channel).slice(selection.start, selection.end);
    if (reverse) {
      data = data.reverse();
    }
    for (let i = selection.start; i < selection.end; i++) {
      audioArrayBuffer.getChannelData(channel)[x] = data[i];
      x++;
    }

  }
  item.buffer = audioArrayBuffer;
  item.meta = {
    ...item.meta,
    length: audioArrayBuffer.length,
    duration: Number(audioArrayBuffer.length / conf.masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length
  };
  if (item.meta.slices) {
    item.meta.slices = false;
  }
  if (item.meta.op1Json) {
    item.meta.op1Json = false;
  }
  if (renderEditPanel) {
    showEditor(editing, conf, 'sample', folders);
  }
  item.waveform = false;
}

function serialize(event, item, renderEditPanel = true, method = 'LR') {
  if (!renderEditPanel && item) {
    selection.start = 0;
    selection.end = item.buffer.length;
  }
  item = item || editing;

  const audioArrayBuffer = conf.audioCtx.createBuffer(
    1,
    item.buffer.length * method.split('').length,
    conf.masterSR
  );

  let x = 0;
  method.split('').forEach(channel => {
    const buffer = bufferToFloat32Array(item.buffer, channel);
    for (let i = selection.start; i < selection.end; i++) {
      audioArrayBuffer.getChannelData(0)[x] = buffer[i];
      x++;
    }
  });

  item.buffer = audioArrayBuffer;
  item.meta = {
    ...item.meta,
    length: audioArrayBuffer.length,
    duration: Number(audioArrayBuffer.length / conf.masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length
  };
  if (item.meta.slices) {
    item.meta.slices = false;
  }
  if (item.meta.op1Json) {
    item.meta.op1Json = false;
  }
  if (renderEditPanel) {
    showEditor(editing, conf, 'sample', folders);
  }
  item.waveform = false;
}

function editorPlayFile(event, loop = false, stop = false) {
  const start = selection.start / conf.masterSR;
  const end = (selection.end / conf.masterSR) - start;
  clearTimeout(editorPlayFile.nextLoop);
  if (stop || !editPanelEl.open) {
    digichain.stopPlayFile(event, editing.meta.id);
    return;
  }
  digichain.playFile({ editor: true }, editing.meta.id, false, start, end);
  if (loop) {
    editorPlayFile.nextLoop = setTimeout(() => editorPlayFile(event, loop), end*1000);
  }
}

export const editor = {
  updateFile,
  toggleReadOnlyInput,
  togglePitchSemitoneCents,
  zoomLevel,
  changeSelectionPoint,
  resetSelectionPoints,
  setSelStart,
  editorPlayFile,
  normalize,
  fade,
  trimRight,
  truncate,
  interpolate,
  perSamplePitch,
  double,
  stretch,
  buildOpKit,
  sliceUpdate,
  sliceCreate,
  sliceRemove,
  sliceSelect,
  changeChannel,
  getLastItem : () => editing?.meta?.id,
  reverse,
  serialize
};
