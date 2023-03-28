import { Resampler, audioBufferToWav } from './resources.js';

const uploadInput = document.getElementById('uploadInput');
const listEl = document.getElementById('fileList');
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
let audioCtx = new AudioContext({sampleRate: masterSR});
let files = [];
let unsorted = [];
let lastSort = '';
let lastSelectedRow;
let sliceGrid = 0;
let sliceOptions = Array.from(DefaultSliceOptions);
let modifierKeys = {
  shiftKey: false,
  ctrlKey: false
};

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

function setWavLink(file, linkEl) {
  const fileName = getNiceFileName('', file);
  const wav = audioBufferToWav(file.buffer, file.meta, masterSR, masterBitDepth, masterChannels);
  const blob = new window.Blob([new DataView(wav)], {
    type: 'audio/wav',
  });

  linkEl.href = URL.createObjectURL(blob);
  linkEl.setAttribute('download', fileName);
  return linkEl;
}

async function downloadAll() {
  const _files = files.filter(f => f.meta.checked);
  const links = [];
  if (_files.length > 5) {
    const userReadyForTheCommitment = confirm(`You are about to download ${_files.length} files, that will show ${_files.length} pop-ups one after each other..\n\nAre you ready for that??`);
    if (!userReadyForTheCommitment) { return; }
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

function downloadFile(id) {
  const el = getRowElementById(id).querySelector('.wav-link-hidden');
  const file = getFileById(id);
  const link = setWavLink(file, el);
  return link;
}

function removeSelected() {
  files.forEach(f => f.meta.checked ? f.source?.stop() : '' );
  files = files.filter(f => !f.meta.checked);
  unsorted = unsorted.filter(id => files.find(f => f.meta.id === id));
  renderList();
}

function showInfo() {
  const description = document.querySelector('meta[name=description]').content;
  const infoPanelContent = document.querySelector('.info-panel-md .content');
  infoPanelContent.innerHTML = `
    <h3>DigiChain</h3>
    <p>${description}</p>
    <p class="float-right"><a href="https://brianbar.net/" target="_blank">Brian Barnett</a>
    (<a href="https://www.youtube.com/c/sfxBrian" target="_blank">sfxBrian</a> / <a href="https://github.com/brian3kb" target="_blank">brian3kb</a>) </p>
`;
  document.querySelector('.info-panel-md').style.display = 'block';
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

function joinAll(event, pad = false, filesRemaining = [], fileCount = 0, toInternal = false) {
  if (files.length === 0) { return; }
  if ((event.shiftKey || modifierKeys.shiftKey)) { toInternal = true; }
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
  const fileData = {file: {name: `joined_${pad ? 'spaced_' : ''}${fileCount+1}.wav`}, buffer: audioArrayBuffer, meta: {}};
  if (toInternal) {
    // parseWav(audioArrayBuffer, {
    //   lastModified: new Date().getTime(), name: `resample_${pad ? 'spaced_' : ''}${fileCount+1}.wav`,
    //   size: ((masterBitDepth * masterSR * (audioArrayBuffer.length / masterSR)) / 8) * audioArrayBuffer.numberOfChannels /1024,
    //   type: 'audio/wav'
    // });
    setWavLink(fileData, joinedEl);
    const wav = audioBufferToWav(fileData.buffer, fileData.meta, masterSR, masterBitDepth, masterChannels);
    const blob = new window.Blob([new DataView(wav)], {
      type: 'audio/wav',
    });
    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(blob);
    fileReader.fileCount = fileCount;

    fileReader.onload = (e) => {
      audioCtx.decodeAudioData(e.target.result, function(buffer) {
        parseWav(buffer, {
          lastModified: new Date().getTime(), name: `resample_${pad ? 'spaced_' : ''}${fileReader.fileCount+1}.wav`,
          size: ((masterBitDepth * masterSR * (buffer.length / masterSR)) / 8) * buffer.numberOfChannels /1024,
          type: 'audio/wav'
        });
        renderList();
      })
    };

  } else {
    setWavLink(fileData, joinedEl).click();
  }
  if (filesRemaining.length > 0) {
    fileCount++;
    joinAll(event, pad, filesRemaining, fileCount, toInternal);
  } else {
    renderList();
  }
}

const playFile = (event, id, loop) => {
  const file = getFileById(id);
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
  const el = getRowElementById(id).querySelector('.toggle-check');
  const file = getFileById(id);
  event.preventDefault();
  file.meta.checked = !file.meta.checked;
  file.meta.checked ? el.classList.remove('button-outline') : el.classList.add('button-outline');
  if (!file.meta.checked) {
    file.source?.stop();
  }
  lastSort = '';
  setCountValues();
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
  file.waveform.getContext('2d').clear();
  drawWaveform(file, file.waveform, file.buffer.numberOfChannels);
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
  const fileIdx = getFileIndexById(id);
  const item = Object.assign({}, file);
  item.meta = Object.assign({}, file.meta);
  item.meta.dupeOf = id;
  item.waveform = false;
  item.meta.id = crypto.randomUUID();
  files.splice(((event.shiftKey || modifierKeys.shiftKey) ? files.length : fileIdx + 1), 0, item);
  unsorted.push(item.meta.id);
  renderList();
};
const splitEvenly = (event, id, slices) => {
  const file = getFileById(id);
  const frameSize = file.buffer.length / slices;
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
    files.push(slice);
    unsorted.push(uuid);
  }
  renderList();
}

const remove = (id) => {
  const fileIdx = getFileIndexById(id);
  files.splice(fileIdx, 1);
  const unsortIdx = unsorted.findIndex(uuid => uuid === id);
  unsorted.splice(unsortIdx, 1);
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
  if (lastSelectedRow) { lastSelectedRow.classList.remove('selected'); }
  row.classList.add('selected');
  lastSelectedRow = row;
  lastSelectedRow.scrollIntoViewIfNeeded();
};

const rowDragStart = (event) => {
  if (event.target?.classList?.contains('file-row')) {
    lastSelectedRow = event.target;
  }
};

const splitAction = (event, id, slices) => {
  const el = document.getElementById('splitOptions');
  const fileNameEl = document.getElementById('splitFileName');
  let item;
  if (id) {
    lastSelectedRow = getRowElementById(id);
  }
  item = getFileById(id || lastSelectedRow.dataset.id);
  if (slices) {
    id = id || item.meta.id;
    splitEvenly(event, id, slices);
    return el.style.display = 'none';
  }
  fileNameEl.textContent = getNiceFileName('', item, true);
  el.style.display = 'block';
};

const draw = (normalizedData, id, canvas) => {
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
  canvas.width = 150; //canvas.offsetWidth * dpr;
  canvas.height = 60;// (canvas.offsetHeight + padding * 2) * dpr;
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
  document.getElementById('fileNum').textContent = `${files.length}/${selectionCount}`;
  document.querySelector('.selection-count').textContent = ` ${selectionCount || '-'} `;
  document.querySelectorAll('.join-count').forEach(el => el.textContent = ` ${selectionCount === 0 ? '-' : (selectionCount > 0 && sliceGrid > 0 ? Math.ceil(selectionCount / sliceGrid) : '1')} `);
  document.getElementById('lengthHeaderLink').textContent = `Length (${secondsToMinutes(filesSelectedDuration)}/${secondsToMinutes(filesDuration)})`;
};

const getNiceFileName = (name, file, excludeExtension) => {
  const fname = file ? `${file.file.name.replace(/\.[^.]*$/,'')}${file.meta?.dupeOf ? '-d' : ''}${file.meta?.sliceNumber ? '-s' + file.meta.sliceNumber : ''}.wav`:
      name.replace(
      /\.syx$|\.wav$/, '');
  return excludeExtension ? fname.replace(/\.[^.]*$/,'') : fname;
};

const drawWaveform = (file, el, channel) => {
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
  draw(drawData, file.meta.id, el);
};

const renderList = () => {
  listEl.innerHTML = files.map( f => `
      <tr class="file-row" data-id="${f.meta.id}"
          onclick="digichain.handleRowClick(event, '${f.meta.id}')"
          onmousedown="digichain.handleRowClick(event, '${f.meta.id}')"  
          ondragstart="digichain.rowDragStart(event)" draggable="true">
        <td>
            <i class="gg-more-vertical"></i>
        </td>
        <td>
            <button onclick="digichain.toggleCheck(event, '${f.meta.id}')" class="${f.meta.checked ? '' : 'button-outline'} check toggle-check">&nbsp;</button>
        </td>
        <td>
            <button title="Move up in sample list." onclick="digichain.move(event, '${f.meta.id}', -1)" class="button-clear move-up"><i class="gg-chevron-up-r has-shift-mod-i"></i></button>
        </td>
        <td>
            <button title="Move down in sample list." onclick="digichain.move(event, '${f.meta.id}', 1)" class="button-clear move-down"><i class="gg-chevron-down-r has-shift-mod-i"></i></button>
        </td>
        <td>
            <canvas onclick="digichain.playFile(event, '${f.meta.id}')" class="waveform waveform-${f.meta.id}"></canvas>
        </td>
        <td>
            <a title="Download processed wav file of sample." class="wav-link" onclick="digichain.downloadFile('${f.meta.id}').click()">${getNiceFileName(f.file.name)}</a>
            ${f.meta.dupeOf ? ' d' : ''}
            ${f.meta.sliceNumber ? ' s' + f.meta.sliceNumber : ''}
            <a class="wav-link-hidden" target="_blank"></a>
        </td>
        <td>
            <span>${f.meta.duration} s</span>
        </td>
        <td>
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
        <td>
            <button title="Slice sample." onclick="digichain.splitAction(event, '${f.meta.id}')" class="button-clear split gg-menu-grid-r"><i class="gg-menu-grid-r"></i></button>
        </td>
        <td>
            <button title="Duplicate sample." onclick="digichain.duplicate(event, '${f.meta.id}')" class="button-clear duplicate"><i class="gg-duplicate has-shift-mod-i"></i></button>
        </td>
        <td>
            <button title="Remove sample (double-click)." ondblclick="digichain.remove('${f.meta.id}')" class="button-clear remove"><i class="gg-trash"></i></button>
        </td>
      </tr>
    `).join('');
  if (files.length === 0) {
    listEl.innerHTML = `<tr><td colspan="9" class="no-files"><h4>Load/Drag in some samples to get started...</h4></td></tr>`;
  }

  document.querySelectorAll('.waveform').forEach((el, i) => {
    if (files[i].waveform) {
      el.replaceWith(files[i].waveform);
    } else {
      //draw([...files[i].buffer.getChannelData(0)].filter((x, i) => !(i /50 % 1)), files[i].meta.id);
      drawWaveform(files[i], el, files[i].buffer.numberOfChannels);
      files[i].waveform = el;
    }
  });
  setCountValues();
  document.body.classList.remove('loading');
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

  let idx = fd.findIndex(
      (x, i) => (x === 0xf0 && fd[i + 1] === 0x7e && fd[i + 3] === 0x02 && fd[i + 126] === 0xf7));

  let lengthRead = 0;
  let data = [];

  while (lengthRead < length) {
    for (let t = (idx + 5); t < (idx + 125) && lengthRead < length; t += 3) {
      data[lengthRead++] = (((fd[t] << 9) | (fd[t + 1] << 2) | (fd[t + 2] >> 5)) - 0x8000);
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
    file: { lastModified: file.lastModified, name: file.name, size: file.size, type: file.type },
    buffer: audioArrayBuffer, meta: {
      length: resample.outputBuffer.length, loopStart, loopEnd, loopType,
      duration: Number(resample.outputBuffer.length / masterSR).toFixed(3),
      startFrame: 0, endFrame: resample.outputBuffer.length,
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
    file: { lastModified: file.lastModified, name: file.name, size: file.size, type: file.type },
    buffer: audioArrayBuffer, meta: {
      length: audioArrayBuffer.length,
      duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
      startFrame: 0, endFrame: audioArrayBuffer.length,
      checked: true, id: uuid,
      channel: audioArrayBuffer.numberOfChannels > 1 ? 'L': ''
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

const setLoadingProgress = (count, total) => {
  const el = document.getElementById('loadingText');
  let progress = (count/total) * 100;
  el.style.backgroundImage = `linear-gradient(90deg, #cf8600 ${progress}%, #606c76 ${progress + 1}%, #606c76 100%)`;
};

const consumeFileInput = (files) => {
  let count = [];
  document.body.classList.add('loading');
  [...files].forEach((file, idx) => {
    var reader = new FileReader();
    reader.onload = async function(e) {
      if (file.name.toLowerCase().endsWith('.syx')) {
        // binary data
        const buffer = e.target.result;
        const bufferByteLength = buffer.byteLength;
        const bufferUint8Array = new Uint8Array(buffer, 0, bufferByteLength);
        count.push(parseSds(bufferUint8Array, file));
        setLoadingProgress(idx + 1, files.length);
      }

      if (file.name.toLowerCase().endsWith('.wav')) {
        await audioCtx.decodeAudioData(e.target.result, data => {
          count.push(parseWav(data, file));
          setLoadingProgress(idx + 1, files.length);
        });
      }
    };
    reader.readAsArrayBuffer(file);
  });
  setTimeout(() => renderListWhenReady(count), 500);
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
      if (event?.dataTransfer?.files?.length) {
        consumeFileInput(event.dataTransfer.files);
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
  const eventCodes = ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'KeyL', 'KeyR', 'KeyS', 'KeyP', 'KeyI'];
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
    return document.querySelectorAll('.pop-up').forEach(w => w.style.display = 'none');
  }
  if (files.length && (event.code === 'KeyI')) {
    return invertFileSelection();
  }
  if (eventCodes.includes(event.code) && lastSelectedRow && lastSelectedRow?.isConnected) {
    if (event.code === 'ArrowDown' && lastSelectedRow.nextElementSibling) {
      if (!(event.shiftKey || modifierKeys.shiftKey)) { return handleRowClick(event, lastSelectedRow.nextElementSibling.dataset.id); }
      let idx = getFileIndexById(lastSelectedRow.dataset.id);
      let item = files.splice(idx, 1)[0];
      files.splice(idx + 1, 0, item);
      lastSelectedRow.nextElementSibling.after(lastSelectedRow);
      lastSelectedRow.scrollIntoViewIfNeeded();
    } else if (event.code === 'ArrowUp' && lastSelectedRow.previousElementSibling) {
      if (!(event.shiftKey || modifierKeys.shiftKey)) { return handleRowClick(event, lastSelectedRow.previousElementSibling.dataset.id); }
      let idx = getFileIndexById(lastSelectedRow.dataset.id);
      let item = files.splice(idx, 1)[0];
      files.splice(idx - 1, 0, item);
      lastSelectedRow.previousElementSibling.before(lastSelectedRow);
      lastSelectedRow.scrollIntoViewIfNeeded();
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
  joinAll,
  selectSliceAmount,
  showInfo,
  toggleCheck,
  move,
  playFile,
  downloadFile,
  downloadAll,
  changeChannel,
  duplicate,
  remove,
  handleRowClick,
  rowDragStart,
  splitAction,
  splitEvenly,
  toggleModifier
};


