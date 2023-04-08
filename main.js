import { Resampler, audioBufferToWav } from './resources.js?v=131';

const uploadInput = document.getElementById('uploadInput');
const listEl = document.getElementById('fileList');
const infoEl = document.getElementById('infoIndicator');
const DefaultSliceOptions = [0, 4, 8, 16, 32, 64, 120];
const audioConfigOptions = {
  m4410016: { sr: 44100, bd: 16, c: 1 },
  s4410016: { sr: 44100, bd: 16, c: 2 },
  m4410024: { sr: 44100, bd: 24, c: 1 },
  s4410024: { sr: 44100, bd: 24, c: 2 },
  m4800016: { sr: 48000, bd: 16, c: 1 },
  s4800016: { sr: 48000, bd: 16, c: 2 },
  m4800024: { sr: 48000, bd: 24, c: 1 },
  s4800024: { sr: 48000, bd: 24, c: 2 }
};
let masterSR = 48000;
let masterBitDepth = 16;
let masterChannels = 1;
let pitchModifier = 1;
let zipDownloads = true;
let audioCtx = new AudioContext({sampleRate: masterSR});
let files = [];
let unsorted = [];
let metaFiles = [];
let lastSort = '';
let lastSelectedRow;
let workBuffer;
let sliceGrid = 0;
let sliceOptions = Array.from(DefaultSliceOptions);
let keyboardShortcutsDisabled = false;
let modifierKeys = {
  shiftKey: false,
  ctrlKey: false
};

metaFiles.getByFileName = function(filename) {
  return this.find(m =>m.name.replace(/\.[^.]*$/,'') === filename.replace(/\.[^.]*$/,''));
};
metaFiles.getByFile = function(file) {
  if (file.meta.slicedFrom) { return false; }
  return this.find(m =>m.name.replace(/\.[^.]*$/,'') === file.file.name.replace(/\.[^.]*$/,''));
};
metaFiles.removeSelected = function() {
  files.forEach(f => {
    const idx = this.findIndex(i => i === this.getByFileName(f.file.name));
    f.meta.checked && idx !== -1 ? this.splice(idx, 1) : false;
  });
};
metaFiles.removeByName = function(filename) {
  const idx = this.findIndex(i => i === this.getByFileName(filename));
  if (idx !== -1) {
    this.splice(idx, 1);
  }
}

function changeAudioConfig(event) {
  const selection = event?.target?.selectedOptions[0]?.value || 'm4800016';
  if (files.length > 0 && audioConfigOptions[selection].sr !== masterSR) {
    let conf = confirm(`Changing audio export sample rate will remove all files from the sample list.\n\n Do you want to continue?`);
    if (!conf) {
      event.target.selectedIndex = [...event.target.options].findIndex(s => s.value === event.target.dataset.selection);
      return false;
    }
  }
  files = audioConfigOptions[selection].sr !== masterSR ? [] : files;
  [masterSR, masterBitDepth, masterChannels] = [audioConfigOptions[selection].sr, audioConfigOptions[selection].bd, audioConfigOptions[selection].c];
  event.target.dataset.selection = selection;
  audioCtx = new AudioContext({sampleRate: masterSR});
  renderList();
}

const getFileById = (id) => {
  return files.find(f => f.meta.id === id);
};
const getFileIndexById = (id) => {
  return files.findIndex(f => f.meta.id === id);
};
const getRowElementById = (id) => {
  return document.querySelector(`tr[data-id="${id}"]`);
};
const toggleModifier = (key) => {
  if (key === 'shiftKey' || key === 'ctrlKey') {
    modifierKeys[key] = !modifierKeys[key];
    document.getElementById('modifierKey' + key).classList[modifierKeys[key] ? 'add' : 'remove']('active');
    document.body.classList[modifierKeys[key] ? 'add' : 'remove'](key + '-mod-down');
  }
};

const closePopUps = () => {
  return document.querySelectorAll('.pop-up').forEach(w => w.classList.remove('show'));
};

const arePopUpsOpen = () => {
  return [...document.querySelectorAll('.pop-up')].some(w => w.classList.contains('show'));
};

const toggleOptionsPanel = () => {
  const buttonsEl = document.getElementById('allOptionsPanel');
  const toggleButtonEl = document.getElementById('toggleOptionsButton');
  buttonsEl.classList.contains('hidden') ? buttonsEl.classList.remove('hidden') : buttonsEl.classList.add('hidden');
  buttonsEl.classList.contains('hidden') ? toggleButtonEl.classList.add('collapsed') : toggleButtonEl.classList.remove('collapsed');
};

function changeEditPoint(event, range) {
  const handle = document.querySelector('.slice-range.edit-' + range);
  const line = document.querySelector('#editLines .line');
  const editPanelEl = document.getElementById('editPanel');
  editPanelEl.dataset[range] = event.target.value;
  if (range === 'start') {
    line.style.marginLeft = `${+editPanelEl.dataset.start}px`;
    line.style.width = `${+editPanelEl.dataset.end - +editPanelEl.dataset.start}px`;
  } else {
    line.style.width = `${+editPanelEl.dataset.end - +editPanelEl.dataset.start}px`;
  }
}

const renderEditPanelWaveform = (item) => {
  const editPanelWaveformContainerEl = document.querySelector(`#editPanel .waveform-container`);
  const editPanelWaveformEl = document.getElementById('editPanelWaveform');
  drawWaveform(item, editPanelWaveformEl, item.meta.channel, {
    width: +editPanelWaveformContainerEl.dataset.waveformWidth, height: 128
  });
};

function perSamplePitch(event, pitchValue, id) {
  const item = id ? getFileById(id) : getFileById(lastSelectedRow.dataset.id);
  const editPanelEl = document.getElementById('editPanel');

  const dataset = editPanelEl.dataset;
  dataset.start = dataset.start > -1 ? dataset.start : 0;
  dataset.end = dataset.end > -1 ? dataset.end : item.buffer.length;

  const pitchedWav = audioBufferToWav(item.buffer, item.meta, (masterSR * pitchValue), masterBitDepth, item.buffer.numberOfChannels);
  const pitchedBlob = new window.Blob([new DataView(pitchedWav)], {
    type: 'audio/wav',
  });
  (async () => {
    let linkedFile = await fetch(URL.createObjectURL(pitchedBlob));
    let arrBuffer = await linkedFile.arrayBuffer();
    await audioCtx.decodeAudioData(arrBuffer, buffer => {
      item.buffer = buffer;
      item.meta = {
        ...item.meta,
        length: buffer.length,
        duration: Number(buffer.length / masterSR).toFixed(3),
        startFrame: 0, endFrame: buffer.length
      };
      dataset.start = '0';
      dataset.end = `${buffer.length}`;
      renderEditPanelWaveform(item);
      item.waveform = false;
      renderList();
    });
  })();
}

function normalize(event, id) {
  const item = id ? getFileById(id) : getFileById(lastSelectedRow.dataset.id);
  const editPanelEl = document.getElementById('editPanel');
  const editPanelWaveformContainerEl = document.querySelector('#editPanel .waveform-container');
  const waveformWidth = +editPanelWaveformContainerEl.dataset.waveformWidth;
  let scaleSize = item.buffer.length/waveformWidth;

  const dataset = editPanelEl.dataset;
  dataset.start = +dataset.start > -1 ? dataset.start : 0;
  dataset.end = +dataset.end > -1 ? dataset.end : item.buffer.length;

  let maxSample = 0;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel);
    for (let i = Math.floor(+dataset.start * scaleSize); i < Math.floor(+dataset.end * scaleSize); i++) {
      maxSample = Math.max(Math.abs(data[i]), maxSample);
    }
  }
  maxSample = !maxSample ? 1 : maxSample;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel);
    for (let i = Math.floor(+dataset.start * scaleSize); i < Math.floor(+dataset.end * scaleSize); i++) {
      if (item.buffer.getChannelData(channel)[i] && item.buffer.getChannelData(channel)[i] / maxSample !== 0) {
        item.buffer.getChannelData(channel)[i] = item.buffer.getChannelData(channel)[i] / maxSample;
      }
    }
  }
  renderEditPanelWaveform(item);
  item.waveform = false;
}

function reverse(event, id) {
  const item = id ? getFileById(id) : getFileById(lastSelectedRow.dataset.id);
  const editPanelEl = document.getElementById('editPanel');

  const dataset = editPanelEl.dataset;
  dataset.start = dataset.start > -1 ? dataset.start : 0;
  dataset.end = dataset.end > -1 ? dataset.end : item.buffer.length;

  let maxSample = 0;
  for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
    let data = item.buffer.getChannelData(channel).reverse();
    for (let i = +dataset.start; i < +dataset.end; i++) {
      item.buffer.getChannelData(channel)[i] = data[i];
    }
  }
  renderEditPanelWaveform(item);
  item.waveform = false;
}

function trimRight(event, id, ampFloor = 0.003) {
  const item = id ? getFileById(id) : getFileById(lastSelectedRow.dataset.id);
  const editPanelEl = document.getElementById('editPanel');
  const dataset = editPanelEl.dataset;

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
  const audioArrayBuffer = audioCtx.createBuffer(
      item.buffer.numberOfChannels,
      +Math.max(...trimIndex),
      masterSR
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
    duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
    startFrame: 0, endFrame: audioArrayBuffer.length
  };
  dataset.start = '0';
  dataset.end = `${audioArrayBuffer.length}`;
  renderEditPanelWaveform(item);
  item.waveform = false;
}

const toggleReadOnlyInput = (inputId) => {
  const input = document.getElementById(inputId);
  input.readOnly ? input.removeAttribute('readonly') : input.setAttribute('readonly', true);
};

function updateFile(event) {
  const target = event.target;
  const item = getFileById(lastSelectedRow.dataset.id);
  if (!target) { return ; }
  if (target.id === 'editFileName') {
    item.file.name = target.value;
  }
  if (target.id === 'editFilePath') {
    item.file.path = target.value;
  }
}

const showEditPanel = (event, id) => {
  const editPanelEl = document.getElementById('editPanel');
  const editableItemsEl = document.getElementById('editableItems');
  let item;
  if (id) {
    lastSelectedRow = getRowElementById(id);
    editPanelEl.dataset.id = id;
  }
  item = getFileById(id || lastSelectedRow.dataset.id);
  editPanelEl.dataset.start = '-1';
  editPanelEl.dataset.end = '-1';
  editableItemsEl.innerHTML = `
      <div class="input-set">
      <label for="editFileName" class="before-input">File Name</label>
      <input type="text" onchange="digichain.updateFile(event)" placeholder="Sample file name" id="editFileName" value="${getNiceFileName('', item, true)}" readonly>
      <button class="button-clear" onclick="digichain.toggleReadOnlyInput('editFileName')"><i class="gg-pen"></i></button>
    </div><br>
    <div class="input-set">
    <label for="editFilePath" class="before-input">File Path</label>
      <input type="text" placeholder="File path of the sample (if known)" id="editFilePath" value="${item.file.path}" id="editFilePath" readonly>
      <button class="button-clear" onclick="digichain.toggleReadOnlyInput('editFilePath')"><i class="gg-pen"></i></button>
    </div>
  `;

  editPanelEl.classList.add('show');
  renderEditPanelWaveform(item);

};

async function setWavLink(file, linkEl) {
  const fileName = getNiceFileName('', file, false, true);
  let wav = audioBufferToWav(
      file.buffer, file.meta, (masterSR * pitchModifier), masterBitDepth, masterChannels
  );
  let blob = new window.Blob([new DataView(wav)], {
    type: 'audio/wav',
  });
  if (pitchModifier !== 1) {
    let linkedFile = await fetch(URL.createObjectURL(blob));
    let arrBuffer = await linkedFile.arrayBuffer();
    let pitchedBuffer = await audioCtx.decodeAudioData(arrBuffer);
    wav = audioBufferToWav(
        pitchedBuffer, file.meta, masterSR, masterBitDepth, masterChannels
    );
    blob = new window.Blob([new DataView(wav)], {
      type: 'audio/wav',
    });
  }

  linkEl.href = URL.createObjectURL(blob);
  linkEl.setAttribute('download', fileName);
  return blob;
}

async function downloadAll(event) {
  const _files = files.filter(f => f.meta.checked);
  const flattenFolderStructure = (event.shiftKey || modifierKeys.shiftKey);
  const links = [];
  const el = document.getElementById('getJoined');
  if (_files.length > 5 && !zipDownloads) {
    const userReadyForTheCommitment = confirm(`You are about to download ${_files.length} files, that will show ${_files.length} pop-ups one after each other..\n\nAre you ready for that??`);
    if (!userReadyForTheCommitment) { return; }
  }

  if (zipDownloads && _files.length > 1) {
    const zip = new JSZip();
    for (const file of _files) {
      const blob = await setWavLink(file, el);
      if (flattenFolderStructure) {
        zip.file(getNiceFileName('', file, false, true), blob, { binary: true });
      } else {
        zip.file(file.file.path + getNiceFileName('', file, false), blob, { binary: true });
      }
    }
    zip.generateAsync({type: 'blob'}).then(blob => {
      const el = document.getElementById('getJoined');
      el.href = URL.createObjectURL(blob);
      el.setAttribute('download', 'digichain_files.zip');
      el.click();
    });
    return;
  }

  for (const file of _files) {
    const link = await downloadFile(file.meta.id);
    links.push(link);
  }

  const intervalId = setInterval(() => {
    const lnk = links.shift();
    lnk?.click();
    if (links.length === 0 && lnk) {
      clearInterval(intervalId);
    }
  }, 500);

}

async function downloadFile(id, fireLink = false) {
  const el = getRowElementById(id).querySelector('.wav-link-hidden');
  const file = getFileById(id);
  await setWavLink(file, el);
  if (fireLink) {
    el.click();
  }
  return el;
}

function removeSelected() {
  metaFiles.removeSelected();
  files.forEach(f => f.meta.checked ? f.source?.stop() : '' );
  files = files.filter(f => !f.meta.checked);
  unsorted = unsorted.filter(id => files.find(f => f.meta.id === id));
  renderList();
}

function showInfo() {
  const description = document.querySelector('meta[name=description]').content;
  const infoPanelContentEl = document.querySelector('.info-panel-md .content');
  infoPanelContentEl.innerHTML = `
    <h3>DigiChain</h3>
    <p>${description}</p>
    <p class="float-right"><a href="https://brianbar.net/" target="_blank">Brian Barnett</a>
    (<a href="https://www.youtube.com/c/sfxBrian" target="_blank">sfxBrian</a> / <a href="https://github.com/brian3kb" target="_blank">brian3kb</a>) </p>
`;
  document.querySelector('.info-panel-md').classList.add('show');
}

function pitchExports(value) {
  const octaves = {
    2: 1,
    4: 2,
    8: 3
  };
  if ([.25,.5,1,2,4,8].includes(+value)) {
    pitchModifier = +value;
    infoEl.textContent = pitchModifier === 1 ? '' : `All exported samples will be pitched up ${octaves[pitchModifier]} octave${pitchModifier > 2 ? 's' : ''}`;
    showExportSettingsPanel();
  }
}

function toggleSetting(param) {
  if (param === 'zipDl' ) {
    zipDownloads = !zipDownloads;
    showExportSettingsPanel();
  }
}

function showExportSettingsPanel() {
  const panelContentEl = document.querySelector('.export-settings-panel-md .content');
  panelContentEl.innerHTML = `
    <h4>Settings</h4>
    <table style="padding-top:0;">
    <thead>
    <tr>
    <th width="55%"></th>
    <th></th>
</tr>
</thead>
    <tbody>
    <tr>
    <td><span>Pitch up exported files by octave &nbsp;&nbsp;&nbsp;</span></td>
    <td>    <button onclick="digichain.pitchExports(1)" class="check ${pitchModifier === 1 ? 'button' : 'button-outline'}">OFF</button>
    <button onclick="digichain.pitchExports(2)" class="check ${pitchModifier === 2 ? 'button' : 'button-outline'}">1</button>
    <button onclick="digichain.pitchExports(4)" class="check ${pitchModifier === 4 ? 'button' : 'button-outline'}">2</button>
    <button onclick="digichain.pitchExports(8)" class="check ${pitchModifier === 8 ? 'button' : 'button-outline'}">3</button><br></td>
</tr>
<tr>
<td><span>Download multi-file/joined downloads as one zip file? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onclick="digichain.toggleSetting('zipDl')" class="check ${zipDownloads ? 'button' : 'button-outline'}">${ zipDownloads ? 'YES' : 'NO'}</button></td>
</tr>
</tbody>
</table>
  `;
  document.querySelector('.export-settings-panel-md').classList.add('show');
}

function getMonoFloat32ArrayFromBuffer(buffer, channel, getAudioBuffer = false) {
  let result = getAudioBuffer ?
      audioCtx.createBuffer(
          masterChannels,
          buffer.length,
          masterSR
      ) : new Float32Array(buffer.length);

  if (channel === 'S') {
    for (let i = 0; i < buffer.length; i++) {
      (getAudioBuffer ? result.getChannelData(0) : result)[i] = (buffer.getChannelData(0)[i] + buffer.getChannelData(1)[i]) / 2;
    }
  } else {
    const _channel = channel === 'R' ? 1 : 0;
    for (let i = 0; i < buffer.length; i++) {
      (getAudioBuffer ? result.getChannelData(0) : result)[i] = buffer.getChannelData(_channel)[i];
    }
  }
  return result;
}

function joinToMono(audioArrayBuffer, _files, totalLength, largest, pad) {
  let totalWrite = 0;
  _files.forEach((file, idx) => {
    const bufferLength = pad ? largest : file.buffer.length;

    let result = getMonoFloat32ArrayFromBuffer(file.buffer, file?.meta?.channel);

    for (let i = 0; i < bufferLength; i++) {
      audioArrayBuffer.getChannelData(0)[totalWrite] = result[i];
      totalWrite++;
    }
  });
}

function joinToStereo(audioArrayBuffer, _files, totalLength, largest, pad) {
  let totalWrite = 0;
  _files.forEach((file, idx) => {
    const bufferLength = pad ? largest : file.buffer.length;
    let result = [new Float32Array(file.buffer.length), new Float32Array(file.buffer.length)];

    for (let i = 0; i < file.buffer.length; i++) {
      result[0][i] = file.buffer.getChannelData(0)[i];
      result[1][i] = file.buffer.getChannelData(file.buffer.numberOfChannels === 2 ? 1 : 0)[i];
    }

    for (let i = 0; i < bufferLength; i++) {
      audioArrayBuffer.getChannelData(0)[totalWrite] = result[0][i];
      audioArrayBuffer.getChannelData(1)[totalWrite] = result[1][i];
      totalWrite++;
    }
  });
}
//TODO: Finish mix-down method.
function mixDown(_files) {
  const mixDownLength = _files.reduce((big, cur) => big > cur.buffer.length ? big : cur.buffer.length, 0);
  const audioArrayBuffer = audioCtx.createBuffer(
      masterChannels,
      mixDownLength,
      masterSR
  );
  let totalWrite = 0;
  _files.forEach((file, idx) => {
    const bufferLength = pad ? largest : file.buffer.length;
    let result = [new Float32Array(file.buffer.length), new Float32Array(file.buffer.length)];

    for (let i = 0; i < file.buffer.length; i++) {
      result[0][i] = file.buffer.getChannelData(0)[i];
      result[1][i] = file.buffer.getChannelData(file.buffer.numberOfChannels === 2 ? 1 : 0)[i];
    }

    for (let i = 0; i < bufferLength; i++) {
      audioArrayBuffer.getChannelData(0)[totalWrite] = result[0][i];
      audioArrayBuffer.getChannelData(1)[totalWrite] = result[1][i];
      totalWrite++;
    }
  });
}

function joinAllUICall(event, pad) {
  if (files.length === 0) { return; }
  document.getElementById('loadingText').textContent = 'Processing';
  document.body.classList.add('loading');
  setTimeout(() => joinAll(event, pad), 500);
}

async function joinAll(event, pad = false, filesRemaining = [], fileCount = 0, toInternal = false, zip = false) {
  if (files.length === 0) { return; }
  if (toInternal || (event.shiftKey || modifierKeys.shiftKey)) { toInternal = true; }
  if (zipDownloads && !toInternal) { zip = zip || new JSZip(); }
  let _files = filesRemaining.length > 0 ? filesRemaining : files.filter(f => f.meta.checked);
  let tempFiles = _files.splice(0, (sliceGrid > 0 ? sliceGrid : _files.length));
  filesRemaining = Array.from(_files);
  _files = tempFiles;
  if (pad && sliceGrid !== 0 && _files.length !== 0) {
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
      masterChannels,
      totalLength,
      masterSR
  );

  if (masterChannels === 1) { joinToMono(audioArrayBuffer, _files, totalLength, largest, pad); }
  if (masterChannels === 2) { joinToStereo(audioArrayBuffer, _files, totalLength, largest, pad); }

  const joinedEl = document.getElementById('getJoined');
  const path = _files[0].file.path ? `${(_files[0].file.path || '').replace(/\//gi, '-')}` : '';
  const fileData = {file: {
    name: _files.length === 1 ?
        `${path}joined_${pad ? 'spaced_' : ''}${getNiceFileName('', _files[0], true)}_${fileCount+1}--[${_files.length}].wav` :
        `${path}joined_${pad ? 'spaced_' : ''}${fileCount+1}--[${_files.length}].wav`
    }, buffer: audioArrayBuffer, meta: {}};
  if (toInternal) {

      const blob = await setWavLink(fileData, joinedEl);
      const fileReader = new FileReader();
      fileReader.readAsArrayBuffer(blob);
      fileReader.fileCount = fileCount;

      fileReader.onload = (e) => {
        audioCtx.decodeAudioData(e.target.result, function(buffer) {
          parseWav(buffer, {
            lastModified: new Date().getTime(),
            name: _files.length === 1 ?
                `${path}resample_${pad ? 'spaced_' : ''}${getNiceFileName('', _files[0], true)}_${fileReader.fileCount+1}--[${_files.length}].wav`:
                `${path}resample_${pad ? 'spaced_' : ''}${fileReader.fileCount+1}--[${_files.length}].wav`,
            size: ((masterBitDepth * masterSR * (buffer.length / masterSR)) / 8) * buffer.numberOfChannels /1024,
            type: 'audio/wav'
          }, '', true, false);
          renderList();
        })
      };

  } else {
      if (zip) {
        const blob = setWavLink(fileData, joinedEl);
        zip.file(fileData.file.name, blob, { binary: true });
      } else {
        await setWavLink(fileData, joinedEl);
        joinedEl.click();
      }
  }
  if (filesRemaining.length > 0) {
    fileCount++;
    joinAll(event, pad, filesRemaining, fileCount, toInternal, zip);
  } else {
    if (zip) {
      zip.generateAsync({type: 'blob'}).then(blob => {
        joinedEl.href = URL.createObjectURL(blob);
        joinedEl.setAttribute('download', 'digichain_files.zip');
        joinedEl.click();
      });
    }
    renderList();
  }
}

function joinAllByPath(event, pad = false) { //TODO: test and hook into UI
  const filesByPath = {};
  files.filter(f => f.meta.checked).forEach(file => {
    const path = file.file.path.replace(/\//gi, '-');
    filesByPath[path] = filesByPath[path] || [];
    filesByPath[path].push(file);
  });
  for (const fBP of filesByPath) {
    joinAll(event, pad, fBP,fBP.length);
  }
}

const stopPlayFile = (event, id) => {
  const file = getFileById(id || lastSelectedRow.dataset.id);
  if (file.source) {
    file.source.stop();
  }
};

const playFile = (event, id, loop) => {
  const file = getFileById(id || lastSelectedRow.dataset.id);
  loop = loop || (event.shiftKey || modifierKeys.shiftKey) || false;
  if (file.source) {
    file.source.stop();
  }
  file.source = audioCtx.createBufferSource();
  file.source.buffer = file.meta.channel && masterChannels === 1 ?
      getMonoFloat32ArrayFromBuffer(file.buffer, file.meta.channel, true) :
      file.buffer;
  //file.source.playbackRate.value = 8;
  file.source.connect(audioCtx.destination);
  file.source.loop = loop;
  file.source.start();
};

const toggleCheck = (event, id) => {
  try {
    const rowEl = getRowElementById(id);
    const el = getRowElementById(id).querySelector('.toggle-check');
    const file = getFileById(id);
    event.preventDefault();
    file.meta.checked = !file.meta.checked;
    file.meta.checked
        ? el.classList.remove('button-outline')
        : el.classList.add('button-outline');
    file.meta.checked
        ? rowEl.classList.add('checked')
        : rowEl.classList.remove('checked');
    if (!file.meta.checked) {
      file.source?.stop();
    }
    lastSort = '';
    setCountValues();
  } catch (err) {
    setCountValues();
  }
};

const changeChannel = (event, id, channel) => {
  const el = getRowElementById(id).querySelector('.channel-option-' + channel);
  const file = getFileById(id);
  if ((event.shiftKey || modifierKeys.shiftKey)) {
    const opts = {
      L: 'audio from the Left channel',
      R: 'audio from the Right channel',
      S: 'Sum both channels of audio to mono'
    };
    const confirmSetAllSelected = confirm(`Confirm setting all selected samples that are stereo to ${opts[channel]}?`);
    if (confirmSetAllSelected) {
      files.filter(f => f.meta.checked).forEach(f => f.meta.channel = channel);
    }
    return renderList();
  }
  file.meta.channel = channel;
  //file.waveform.getContext('2d').clear();
  //drawWaveform(file, file.waveform, file.buffer.numberOfChannels);
  getRowElementById(id).querySelectorAll('.channel-options a').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
};

const invertFileSelection = () => {
  if (files.length === 0) { return ; }
  files.forEach(file => file.meta.checked = !file.meta.checked);
  renderList();
};

const changeSliceOption = (targetEl, size, silent = false) => {
  let newValue = size;
  if (!silent) { newValue = prompt(`Change slice value "${size}" to what new value?`); }
  if (newValue && !isNaN(newValue)) {
    newValue = Math.abs(Math.ceil(+newValue));
    sliceOptions[targetEl.dataset.sel] = +newValue;
    targetEl.textContent = newValue;
  }
  return +newValue;
};

const selectSliceAmount = (event, size) => {
  if (!event.target) { return ; }
  if ((event.ctrlKey || modifierKeys.ctrlKey)) {
    if (size === 0) {
      DefaultSliceOptions.forEach((option, index) => changeSliceOption(
          document.querySelector(`.master-slices .sel-${index}`), option, true
      ));
      sliceOptions = Array.from(DefaultSliceOptions);
      return selectSliceAmount({ shiftKey: true }, 0);
    }
    return selectSliceAmount({ shiftKey: true }, changeSliceOption(event.target, size));
  }
  sliceGrid = size;
  sliceOptions.forEach((option, index) => {
    const el = document.querySelector(`.master-slices .sel-${index}`);
    option === size ?
        el.classList.remove('button-outline') :
        el.classList.add('button-outline');
  });
  setCountValues();
  if (size === 0) {
    files.forEach(f => f.source?.stop());
  }
  if ((event.shiftKey || modifierKeys.shiftKey)) { return; } /*Shift-click to change grid but keep selections.*/
  files.forEach(f => f.meta.checked = false);
  for (let i = 0; i < (size < files.length ? size : files.length) ; i++) {
    toggleCheck(event, files[i].meta.id);
  }
  renderList();
}

const duplicate = (event, id) => {
  const file = getFileById(id);
  const fileIdx = getFileIndexById(id) + 1;
  const item = {file: {...file.file}};
  item.buffer = new AudioBuffer({
    numberOfChannels: file.buffer.numberOfChannels,
    length: file.buffer.length,
    sampleRate: file.buffer.sampleRate
  });
  for (let channel = 0; channel < file.buffer.numberOfChannels; channel++) {
    const ogChannelData = file.buffer.getChannelData(channel);
    const newChannelData = item.buffer.getChannelData(channel);
    newChannelData.set(ogChannelData);
  }
  item.meta = JSON.parse(JSON.stringify(file.meta)); // meta sometimes contains a customSlices object.
  item.meta.dupeOf = id;
  item.waveform = false;
  item.meta.id = crypto.randomUUID();
  files.splice(((event.shiftKey || modifierKeys.shiftKey) ? files.length : fileIdx), 0, item);
  unsorted.push(item.meta.id);
  renderList();
};

const splitByOtSlices = (event, id, pushInPlace = false, sliceSource = 'ot') => {
  const file = getFileById(id);
  const pushInPlaceItems = [];
  let otMeta;
  if (sliceSource === 'transient') {
    otMeta = metaFiles.getByFileName('---sliceToTransientCached---');
  } else if (sliceSource === 'ot') {
    otMeta = metaFiles.getByFile(file);
  } else {
    otMeta = file.meta.customSlices ? file.meta.customSlices : false;
  }
  if (!otMeta) { return ; }
  for (let i = 0; i < otMeta.sliceCount; i++) {
    const newLength = (otMeta.slices[i].endPoint - otMeta.slices[i].startPoint);
    if (newLength < 5) { continue; }
    const audioArrayBuffer = audioCtx.createBuffer(
        file.buffer.numberOfChannels,
        newLength,
        masterSR
    );
    const slice = {};
    const uuid = crypto.randomUUID();
    slice.buffer = audioArrayBuffer;
    slice.file = {...file.file};
    slice.meta = {
      length: audioArrayBuffer.length,
      duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
      startFrame: 0, endFrame: audioArrayBuffer.length,
      checked: true, id: uuid,
      sliceNumber: `${file.meta.sliceNumber ? file.meta.sliceNumber + '-' : ''}${i+1}`, slicedFrom: file.meta.id,
      channel: audioArrayBuffer.numberOfChannels > 1 ? 'L': ''
    };

    file.buffer.getChannelData(0).slice(otMeta.slices[i].startPoint, otMeta.slices[i].endPoint).forEach((a, idx) => slice.buffer.getChannelData(0)[idx] = a);
    if (file.buffer.numberOfChannels === 2) {
      file.buffer.getChannelData(1).slice(otMeta.slices[i].startPoint, otMeta.slices[i].endPoint).forEach((a, idx) => slice.buffer.getChannelData(1)[idx] = a);
    }
    if (pushInPlace) {
      pushInPlaceItems.push(slice);
    } else {
      files.push(slice);
    }
    unsorted.push(uuid);
  }
  if (pushInPlaceItems.length) {
    files.splice(getFileIndexById(id) + 1, 0, ...pushInPlaceItems);
  }
  renderList();
};

const splitEvenly = (event, id, slices, pushInPlace = false) => {
  const file = getFileById(id);
  const frameSize = file.buffer.length / slices;
  const pushInPlaceItems = [];
  for (let i = 0; i < slices; i++) {
    const audioArrayBuffer = audioCtx.createBuffer(
        file.buffer.numberOfChannels,
        frameSize,
        file.buffer.sampleRate
    );
    const slice = {};
    const uuid = crypto.randomUUID();
    slice.buffer = audioArrayBuffer;
    slice.file = {...file.file};
    slice.meta = {
      length: audioArrayBuffer.length,
      duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
      startFrame: 0, endFrame: audioArrayBuffer.length,
      checked: true, id: uuid,
      sliceNumber: `${file.meta.sliceNumber ? file.meta.sliceNumber + '-' : ''}${i+1}`, slicedFrom: file.meta.id,
      channel: audioArrayBuffer.numberOfChannels > 1 ? 'L': ''
    };

    file.buffer.getChannelData(0).slice((i * frameSize), (i * frameSize) + frameSize).forEach((a, idx) => slice.buffer.getChannelData(0)[idx] = a);
    if (file.buffer.numberOfChannels === 2) {
      file.buffer.getChannelData(1).slice((i * frameSize), (i * frameSize) + frameSize).forEach((a, idx) => slice.buffer.getChannelData(1)[idx] = a);
    }
    if (pushInPlace) {
      pushInPlaceItems.push(slice);
    } else {
      files.push(slice);
    }
    unsorted.push(uuid);
  }
  if (pushInPlaceItems.length) {
    files.splice(getFileIndexById(id) + 1, 0, ...pushInPlaceItems);
  }
  renderList();
}

const splitByTransient = (file, threshold = .8) => {
  const transientPositions = [];
  const frameSize = file.buffer.length / 64;
  let lastStart = undefined;
  let lastEnd = undefined;
  for (let i = 0; i < file.buffer.length; i++) {
    if (lastStart === undefined) {
      if (Math.abs(file.buffer.getChannelData(0)[i]) > threshold) {
        lastStart = i;
        i = i + frameSize;
      }
    } else {
      if (lastEnd === undefined) {
        // I want loose equality here as I want 0.000 to be true against 0
        if (Math.abs(file.buffer.getChannelData(0)[i]).toFixed(3) == 0 || i + frameSize > file.buffer.length) {
          lastEnd =  i + frameSize > file.buffer.length ? i : i + frameSize;
        }
      }
    }

    if (lastStart !== undefined && lastEnd !== undefined) {
      transientPositions.push({
        startPoint: lastStart,
        loopPoint: lastStart,
        endPoint: lastEnd
      });
      lastStart = undefined;
      lastEnd = undefined;
    }
  }

// map transient positions into slice object.
  let metaTransient = metaFiles.getByFileName('---sliceToTransientCached---');
  if (!metaTransient) {
    metaTransient = {
      uuid: crypto.randomUUID(),
      name: '---sliceToTransientCached---',
      sliceCount: 0,
      slices: []
    };
    metaFiles.push(metaTransient);
  }

  metaTransient.slices = transientPositions;
  metaTransient.sliceCount = metaTransient.slices.length;
  return metaTransient;
};

const splitSizeAction = (event, slices, threshold) => {
  let file, otMeta;
  const sliceGroupEl = document.querySelector(`.split-panel-options .slice-group`);
  const optionsEl = document.querySelectorAll(`.split-panel-options .slice-group button`);

  if (slices === 'ot' && sliceGroupEl.dataset.id) {
    file = getFileById(sliceGroupEl.dataset.id);
    otMeta = metaFiles.getByFile(file);
    slices = otMeta.slices;
  }
  if (slices === 'transient' && sliceGroupEl.dataset.id) {
    file = getFileById(sliceGroupEl.dataset.id);
    otMeta = splitByTransient(file, (+threshold)/100);
    slices = otMeta.slices;
  } else {
    metaFiles.removeByName('---sliceToTransientCached---');
  }

  optionsEl.forEach(option => option.classList.add('button-outline'));
  sliceGroupEl.dataset.sliceCount = typeof slices === 'number' ? slices : otMeta.sliceCount;
  optionsEl.forEach((option, index) => {
    (+option.dataset.sel === +sliceGroupEl.dataset.sliceCount && !otMeta) || (option.dataset.sel === 'ot' && otMeta && otMeta.name !== '---sliceToTransientCached---') || (option.dataset.sel === 'transient' && otMeta && otMeta.name === '---sliceToTransientCached---') ?
        option.classList.remove('button-outline') :
        option.classList.add('button-outline');
  });
  drawSliceLines(slices, file, otMeta);
};

const remove = (id) => {
  const fileIdx = getFileIndexById(id);
  const removed = files.splice(fileIdx, 1);
  const unsortIdx = unsorted.findIndex(uuid => uuid === id);
  unsorted.splice(unsortIdx, 1);
  if (removed[0]) {
    metaFiles.removeByName(removed[0].file.name);
  }
  renderList();
}

const move = (event, id, direction) => {
  const from = getFileIndexById(id);
  let item;
  let to = direction === 1 ? (from + 1) : (from - 1);
  if (to === -1) { to = files.length - 1; }
  if (to >= files.length) { to = 0; }
  item = files.splice(from, 1)[0];
  if ((event.shiftKey || modifierKeys.shiftKey)) { /*If shift key, move to top or bottom of list.*/
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
          files.sort((a, b) => (a.meta[by] - b.meta[by]));
      lastSort = by;
    }
  }
  renderList();
};

const handleRowClick = (event, id) => {
  const row = getRowElementById(id);
  if (document.querySelector('.pop-up.show')) { return ; }
  if (lastSelectedRow) { lastSelectedRow.classList.remove('selected'); }
  row.classList.add('selected');
  lastSelectedRow = row;
  lastSelectedRow.scrollIntoViewIfNeeded();
  setCountValues();

};

const rowDragStart = (event) => {
  if (event.target?.classList?.contains('file-row')) {
    lastSelectedRow = event.target;
  }
};

const drawSliceLines = (slices, file, otMeta) => {
  const _slices = typeof slices === 'number' ? Array.from('.'.repeat(slices)) : slices;
  const sliceLinesEl = document.getElementById('sliceLines');
  const splitPanelWaveformContainerEl = document.querySelector(`#splitOptions .waveform-container`);
  const waveformWidth = splitPanelWaveformContainerEl.dataset.waveformWidth;
  let lines = [];
  if (file && otMeta) {
    let scaleSize = file.buffer.length/waveformWidth;
    lines = otMeta.slices.map((slice, idx) => `
        <div class="line" style="margin-left:${(slice.startPoint/scaleSize)}px; width:${(slice.endPoint/scaleSize) - (slice.startPoint/scaleSize)}px;"></div>
    `);
  } else {
    lines = _slices.map((slice, idx) => `
      <div class="line" style="margin-left:${(waveformWidth/_slices.length) * idx}px; width:${(waveformWidth/_slices.length)}px;"></div>
  `);
    //
    // lines = _slices.map((slice, idx) => `
    //   <div class="line" onclick="digichain.selectSlice(event)" style="margin-left:${(waveformWidth/_slices.length) * idx}px; width:${(waveformWidth/_slices.length)}px;"></div>
    // `);
  }
  sliceLinesEl.innerHTML = lines.join('');
};


const splitAction = (event, id, slices) => {
  const el = document.getElementById('splitOptions');
  const fileNameEl = document.getElementById('splitFileName');
  const sliceGroupEl = document.querySelector(`.split-panel-options .slice-group`);
  const sliceByOtButtonEl = document.getElementById('sliceByOtButton');
  const sliceByTransientButtonEl = document.getElementById('sliceByTransientButton');
  const sliceByTransientThresholdEl = document.getElementById('transientThreshold');
  const splitPanelWaveformContainerEl = document.querySelector(`#splitOptions .waveform-container`);
  const splitPanelWaveformEl = document.getElementById('splitPanelWaveform');
  let item;
  let otMeta;
  let pushInPlace = (event.shiftKey || modifierKeys.shiftKey);
  if (id) {
    lastSelectedRow = getRowElementById(id);
    sliceGroupEl.dataset.id = id;
  }
  if (slices === true) { slices = sliceGroupEl.dataset.sliceCount; }
  item = getFileById(id || lastSelectedRow.dataset.id);
  if (slices) {
    id = id || item.meta.id;
    if (slices === 'ot' || !sliceByTransientButtonEl.classList.contains('button-outline') || !sliceByOtButtonEl.classList.contains('button-outline')) {
      const sliceSource = sliceByTransientButtonEl.classList.contains('button-outline') ? 'ot' : 'transient';
      splitByOtSlices(event, id, pushInPlace, sliceSource);
    } else {
      if (item.meta.customSlices) {
        splitByOtSlices(event, id, pushInPlace, 'custom');
      } else {
        splitEvenly(event, id, slices, pushInPlace);
      }
    }
    return el.classList.remove('show');
  }
  otMeta = metaFiles.getByFile(item);
  fileNameEl.textContent = getNiceFileName('', item, true);
  sliceByOtButtonEl.style.display = otMeta ? 'inline-block' : 'none';
  sliceByOtButtonEl.textContent = otMeta ? `${otMeta.sliceCount}` : 'OT';
  splitSizeAction(false,0);
  el.classList.add('show');
  drawWaveform(item, splitPanelWaveformEl, item.meta.channel, {
    width: +splitPanelWaveformContainerEl.dataset.waveformWidth, height: 128
  });
};

const draw = (normalizedData, id, canvas, dimensions) => {
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
};

const secondsToMinutes = (time) => {
  const mins =  Math.floor(time / 60);
  const seconds = Number(time % 60).toFixed(2);
  return  mins > 0 ? `${mins}m ${Math.round(+seconds)}s` : `${seconds}s`;
};

const setCountValues = () => {
  const filesSelected = files.filter(f => f.meta.checked);
  const selectionCount = filesSelected.length;
  const filesDuration = files.reduce((a, f) => a += +f.meta.duration, 0);
  const filesSelectedDuration = filesSelected.reduce((a, f) => a += +f.meta.duration, 0);
  const joinCount = selectionCount === 0 ? 0 : (selectionCount > 0 && sliceGrid > 0 ? Math.ceil(selectionCount / sliceGrid) : 1);
  document.getElementById('fileNum').textContent = `${files.length}/${selectionCount}`;
  document.querySelector('.selection-count').textContent = ` ${selectionCount || '-'} `;
  document.querySelectorAll('.join-count').forEach(el => el.textContent = ` ${joinCount === 0 ? '-' : joinCount} `);
  document.getElementById('lengthHeaderLink').textContent = `Length (${secondsToMinutes(filesSelectedDuration)}/${secondsToMinutes(filesDuration)})`;
  try {
    document.querySelectorAll('tr').forEach(row => row.classList.remove('end-of-grid'));
    document.querySelectorAll('tr.checked').forEach(
        (row, i) => (i+1)%sliceGrid === 0 ? row.classList.add('end-of-grid') : row.classList.remove('end-of-grid'));

  } catch(e) {}
};

const getNiceFileName = (name, file, excludeExtension, includePath) => {
  let fname = file ? `${file.file.name.replace(/\.[^.]*$/,'')}${file.meta?.dupeOf ? '-d' : ''}${file.meta?.sliceNumber ? '-s' + file.meta.sliceNumber : ''}.wav`:
      name.replace(
      /\.syx$|\.wav$/, '');
  fname = (includePath && file.file.path) ? `${file.file.path.replace(/\//gi, '-')}` + fname : fname;
  return excludeExtension ? fname.replace(/\.[^.]*$/,'') : fname;
};

const drawWaveform = (file, el, channel, dimensions) => {
  let drawData = [];
  let drawResolution = Math.floor(file.buffer.length / 20);
  if (masterChannels === 2 && file.buffer.numberOfChannels > 1) { channel = 'S'; }
  drawResolution = drawResolution > 4096 ? 4096: drawResolution;
  for (let y = 0; y < file.buffer.length; y += Math.floor(file.buffer.length / drawResolution)) {
    if (channel === 'S') {
      drawData.push(
          (file.buffer.getChannelData(0)[y] + file.buffer.getChannelData(1)[y]) / 2
      );
    } else  {
      drawData.push(file.buffer.getChannelData((channel === 'R' ? 1 : 0))[y]);
    }
  }
  draw(drawData, file.meta.id, el, dimensions);
};

const renderList = () => {
  listEl.innerHTML = files.map( f => `
      <tr class="file-row ${f.meta.checked ? 'checked' : ''}" data-id="${f.meta.id}"
          onclick="digichain.handleRowClick(event, '${f.meta.id}')"
          onmousedown="digichain.handleRowClick(event, '${f.meta.id}')"  
          ondragstart="digichain.rowDragStart(event)" draggable="true">
        <td>
            <i class="gg-more-vertical"></i>
        </td>
        <td class="toggle-td">
            <button onclick="digichain.toggleCheck(event, '${f.meta.id}')" class="${f.meta.checked ? '' : 'button-outline'} check toggle-check">&nbsp;</button>
        </td>
        <td class="move-up-td">
            <button title="Move up in sample list." onclick="digichain.move(event, '${f.meta.id}', -1)" class="button-clear move-up"><i class="gg-chevron-up-r has-shift-mod-i"></i></button>
        </td>
        <td class="move-down-td">
            <button title="Move down in sample list." onclick="digichain.move(event, '${f.meta.id}', 1)" class="button-clear move-down"><i class="gg-chevron-down-r has-shift-mod-i"></i></button>
        </td>
        <td class="waveform-td">
            <canvas onclick="digichain.playFile(event, '${f.meta.id}')" class="waveform waveform-${f.meta.id}"></canvas>
        </td>
        <td class="file-path-td">
            <span class="file-path">${f.file.path}</span>
            <a title="Download processed wav file of sample." class="wav-link" onclick="digichain.downloadFile('${f.meta.id}', true)">${getNiceFileName(f.file.name)}</a>
            ${f.meta.dupeOf ? ' d' : ''}
            ${f.meta.sliceNumber ? ' s' + f.meta.sliceNumber : ''}
            <a class="wav-link-hidden" target="_blank"></a>
        </td>
        <td class="duration-td">
            <span>${f.meta.duration} s</span>
        </td>
        <td class="channel-options-td">
            <div class="channel-options has-shift-mod" style="display: ${f.buffer.numberOfChannels > 1 && masterChannels === 1 ? 'block' : 'none'}">
            <a title="Left channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'L')" class="${f.meta.channel === 'L' ? 'selected' : ''} channel-option-L">L</a>
            <a title="Sum to mono" onclick="digichain.changeChannel(event, '${f.meta.id}', 'S')" class="${f.meta.channel === 'S' ? 'selected' : ''} channel-option-S">S</a>
            <a title="Right channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'R')" class="${f.meta.channel === 'R' ? 'selected' : ''} channel-option-R">R</a>
            </div>
            <div class="channel-options channel-options-stereo" title="${f.buffer.numberOfChannels === 1 ? 'Mono sample' : 'Stereo sample'}" style="display: ${masterChannels === 2 ? 'block' : 'none'}">
                <i class="gg-shape-circle"></i>
                <i class="gg-shape-circle stereo-circle" style="display: ${f.buffer.numberOfChannels === 2 ? 'inline-block' : 'none'}"></i>
            </div>
        </td>
        <td class="split-td">
            <button title="Slice sample." onclick="digichain.splitAction(event, '${f.meta.id}')" class="button-clear split gg-menu-grid-r ${metaFiles.getByFile(f) ?'is-ot-file' : ''}"><i class="gg-menu-grid-r"></i></button>
        </td>
        <td class="duplicate-td">
            <button title="Duplicate sample." onclick="digichain.duplicate(event, '${f.meta.id}')" class="button-clear duplicate"><i class="gg-duplicate has-shift-mod-i"></i></button>
        </td>
        <td class="toggle-edit-td">
            <button title="Edit" onclick="digichain.showEditPanel(event, '${f.meta.id}')" class="button-clear toggle-edit"><i class="gg-pen"></i></button>
        </td>
        <td class="remove-td">
            <button title="Remove sample (double-click)." ondblclick="digichain.remove('${f.meta.id}')" class="button-clear remove"><i class="gg-trash"></i></button>
        </td>
      </tr>
    `).join('');
  if (files.length === 0) {
    listEl.innerHTML = '';
  }

  document.querySelectorAll('.waveform').forEach((el, i) => {
    if (files[i].waveform) {
      el.replaceWith(files[i].waveform);
    } else {
      drawWaveform(files[i], el, files[i].meta.channel);
      files[i].waveform = el;
    }
  });
  setCountValues();
  document.body.classList.remove('loading');
};
const bytesToInt = (bh, bm, bl) => {
  return ((bh & 0x7f) << 7 << 7) + ((bm & 0x7f) << 7) + (bl & 0x7f);
};

const parseOt = (fd, file, fullPath) => {
  const uuid = file.uuid || crypto.randomUUID();
  const getInt32 = values => {
    const arr = new Uint8Array(values);
    const view = new DataView(arr.buffer);
    return view.getInt32(0);
  };
  try {
    // Check header is correct.
    if (![0x46,0x4F,0x52,0x4D,0x00,0x00,0x00,0x00,0x44,0x50,0x53,0x31,0x53,0x4D,
      0x50,0x41].every(
          (b, i) => b === fd[i])
    ) {
      return { uuid, failed: true };
    }
    let slices = [];
    let sliceCount = getInt32 ([fd[826], fd[827], fd[828], fd[829]]);
    let t = 58;
    for (let s = 0; s < sliceCount; s++) {
      if (masterSR === 44100) {
        slices.push({
          startPoint: getInt32([fd[t], fd[t + 1], fd[t + 2], fd[t + 3]]),
          endPoint: getInt32([fd[t+4], fd[t+5], fd[t+6], fd[t+7]]),
          loopPoint: getInt32([fd[t+8], fd[t+9], fd[t+10], fd[t+11]])
        });
      } else {
        slices.push({
          startPoint: Math.round( (getInt32([fd[t], fd[t + 1], fd[t + 2], fd[t + 3]]) / 44100) * masterSR ),
          endPoint: Math.round( (getInt32([fd[t+4], fd[t+5], fd[t+6], fd[t+7]]) / 44100) * masterSR ),
          loopPoint: Math.round ((getInt32([fd[t+8], fd[t+9], fd[t+10], fd[t+11]]) / 44100) * masterSR )
        });
      }
      t = t + 12;
    }
    metaFiles.push({
      uuid,
      name: file.name,
      path: fullPath,
      sliceCount,
      slices
    });
    unsorted.push(uuid);
    return uuid;
  } catch(err) {
    return { uuid, failed: true };
  }
};
const parseSds = (fd, file, fullPath = '', pushToTop = false) => {
  const uuid = file.uuid || crypto.randomUUID();
  try {
    // Check header is correct.
    if (!(fd[0] === 240 && fd[1] === 126 && fd[3] === 1 && fd[20] === 247)) {
      return { uuid, failed: true };
    }
    const bitRate = fd[6];
    const sampleRate = Math.ceil(10e7 / bytesToInt(fd[9], fd[8], fd[7])) * 10;
    const length = bytesToInt(fd[12], fd[11], fd[10]);
    let loopStart = bytesToInt(fd[15], fd[14], fd[13]);
    let loopEnd = bytesToInt(fd[18], fd[17], fd[16]) + 1;
    const loopType = fd[19];

    if (loopType === 0x7f) { loopStart = loopEnd = length; }
    if (sampleRate < 4000 || sampleRate > 96000) { return false; }
    if (bitRate !== 16) { return false; }

    let idx = fd.findIndex(
        (x, i) => (x === 0xf0 && fd[i + 1] === 0x7e && fd[i + 3] === 0x02 &&
            fd[i + 126] === 0xf7));

    let lengthRead = 0;
    let data = [];

    while (lengthRead < length) {
      for (let t = (idx + 5); t < (idx + 125) && lengthRead < length; t += 3) {
        data[lengthRead++] = (((fd[t] << 9) | (fd[t + 1] << 2) |
            (fd[t + 2] >> 5)) - 0x8000);
      }
      idx = idx + 127;
    }

    const resample = new Resampler(sampleRate, masterSR, 1,
        data.filter(x => x !== undefined));
    resample.resampler(resample.inputBuffer.length);
    const audioArrayBuffer = audioCtx.createBuffer(
        1,
        resample.outputBuffer.length -
        ((resample.outputBuffer.length / 120) * 5),
        masterSR
    );
    resample.outputBuffer.filter(x => x !== undefined).
        forEach((y, i) => audioArrayBuffer.getChannelData(0)[i] = y / 32767);

    files[pushToTop ? 'unshift' : 'push']({
      file: {
        lastModified: file.lastModified,
        name: file.name,
        path: fullPath.replace(file.name, ''),
        size: file.size,
        type: file.type
      },
      buffer: audioArrayBuffer, meta: {
        length: resample.outputBuffer.length, loopStart, loopEnd, loopType,
        duration: Number(resample.outputBuffer.length / masterSR).toFixed(3),
        startFrame: 0, endFrame: resample.outputBuffer.length,
        checked: true, id: uuid
      }
    });
    unsorted.push(uuid);
    return uuid;
  } catch(err) {
    return { uuid, failed: true };
  }
};

const parseWav = (audioArrayBuffer, file, fullPath = '', pushToTop = false, checked = true) => {
  const uuid = file.uuid || crypto.randomUUID();
  try {
    /*duration, length, numberOfChannels, sampleRate*/
    files[pushToTop ? 'unshift' : 'push']({
      file: {
        lastModified: file.lastModified,
        name: file.name,
        path: fullPath.replace(file.name, ''),
        size: file.size,
        type: file.type
      },
      buffer: audioArrayBuffer, meta: {
        length: audioArrayBuffer.length,
        duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
        startFrame: 0, endFrame: audioArrayBuffer.length,
        checked: checked, id: uuid,
        channel: audioArrayBuffer.numberOfChannels > 1 ? 'L' : ''
      }
    });
    unsorted.push(uuid);
    return uuid;
  } catch (err) {
    return { uuid, failed: true };
  }
};

const renderListWhenReady = (count, fileCount) => {
  count = count.filter(c => c !== false);
  if (count.every(c => unsorted.includes(c))) {
    renderList();
  } else {
    setTimeout(() => renderListWhenReady(count), 1000);
  }
}

const setLoadingProgress = (count, total) => {
  const el = document.getElementById('loadingText');
  let progress = (count/total) * 100;
  el.style.backgroundImage = `linear-gradient(90deg, #cf8600 ${progress}%, #606c76 ${progress + 1}%, #606c76 100%)`;
};

const consumeFileInput = (inputFiles) => {
  document.getElementById('loadingText').textContent = 'Loading samples';
  document.body.classList.add('loading');
  const _files = [...inputFiles].filter(
      f => ['syx', 'wav', 'flac'].includes(f?.name?.split('.')?.reverse()[0].toLowerCase())
  );
  const _mFiles = [...inputFiles].filter(
      f => ['ot'].includes(f?.name?.split('.')?.reverse()[0].toLowerCase())
  );

  _mFiles.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      file.uuid = crypto.randomUUID();
      file.fullPath = file.fullPath || '';
      if (file.name.toLowerCase().endsWith('.ot')) {
        // binary data
        const buffer = e.target.result;
        const bufferByteLength = buffer.byteLength;
        const bufferUint8Array = new Uint8Array(buffer, 0, bufferByteLength);
        let result = parseOt(bufferUint8Array, file, file.fullPath);
      }
    };
    reader.readAsArrayBuffer(file);
  });
  if (_files.length === 0) {
    return renderList();
  }

  const checkCount = (idx) => {
    //count = count.filter(c => c !== false);
    //if (idx === _files.length - 1) {
      if (count.every(c => unsorted.includes(c))) {
        setTimeout(() => renderListWhenReady(count), 1000);
      } else {
       // setTimeout(() => renderListWhenReady(count), 1000);
      }
    //}
  };
  let count = [];

  _files.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      file.uuid = crypto.randomUUID();
      file.fullPath = file.fullPath || '';
      if (file.name.toLowerCase().endsWith('.syx')) {
        // binary data
        const buffer = e.target.result;
        const bufferByteLength = buffer.byteLength;
        const bufferUint8Array = new Uint8Array(buffer, 0, bufferByteLength);
        count.push(file.uuid);
        let result = parseSds(bufferUint8Array, file, file.fullPath);
        if (result.failed) {
          count.splice(count.findIndex(c => c === result.uuid ),1);
        }
        setLoadingProgress(idx + 1, _files.length);
        checkCount(idx, _files.length);
      }

      if ((file.name.toLowerCase().endsWith('.wav') || file.type === 'audio/wav') || file.name.toLowerCase().endsWith('.flac')) {
        count.push(file.uuid);
        audioCtx.decodeAudioData(e.target.result, data => {
          let result = parseWav(data, file, file.fullPath);
          if (result.failed) {
            count.splice(count.findIndex(c => c === result.uuid ),1);
          }
          setLoadingProgress(idx + 1, _files.length);
          checkCount(idx, _files.length);
        });
      }
    };
    reader.readAsArrayBuffer(file);
  });

};

uploadInput.addEventListener(
    'change',
    () => consumeFileInput(uploadInput.files),
    false
);

document.body.addEventListener(
    'dragover',
    (event) => {
      event.preventDefault();
    },
    false
);

document.body.addEventListener(
    'drop',
    (event) => {
      event.preventDefault();
      if (event?.dataTransfer?.items?.length && event?.dataTransfer?.items[0].kind === 'string') {
        try {
          event?.dataTransfer?.items[0].getAsString(async link => {
            let linkedFile = await fetch(link);
            if (!linkedFile.url.includes('.wav')) { return ; } // probably not a wav file
            let buffer = await linkedFile.arrayBuffer();
            await audioCtx.decodeAudioData(buffer, data => parseWav(data, {
              lastModified: new Date().getTime(), name: linkedFile.url.split('/').reverse()[0],
              size: ((masterBitDepth * masterSR * (buffer.length / masterSR)) / 8) * buffer.numberOfChannels /1024,
              type: 'audio/wav'
            }, '', true));
            renderList();
          });
          return;
        } catch (e) {}
      }
      if (event?.dataTransfer?.items?.length) {
        let toConsume = [];
        let total = event.dataTransfer.items.length;
        toConsume.count = 0;
        const addItem = item => {
          if (item.isFile) {
            item.file(
                (file) => {
                  file.fullPath = item.fullPath.replace('/', '');
                  toConsume.push(file);
                }
            );
            toConsume.count++;
            total--;
          } else if (item.isDirectory) {
            const dirReader = item.createReader();
            dirReader.readEntries(entries => {
              total += entries.length;
              for (const entry of entries) {
                addItem(entry);
              }
              total--;
            });
          }
        }
        for (const entry of event.dataTransfer.items) {
          const itemAsEntry = entry.getAtEntry ? entry.getAtEntry() : entry.webkitGetAsEntry();
          if (itemAsEntry) {
            addItem(itemAsEntry);
          }
        }
        let doneInterval = setInterval(() => {
          if (total <= 0 && toConsume.count === toConsume.length) {
            clearInterval(doneInterval);
            consumeFileInput(toConsume);
          }
        }, 500);
      } else {
        let target = event.target;
        while (!target.classList.contains('file-row')) {
          target = target.parentElement || document.body;
          target = target.nodeName === 'THEAD' ? document.querySelector('tr.file-row') : target;
          target = target === document.body ? document.querySelector('tr.file-row:last-of-type') : target;
        }
        if (target) {
          let selectedRowId = getFileIndexById(lastSelectedRow.dataset.id);
          let targetRowId = getFileIndexById(target.dataset.id);
          let item = files.splice(selectedRowId, 1)[0];
          files.splice(targetRowId, 0, item);
          targetRowId === 0 ? target.before(lastSelectedRow) : target.after(lastSelectedRow);
        }
      }
    },
    false
);

document.body.addEventListener('keyup', (event) => {
  if (!event.shiftKey) { document.body.classList.remove('shiftKey-down'); }
  if (!event.ctrlKey) { document.body.classList.remove('ctrlKey-down'); }
});

document.body.addEventListener('keydown', (event) => {
  const eventCodes = ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'KeyG', 'KeyH', 'KeyI', 'KeyL', 'KeyP', 'KeyR', 'KeyS', 'KeyX' ];
  if (keyboardShortcutsDisabled) { return ; }
  if (event.shiftKey) { document.body.classList.add('shiftKey-down'); }
  if (event.ctrlKey) { document.body.classList.add('ctrlKey-down'); }
  if (event.code === 'ArrowDown' && (!lastSelectedRow || !lastSelectedRow.isConnected)) {
    lastSelectedRow = document.querySelector('#fileList tr');
    return;
  }
  if (event.code === 'Escape') {
    if (files.length && !(event.shiftKey || modifierKeys.shiftKey)) {
      files.forEach(f => f.source?.stop());
    }
    return closePopUps();
  }
  if (arePopUpsOpen()) {
    // Don't listen for keyboard commands when popups are open.
    return ;
  }
  if (files.length &&  (event.code === 'KeyI')) {
    return invertFileSelection();
  }
  if (event.code === 'KeyH' && (event.shiftKey || modifierKeys.shiftKey)) {
    toggleOptionsPanel();
  }
  if (event.code === 'KeyG' && (event.shiftKey || modifierKeys.shiftKey)) {
    document.body.classList.contains('grid-view') ? document.body.classList.remove('grid-view') : document.body.classList.add('grid-view');
  }
  if (eventCodes.includes(event.code) && lastSelectedRow && lastSelectedRow?.isConnected) {
    if (event.code === 'ArrowDown' && lastSelectedRow.nextElementSibling) {
      if (!(event.shiftKey || modifierKeys.shiftKey)) { return handleRowClick(event, lastSelectedRow.nextElementSibling.dataset.id); }
      let idx = getFileIndexById(lastSelectedRow.dataset.id);
      let item = files.splice(idx, 1)[0];
      files.splice(idx + 1, 0, item);
      lastSelectedRow.nextElementSibling.after(lastSelectedRow);
      lastSelectedRow.scrollIntoViewIfNeeded();
      setCountValues();
    } else if (event.code === 'ArrowUp' && lastSelectedRow.previousElementSibling) {
      if (!(event.shiftKey || modifierKeys.shiftKey)) { return handleRowClick(event, lastSelectedRow.previousElementSibling.dataset.id); }
      let idx = getFileIndexById(lastSelectedRow.dataset.id);
      let item = files.splice(idx, 1)[0];
      files.splice(idx - 1, 0, item);
      lastSelectedRow.previousElementSibling.before(lastSelectedRow);
      lastSelectedRow.scrollIntoViewIfNeeded();
      setCountValues();
    } else if (event.code === 'Enter') {
      toggleCheck(event, lastSelectedRow.dataset.id);
    } else if (event.code === 'KeyP') {
      playFile(event, lastSelectedRow.dataset.id);
    } else if (masterChannels === 1 && (event.code === 'KeyL' || event.code === 'KeyR' || event.code === 'KeyS')) {
      const item = getFileById(lastSelectedRow.dataset.id);
      if (item.meta.channel) {
        changeChannel(event, lastSelectedRow.dataset.id, event.code.replace('Key', ''));
      }
    }
  }
});
/*Expose properties/methods used in html events to the global scope.*/
window.digichain = {
  sliceOptions,
  changeAudioConfig,
  removeSelected,
  sort,
  renderList,
  joinAll: joinAllUICall,
  selectSliceAmount,
  showInfo,
  toggleCheck,
  move,
  playFile,
  stopPlayFile,
  downloadFile,
  downloadAll,
  changeChannel,
  duplicate,
  remove,
  handleRowClick,
  rowDragStart,
  splitAction,
  splitEvenly,
  splitSizeAction,
  toggleModifier,
  toggleOptionsPanel,
  showExportSettingsPanel,
  showEditPanel,
  pitchExports,
  normalize,
  trimRight,
  perSamplePitch,
  reverse,
  toggleReadOnlyInput,
  toggleSetting,
  updateFile,
  changeEditPoint
};
