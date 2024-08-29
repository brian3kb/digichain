/*!
DigiChain v1.4.15-latest [ https://digichain.brianbar.net/ ]
<https://github.com/brian3kb/digichain>

(c) 2023 Brian Barnett <me [at] brianbar.net>
[ @brian3kb ]
Licenced under GPLv3 <https://github.com/brian3kb/digichain/blob/main/LICENSE>

DigiChain bundled resources:
[MIT license] JSZip  : <https://github.com/Stuk/jszip/blob/main/LICENSE.markdown>
[MIT license] Pako : <https://github.com/nodeca/pako/blob/main/LICENSE>
[MIT license] Modified version of Audiobuffer-to-wav : <https://github.com/Experience-Monks/audiobuffer-to-wav/blob/master/LICENSE.md>
[MIT license] Modified version of Audiobuffer-to-aiff : <https://github.com/hunjunior/audiobuffer-to-aiff/blob/master/LICENSE>

Brian referenced the following during development:
[BSD-3] MIDI-SDS, for how the Machine Drum stores audio data in syx files : <https://github.com/eh2k/uwedit/blob/master/core/MidiSDS.cpp> / <https://github.com/eh2k/uwedit/blob/master/LICENSE.txt>
[Unlicense] OctaChainer, how to read/write .ot binary files correctly : <https://github.com/KaiDrange/OctaChainer/blob/master/otwriter.cpp> / <https://github.com/KaiDrange/OctaChainer/blob/master/License.txt>
Tips and Tricks on drawing array buffers to the canvas element: <https://css-tricks.com/making-an-audio-waveform-visualizer-with-vanilla-javascript/>
[MIT License] Basic beat detection : https://github.com/JMPerez/beats-audio-api/blob/gh-pages/script.js / http://joesul.li/van/beat-detection-using-web-audio/
*/
import {
    Resampler,
    audioBufferToWav,
    encodeOt,
    getAifSampleRate,
    joinToMono,
    joinToStereo,
    bufferToFloat32Array,
    getSupportedSampleRates, detectTempo
} from './resources.js';
import {
    editor,
    showEditor,
    drawWaveform,
    getNiceFileName,
    setEditorConf,
    getUniqueName
} from './editor.js';

const uploadInput = document.getElementById('uploadInput');
const listEl = document.getElementById('fileList');
const infoEl = document.getElementById('infoIndicator');
const supportedAudioTypes = ['syx', 'wav', 'flac', 'aif', 'webm', 'm4a', 'pti', 'mp3'];
const DefaultSliceOptions = [0, 4, 8, 16, 32, 64, 128];
const importFileLimitValue = 750;
let db, dbReq;
let masterSR = 48000; /*The working sample rate*/
let targetSR = 48000; /*The target sample rate, what rendered files will output at.*/
let masterBitDepth = 16;
let masterChannels = 1;
let targetContainer = 'w';
let supportedSampleRates = JSON.parse(localStorage.getItem('supportedSampleRates')) ??
  getSupportedSampleRates();
let lastUsedAudioConfig = localStorage.getItem('lastUsedAudioConfig') ??
  '48000m16w';
let restoreLastUsedAudioConfig = JSON.parse(
  localStorage.getItem('restoreLastUsedAudioConfig')) ?? true;
let retainSessionState = JSON.parse(
    localStorage.getItem('retainSessionState')) ?? true;
let pitchModifier = JSON.parse(localStorage.getItem('pitchModifier')) ?? 1;
let reverseEvenSamplesInChains = JSON.parse(
  localStorage.getItem('reverseEvenSamplesInChains')) ?? false;
let playWithPopMarker = JSON.parse(
  localStorage.getItem('playWithPopMarker')) ?? 0;
let zipDownloads = JSON.parse(localStorage.getItem('zipDownloads')) ?? true;
let embedSliceData = JSON.parse(localStorage.getItem('embedSliceData')) ??
  true;
let embedCuePoints = JSON.parse(localStorage.getItem('embedCuePoints')) ??
  true;
let embedOrslData = JSON.parse(localStorage.getItem('embedOrslData')) ??
  false;
let showTouchModifierKeys = JSON.parse(
  localStorage.getItem('showTouchModifierKeys')) ?? false;
let exportWithOtFile = JSON.parse(
  localStorage.getItem('exportWithOtFile')) ?? false;
let darkModeTheme = JSON.parse(
  localStorage.getItem('darkModeTheme')) ?? true;
let normalizeContrast = JSON.parse(
  localStorage.getItem('normalizeContrast')) ?? false;
let importFileLimit = JSON.parse(
  localStorage.getItem('importFileLimit')) ?? true;
let skipMiniWaveformRender = JSON.parse(
  localStorage.getItem('skipMiniWaveformRender')) ?? false;
let attemptToFindCrossingPoint = JSON.parse(
  localStorage.getItem('attemptToFindCrossingPoint')) ?? false;
let deClick = JSON.parse(
  localStorage.getItem('deClick')) ?? 0.4;
let treatDualMonoStereoAsMono = JSON.parse(
  localStorage.getItem('treatDualMonoStereoAsMono')) ?? true;
let shiftClickForFileDownload = JSON.parse(
  localStorage.getItem('shiftClickForFileDownload')) ?? false;
let secondsPerFile = 0;
let audioCtx;
let files = [];
let unsorted = [];
let importOrder = [];
let metaFiles = [];
let mergeFiles = [];
let chainFileNames = []; //{ name: '', used: false }
let lastSort = '';
let lastSelectedRow;
let lastLastSelectedRow;
let lastSliceFileImport = []; // [].enabledTracks = {t[x]: boolean}
let lastOpKit = [];
let workBuffer;
let sliceGrid = 0;
let sliceOptions = Array.from(DefaultSliceOptions);
let lastSliceOptions = Array.from(sliceOptions);
let keyboardShortcutsDisabled = false;
let showSamplesList = true;
let modifierKeys = {
    shiftKey: false,
    ctrlKey: false
};

metaFiles.getByFileName = function(filename) {
    let found = this.find(m => m.name.replace(/\.[^.]*$/, '') ===
      filename.replace(/\.[^.]*$/, ''));
    if (!found && filename.endsWith('.flac')) {
        found = this.find(m => filename.includes(`(${m.name})`));
    }
    if (filename === '---sliceToTransientCached---' && !found) {
        found = {
            uuid: crypto.randomUUID(),
            name: '---sliceToTransientCached---',
            sliceCount: 0,
            slices: []
        };
        metaFiles.push(found);
    }
    return found;
};
metaFiles.getByFile = function(file) {
    if (file.meta.slicedFrom) { return false; }
    const found = this.find(m => m.name.replace(/\.[^.]*$/, '') ===
      file.file.name.replace(/\.[^.]*$/, ''));
    if (found) { return found; }
    if (file.meta.op1Json && file.meta.op1Json.start) {
        let opSlices = file.meta.op1Json.start.map(
          (s, i) => ({
              startPoint: s,
              endPoint: file.meta.op1Json.end[i],
              p: file.meta.op1Json.pan[i],
              pab: file.meta.op1Json.pan_ab[i],
              st: file.meta.op1Json.pitch[i]
          })).reduce((acc, curr, idx) => {
            if (acc?.pos && acc.pos > -1) {
                if (curr.endPoint > acc.pos) {
                    acc.result.push(curr);
                    acc.pos = curr.endPoint;
                }
            } else {
                acc.pos = acc.pos ?? curr.endPoint;
                acc.result.push(curr);
            }
            return acc;
        }, {result: []}).result;
        return {
            uuid: file.meta.uuid,
            name: file.file.name,
            path: file.file.path,
            cssClass: 'is-op-file',
            sliceCount: opSlices.length,
            slices: opSlices
        };
    } else if (file.meta.customSlices) {
        return {
            uuid: file.meta.uuid,
            name: file.file.name,
            path: file.file.path,
            cssClass: 'is-dc-file',
            sliceCount: file.meta.customSlices.sliceCount,
            slices: file.meta.customSlices.slices
        };
    } else if (file.meta.slices) {
        return {
            uuid: file.meta.uuid,
            name: file.file.name,
            path: file.file.path,
            cssClass: 'is-dc-file',
            otLoop: file.meta.otLoop??0,
            otLoopStart: file.meta.otLoopStart??0,
            sliceCount: file.meta.slices.length,
            slices: file.meta.slices.map(
              slice => ({
                  startPoint: slice.s,
                  endPoint: slice.e,
                  loopPoint: slice.l ?? -1,
                  name: slice.n || slice.name || '',
                  p: slice.p ?? 16384,
                  pab: slice.pab ?? false,
                  st: slice.st ?? 0
              })
            )
        };
    }
};
metaFiles.getByFileInDcFormat = function(file) {
    return (
      file === '---sliceToTransientCached---' ?
        metaFiles.getByFileName('---sliceToTransientCached---') :
        metaFiles.getByFile(file) || {slices: []}).slices.map(slice => {
            let _slice = {
                s: slice.startPoint,
                e: slice.endPoint,
                l: slice.loopPoint,
                n: slice.name || ''
            };
            ['p', 'pab', 'st'].forEach(k => {
                if (slice[k]??false) { return ; }
                _slice[k] = slice[k];
            });
            return _slice;
    });
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
        unsorted = unsorted.filter(id => id !== idx);

    }
};

function removeMetaFile(id) {
    const file = getFileById(id);
    if (!file) { return; }
    metaFiles.removeByName(file.file.filename);
    if (file.meta.op1Json) {
        delete file.meta.op1Json;
    }
}

function getSlicesFromMetaFile(file) {
    return metaFiles.getByFileInDcFormat(file);
}

function checkAndSetAudioContext() {
    if (!audioCtx || audioCtx.sampleRate !== masterSR) {
        audioCtx = new AudioContext(
          {sampleRate: masterSR, latencyHint: 'interactive'});
        setEditorConf({
            audioCtx,
            masterSR,
            masterChannels,
            masterBitDepth
        });
    }
}

function setAudioOptionsFromCommonConfig(event) {
    const configString = event.target.value;
    if (configString === 'none') {
        return ;
    }
    const defaults = [48000, 'm', 16, 'w', ...DefaultSliceOptions];
    let configValues = configString ? configString.match(/^\d+|[ms]|\d+|[wa]/g) : defaults;
    document.getElementById(`acoContainer${configValues[3]}`).click();
    document.getElementById('settingsSampleRate').value = +configValues[0];
    document.getElementById(`acoChannel${configValues[1]}`).click();
    document.getElementById(`acoBitDepth${configValues[2]}`).click();
    configValues.slice(4).forEach((g, i) => i > 0 ?document.getElementById(`gridSize${+i}`).value = +g : '');
    if (files.length === 0) {
        document.getElementById('settingsWorkingSampleRate').value = +configValues[0];
    }
}

async function changeAudioConfig(configString = '', onloadRestore = false) {
    const settingsPanelEl = document.getElementById('exportSettingsPanel');
    const configOptionsEl = document.getElementById('audioConfigOptions');
    const audioValuesFromCommonSelectEl = document.getElementById('audioValuesFromCommonSelect');
    const defaults = [48000, 'm', 16, 'w', ...DefaultSliceOptions];
    let configValues = configString ? configString.match(/^\d+|[ms]|\d+|[wa]/g) : defaults;
    configValues = configValues.length === 11 ? configValues : defaults;
    let configData = configString && configValues.length === 11? {
        sr: +configValues[0],
        c: configValues[1],
        bd: +configValues[2],
        f: configValues[3],
        go: configValues.slice(4)
    } : {
        sr: +document.getElementById('settingsSampleRate').value,
        c: +document.getElementById('channelsGroup').dataset.channels === 1 ? 'm' : 's',
        bd: +document.getElementById('bitDepthGroup').dataset.bitDepth,
        f: document.getElementById('targetContainerGroup').dataset.container,
        go: [0, ...[...document.querySelectorAll('.acoSliceGridOption')].map(go => +go.value)]
    };

    let workingSR = +(document.getElementById('settingsWorkingSampleRate')?.value || localStorage.getItem('workingSampleRate') || 48000);

    if (audioValuesFromCommonSelectEl) {
        audioValuesFromCommonSelectEl.value = 'none';
    }

    if (configData.f === 'a') {
        configData.sr = 44100;
        configData.bd = 16;
    }

    if (configData.sr < supportedSampleRates[0] || configData.sr > supportedSampleRates[1]) {
        alert(
          `ERROR: The sample rate ${configData.sr}Hz is not supported by your browser.\n\nPlease select a sample rate between ${supportedSampleRates[0]}Hz and ${supportedSampleRates[1]}Hz`);
        return false;
    }
    if (workingSR < supportedSampleRates[0] || workingSR > supportedSampleRates[1]) {
        alert(
          `ERROR: The sample rate ${workingSR}Hz is not supported by your browser.\n\nPlease select a sample rate between ${supportedSampleRates[0]}Hz and ${supportedSampleRates[1]}Hz`);
        return false;
    }

    if (files.length > 0 && workingSR !== masterSR) {
        let conf = confirm(
          `Frequently changing audio working sample rate can degrade the audio quality, particularly in the transients and higher frequencies.\n\n Do you want to continue?`);
        if (!conf) {
            return false;
        }
    }
    document.body.classList.add('loading');
    const selectionString = `${configData.f === 'a' ? 'AIF ' : ''}${configData.sr/1000}kHz/${configData.bd}BIT ${configData.c === 'm' ? 'MONO' : 'STEREO'}`;
    configOptionsEl.value = selectionString;

    const selection = `${configData.sr}${configData.c}${configData.bd}${configData.f}${configData.go.join('-')}`;
    lastUsedAudioConfig = selection;
    localStorage.setItem('lastUsedAudioConfig', selection);
    localStorage.setItem('workingSampleRate', `${workingSR}`);

    let resampleState = false;
    if (workingSR !== masterSR && !onloadRestore) {
        resampleState = true;
    }
    masterSR = workingSR;
    targetSR = configData.sr;
    masterBitDepth = configData.bd;
    masterChannels = configData.c === 'm' ? 1 : 2;
    targetContainer = configData.f;
    sliceOptions = configData.go.map(g => +g);

    document.body.dataset.targetSr = targetSR;

    sliceOptions.forEach((option, index) => changeSliceOption(
      document.querySelector(`.master-slices .sel-${index}`), option,
      true
    ));

    selectSliceAmount({
        shiftKey: false,
        target: document.querySelector(`.master-slices [class*="sel-"].check:not(.button-outline)`)
    }, sliceOptions[+document.querySelector(`.master-slices [class*="sel-"].check:not(.button-outline)`)?.dataset?.sel??0]);

    if (!onloadRestore) {
        checkAndSetAudioContext();
    }
    secondsPerFile = targetContainer === 'a' ? 20 : secondsPerFile;
    toggleSecondsPerFile(false,
      secondsPerFile === 0 ? 0 :
        (masterChannels === 2 ? 20 : 12)
    );
    setEditorConf({
        audioCtx,
        masterSR,
        masterChannels,
        masterBitDepth
    });

    if (files.length > 0) {
        files.filter(f => f.buffer.numberOfChannels > 1).
          forEach(f => f.waveform = false);
    }
    if (resampleState) {
        files = files.map(f => bufferRateResampler(f));
    }
    if (settingsPanelEl.open) {
        settingsPanelEl.close();
    }
    renderList();
}

function checkAudioContextState() {
    if (audioCtx.state === 'closed') {
        document.body.classList.remove('loading');
        alert(
          'ERROR: The Audio Context has been closed, please refresh the browser tab.');
        return true;
    }
    if (['interrupted', 'suspended'].includes(audioCtx.state)) {
        audioCtx.resume();
    }
    return false;
}

function bufferRateResampler(f, workingSR, audioCtxOverride)  {
    let audioBuffer, slices;
    let channel0 = (f.buffer.channel0 || f.buffer.getChannelData(0));
    let channel1 = f.buffer.numberOfChannels === 2 ? (f.buffer.channel1 || f.buffer.getChannelData(1)) : false;
    workingSR = workingSR || masterSR;

    if (f.buffer.sampleRate !== workingSR) {
        let resample, resampleR;
        resample = new Resampler(f.buffer.sampleRate, workingSR, 1,
            channel0);
        resample.resampler(resample.inputBuffer.length);

        if (f.buffer.numberOfChannels === 2) {
            resampleR = new Resampler(f.buffer.sampleRate, workingSR, 1,
                channel1);
            resampleR.resampler(resampleR.inputBuffer.length);
        }

        audioBuffer = (audioCtxOverride??audioCtx).createBuffer(
            f.buffer.numberOfChannels,
            resample.outputBuffer.length,
            workingSR
        );
        audioBuffer.copyToChannel(resample.outputBuffer, 0);
        if (f.buffer.numberOfChannels === 2) {
            audioBuffer.copyToChannel(resampleR.outputBuffer, 1);
        }
        if (Array.isArray(f.meta.slices)) {
            slices = f.meta.slices.map(slice => ({
                ...slice,
                s: Math.round((slice.s / f.buffer.sampleRate) * workingSR),
                /*If the slice end  is the end of the buffer, set it to the end of the resample buffer.*/
                e: slice.e === f.buffer.length ?
                  Math.round(resample.outputBuffer.length) :
                  Math.round((slice.e / f.buffer.sampleRate) * workingSR),
                l: slice.l && slice.l > -1 ? Math.round((slice.l / f.buffer.sampleRate) * workingSR) : -1
            }));
        }

    } else {
        audioBuffer = (audioCtxOverride??audioCtx).createBuffer(
            f.buffer.numberOfChannels,
            f.buffer.length,
            workingSR
        );
        audioBuffer.copyToChannel(channel0, 0);
        if (f.buffer.numberOfChannels === 2) {
            audioBuffer.copyToChannel(channel1, 1);
        }
    }
    return {
        file: f.file,
        meta: {
            ...f.meta,
            slices: Array.isArray(slices) ? slices : f.meta.slices || false,
            length: audioBuffer.length,
            duration: Number(audioBuffer.length / workingSR).toFixed(3)
        },
        buffer: audioBuffer
    };
}

const getFileById = (id) => {
    return files.find(f => f.meta.id === id);
};
const getFileIndexById = (id) => {
    return files.findIndex(f => f.meta.id === id);
};
const getRowElementById = (id, tableId = '#masterList') => {
    return document.querySelector(`${tableId} tr[data-id="${id}"]`);
};
const toggleModifier = (key) => {
    if (key === 'shiftKey' || key === 'ctrlKey' || key === 'metaKey') {
        key = key === 'metaKey' ? 'ctrlKey' : key;
        modifierKeys[key] = !modifierKeys[key];
        document.getElementById('modifierKey' + key).classList[modifierKeys[key]
          ? 'add'
          : 'remove']('active');
        document.body.classList[modifierKeys[key] ? 'add' : 'remove'](
          key + '-mod-down');
    }
};

const closePopUps = () => {
    lastSelectedRow?.focus();
    document.querySelectorAll('.pop-up').
      forEach(w => w.classList.remove('show'));
    stopPlayFile(false, editor.getLastItem());
    renderList();
    try {
        lastSelectedRow = getRowElementById(lastSelectedRow.dataset.id);
        lastSelectedRow.classList.add('selected');
        lastSelectedRow.scrollIntoViewIfNeeded(true);
    } catch (e) {}
};

const arePopUpsOpen = () => {
    return ([...document.querySelectorAll('.pop-up')].some(
        w => w.classList.contains('show')) ||
      document.querySelectorAll('dialog[open]').length > 0);
};

const toggleOptionsPanel = () => {
    const buttonsEl = document.getElementById('allOptionsPanel');
    const toggleButtonEl = document.getElementById('toggleOptionsButton');
    buttonsEl.classList.contains('hidden') ? buttonsEl.classList.remove(
      'hidden') : buttonsEl.classList.add('hidden');
    buttonsEl.classList.contains('hidden') ? toggleButtonEl.classList.add(
      'collapsed') : toggleButtonEl.classList.remove('collapsed');
};

const toggleListVisibility = () => {
    showSamplesList = !showSamplesList;
    renderList(true);
};

function chainFileNamesAvailable(getCount = false) {
    const count = chainFileNames.filter(f => !f.used).length;
    return getCount ? count : count > 0;
}

function getNextChainFileName(length) {
    const chainNameBtnEl = document.querySelector('.chain-name-toggle');
    let item = chainFileNames.filter(f => !f.used)[0];
    item.used = true;
    chainNameBtnEl.dataset.count = `${chainFileNamesAvailable()
      ? chainFileNamesAvailable(true)
      : ''}`;
    chainNameBtnEl.classList[chainNameBtnEl.dataset.count ? 'remove' : 'add'](
      'fade');
    return `${item.name}--[${length}].wav`;
}

function generateChainNames() {
    chainFileNames = [
        ...new Set(files.filter(f => f.file.path).map(f => f.file.path))].map(
      p => ({name: p.replace(/\W+/gi, ''), used: false}));
    renderChainNamePanelContent();
}

function changeChainName(event, index, action) {
    let item;
    if (action === 'remove-all') {
        event.preventDefault();
        let confirmRemove = confirm(
          `Are you sure you want to remove all the chain names below?`);
        if (confirmRemove) {
            chainFileNames = [];
        }
        return renderChainNamePanelContent();
    }
    if (index === undefined) {
        item = {name: '', used: false};
    } else {
        item = chainFileNames[index];
    }
    if ((index > -1) && action === 'remove') {
        event.preventDefault();
        let confirmRemove = confirm(
          `Are you sure you want to remove the chain name '${item.name}'?`);
        if (confirmRemove) {
            chainFileNames.splice(index, 1);
        }
        return renderChainNamePanelContent();
    } else if ((index > -1) && action === 'reuse') {
        event.preventDefault();
        item.used = false;
        return renderChainNamePanelContent();
    }

    let newName = prompt(
      'Please enter a name for the chain, names must be unique', item.name);
    if (newName) {
        item.name = newName;
        if (index === undefined && chainFileNames.findIndex(
          n => n.name.toLowerCase() === newName.toLowerCase()) === -1) {
            chainFileNames.push(item);
        }
        renderChainNamePanelContent();
    }
}

function renderChainNamePanelContent() {
    const chainNameBtnEl = document.querySelector('.chain-name-toggle');
    const chainFileNameListPanelEl = document.getElementById(
      'chainFileNameListPanel');
    const contentEl = chainFileNameListPanelEl.querySelector('.content');
    const namesHtml = chainFileNames.sort((a, b) => a.used - b.used).
      reduce((a, v, i) => a += `
        <tr>
        <td
            class="chain-file-name-option ${v.used ? 'used' : ''}"
            onpointerdown="digichain.changeChainName(event, ${i})"
        >${v.name} </td>
        <td>
        <button title="Remove this name from the list." class="remove-chain float-right button-clear" onpointerdown="digichain.changeChainName(event, ${i}, 'remove')"><i class="gg-remove"></i></button>
        <button title="Reset this name so it can be reused for a sample chain name." class="reuse-chain p-0 float-right button-clear ${v.used
        ? ''
        : 'hidden'}" onpointerdown="digichain.changeChainName(event, ${i}, 'reuse')"><i class="gg-undo"></i></button>
        </td>
        </tr>
`, '');
    chainNameBtnEl.dataset.count = `${chainFileNamesAvailable()
      ? chainFileNamesAvailable(true)
      : ''}`;
    chainNameBtnEl.classList[chainNameBtnEl.dataset.count ? 'remove' : 'add'](
      'fade');
    contentEl.innerHTML = `
    <div class="row">
      <div class="column mh-60vh">
          <table>
              <tr>
                  <th class="p-0"><h5>Sample Chain Names</h5></th>
                  <th class="p-0"><button title="Remove all names from the list." class="remove-chain float-right button-clear" style="transform: translateX(-0.5rem);" onpointerdown="digichain.changeChainName(event, -1, 'remove-all')"><i class="gg-remove"></i></button></th>
              </tr>
              <tbody>
                  ${namesHtml}
              </tbody>
          </table>
      </div>
    </div>
    <div style="padding-top:1rem;">
        <button title="Generates a list of filenames based on the folder path of the files in the list. This will replace all other names in the sample names list." class="button-outline float-left" onpointerdown="digichain.generateChainNames()">Generate</button>
        <button title="Add a name to use for sample chains, if the list is empty, or all the names have already been used, the DigiChain default naming convention will be used. (Names must be unique, caps are ignored.)" class="button float-right" onpointerdown="digichain.changeChainName(event)">Add Name</button>
    </div>
    `;
}

function toggleChainNamePanel() {
    const chainFileNameListPanelEl = document.getElementById(
      'chainFileNameListPanel');
    chainFileNameListPanelEl.open
      ? chainFileNameListPanelEl.close()
      : chainFileNameListPanelEl.showModal();
    if (chainFileNameListPanelEl.open) {
        renderChainNamePanelContent();
    }
}

function closeSplitOptions(event) {
    const el = document.getElementById('splitOptions');
    if (el.open) {
        el.close();
    }
    stopPlayFile(event, lastSelectedRow.dataset.id);
}

const showEditPanel = (event, id, view = 'sample') => {
    let data, folderOptions;
    if (view === 'opExport') {
        lastOpKit = files.filter(f => f.meta.checked);
        data = lastOpKit;
    } else {
        if (id && view !== 'opExport') {
            lastSelectedRow = getRowElementById(id);
        }
        folderOptions = [...new Set(files.map(f => f.file.path))];
        data = getFileById(id || lastSelectedRow.dataset.id);
    }
    showEditor(
      data,
      {
          audioCtx,
          masterSR,
          masterChannels,
          masterBitDepth
      },
      view,
      folderOptions
    );
};

const closeEditPanel = () => {
    const editPanelEl = document.getElementById('editPanel');
    if (editPanelEl.open) {
        editPanelEl.close();
    };
    files.forEach(f => delete f.meta.editing);
    digichain.stopPlayFile(false, digichain.editor.getLastItem());
    digichain.renderList();
};

function checkShouldExportOtFile(skipExportWithCheck = false) {
    return (exportWithOtFile || skipExportWithCheck) && targetSR === 44100 &&
      targetContainer === 'w';
}

async function setWavLink(file, linkEl, renderAsAif, useTargetSR, bitDepthOverride) {
    let fileName = getNiceFileName('', file, false, true);
    let wav, wavSR, blob;

    fileName = targetContainer === 'a' ?
      fileName.replace('.wav', '.aif') :
      fileName;

    file.meta.slices = file.meta.slices || metaFiles.getByFileInDcFormat(file);

    wav = audioBufferToWav(
      file.buffer, {...file.meta, renderAt: useTargetSR ? targetSR : false}, masterSR, (bitDepthOverride || masterBitDepth),
      masterChannels, deClick,
      (renderAsAif && pitchModifier === 1), pitchModifier, embedSliceData,
      embedCuePoints, embedOrslData
    );
    wavSR = wav.sampleRate;
    wav = wav.buffer;
    blob = new window.Blob([new DataView(wav)], {
        type: renderAsAif && pitchModifier === 1 ? 'audio/aiff' : 'audio/wav'
    });
    if (pitchModifier !== 1) {
        let linkedFile = await fetch(URL.createObjectURL(blob));
        let arrBuffer = await linkedFile.arrayBuffer();
        let pitchedBuffer = await audioCtx.decodeAudioData(arrBuffer);
        let meta = {...file.meta};
        meta.slices = meta.slices.map(slice => ({
            ...slice,
            n: slice.n, s: Math.round(slice.s / pitchModifier),
            e: Math.round(slice.e / pitchModifier),
            l: (!slice.l || slice.l) === -1 ? -1 : Math.round(
              slice.l / pitchModifier)
        }));
        wav = audioBufferToWav(
          pitchedBuffer, {...meta, renderAt: useTargetSR ? targetSR : false}, masterSR, (bitDepthOverride || masterBitDepth),
          masterChannels, deClick,
          renderAsAif, 1, embedSliceData, embedCuePoints, embedOrslData
        );
        wavSR = wav.sampleRate;
        wav = wav.buffer;
        blob = new window.Blob([new DataView(wav)], {
            type: renderAsAif ? 'audio/aiff' : 'audio/wav'
        });
    }

    linkEl.href = URL.createObjectURL(blob);
    linkEl.setAttribute('download', fileName);

    return {blob, sampleRate: wavSR};
}

async function downloadAll(event) {
    const _files = files.filter(f => f.meta.checked);
    const flattenFolderStructure = (event.shiftKey || modifierKeys.shiftKey);
    const links = [];
    const el = document.getElementById('getJoined');
    const renderAsAif = targetContainer === 'a';
    if (_files.length === 0) { return; }
    if (_files.length > 5 && !zipDownloads) {
        const userReadyForTheCommitment = confirm(
          `You are about to download ${_files.length} files, that will show ${_files.length} pop-ups one after each other..\n\nAre you ready for that??`);
        if (!userReadyForTheCommitment) { return; }
    }
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');

    if (zipDownloads && _files.length > 1) {
        const zip = new JSZip();
        for (const file of _files) {
            const wav = await setWavLink(file, el, renderAsAif, true);
            let fileName = '';
            fileName = targetContainer === 'a' ?
              fileName.replace('.wav', '.aif') :
              fileName;
            if (flattenFolderStructure) {
                fileName = getNiceFileName(
                  '', file, false, true
                );
                fileName = targetContainer === 'a' ?
                  fileName.replace('.wav', '.aif') :
                  fileName;
                zip.file(fileName, wav.blob, {binary: true});
                let otFile = await createAndSetOtFileLink(
                  file.meta.slices ?? [], file, fileName);
                if (otFile) {
                    zip.file(otFile.name, otFile.blob, {binary: true});
                }
            } else {
                let fileName = getNiceFileName('', file, false);
                fileName = targetContainer === 'a' ?
                  fileName.replace('.wav', '.aif') :
                  fileName;
                zip.file(file.file.path + fileName, wav.blob, {binary: true});
                let otFile = await createAndSetOtFileLink(
                  file.meta.slices ?? [], file, fileName);
                if (otFile) {
                    zip.file(file.file.path + otFile.name, otFile.blob,
                      {binary: true});
                }
            }
        }
        zip.generateAsync({type: 'blob'}).then(blob => {
            const el = document.getElementById('getJoined');
            el.href = URL.createObjectURL(blob);
            el.setAttribute('download', 'digichain_files.zip');
            el.click();
            document.body.classList.remove('loading');
        });
        return;
    }

    for (const file of _files) {
        const link = await downloadFile(file.meta.id);
        link.forEach(l => links.push(l));
    }

    const intervalId = setInterval(() => {
        const lnk = links.shift();
        lnk?.click();
        if (links.length === 0 && lnk) {
            clearInterval(intervalId);
            document.body.classList.remove('loading');
        }
    }, 500);

}

async function downloadFile(id, fireLink = false, event = {}) {
    const el = getRowElementById(id).querySelector('.wav-link-hidden');
    const metaEl = getRowElementById(id).querySelector('.meta-link-hidden');
    const file = getFileById(id);
    const renderAsAif = targetContainer === 'a';
    await setWavLink(file, el, renderAsAif, true);
    let otFile = await createAndSetOtFileLink(
        file.meta.slices ?? [], file, file.file.name, metaEl);
    if (fireLink && (!shiftClickForFileDownload || (shiftClickForFileDownload && event.shiftKey))) {
        el.click();
        if (otFile) {metaEl.click(); }
    }
    return [el, metaEl];
}

async function attachDragDownloadBlob(event, id) {
    const renderAsAif = targetContainer === 'a';
    let file = getFileById(id);
    let blobLink = {
        href: '',
        setAttribute: function(a, fname) { this.fileName = fname; }
    };
    let blobData = await setWavLink(file, blobLink, renderAsAif, true);
    event.dataTransfer.setData('DownloadURL', `audio/x-wav:${blobLink.fileName}:${blobLink.href}`);
}

function toggleSelectedActionsList() {
    const actionListEl = document.querySelector(
      `.selected-actions-button-list`);
    actionListEl.style.display = actionListEl.style.display === 'none'
      ? 'flex'
      : 'none';
}

function removeSelected() {
    metaFiles.removeSelected();
    files.filter(f => f.meta.checked).forEach(f => remove(f.meta.id));
    files = files.filter(f => !f.meta.checked);
    unsorted = unsorted.filter(id => files.find(f => f.meta.id === id));
    importOrder = importOrder.filter(id => unsorted.includes(id));
    setCountValues();
    if (files.length === 0 || unsorted.length === 0) {
        files.forEach(f => f.buffer ? delete f.buffer : false);
        files = [];
        unsorted = [];
        importOrder = [];
    }
    storeState();
    renderList();
}

function normalizeSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.normalize(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function trimRightSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.trimRight(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function condenseSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    let lower = prompt(
      `Please enter the LOWER threshold (decimal value between 0 and 1)...`);
    if (lower && !isNaN(lower)) {
        lower = Math.abs(+lower);
    }
    let upper = prompt(
      `Please enter the UPPER threshold (decimal value between 0 and 1)...`);
    if (upper && !isNaN(upper)) {
        upper = Math.abs(+upper);
    }
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.thresholdCondense(event, f, false, +lower, +upper);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function roughStretchSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.roughStretch(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function shortenNameSelected(event, restore = false) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        let nameList = {};
        let nameListArr = [];
        if (!restore) {
            nameList = {};
            nameListArr = files.map(f => {
                nameList[f.meta.id] = {
                    path: f.file.path.split('/').
                      map(p => p.substring(0, 12)).
                      join('/'),
                    name: f.file.name.substring(0, 12) +
                      (f.meta.note ? `_${f.meta.note}` : '')
                };
                nameList[f.meta.id].joined = `${nameList[f.meta.id].path}${nameList[f.meta.id].name}`;
                return {name: nameList[f.meta.id].joined, available: true};
            });
        }
        selected.forEach((f, idx) => {
            f.file.origPath = f.file.origPath || f.file.path;
            f.file.origName = f.file.origName || f.file.name;
            if (restore) {
                f.file.path = f.file.origPath;
                f.file.name = f.file.origName;
            } else {
                const sn = nameList[f.meta.id];
                const names = nameListArr.filter(
                  n => n.name === sn.joined && n.available);
                f.file.path = sn.path;
                f.file.name = names.length === 1 ? sn.name : sn.name +
                  `_${names.length}`;
                names[0].available = false;
            }
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function truncateSelected(event) {
    let truncLength = 3;
    if (event.shiftKey || modifierKeys.shiftKey) {
        const userResponse = prompt(
          `Please enter a custom length in seconds to truncate the selected samples to...`);
        if (userResponse && !isNaN(userResponse)) {
            truncLength = Math.abs(+userResponse);
        }
    }
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.truncate(event, f, false, truncLength);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function stretchSelected(event, shortest = false) {
    let sortedItems = files.filter(
      f => f.meta.checked
    ).sort(
      (a, b) => b.buffer.length - a.buffer.length
    );
    if (shortest === true) {
        sortedItems.reverse();
    }
    let stretchLength = sortedItems[0].buffer.length;
    if (event.shiftKey || modifierKeys.shiftKey) {
        const unitOfMeasure = event.ctrlKey || event.metaKey || modifierKeys.ctrlKey ? 'samples' : 'seconds';
        const userResponse = prompt(
          `Please enter a custom length in ${unitOfMeasure} to stretch the selected samples to...`);
        if (userResponse) {
            if (['x', '*'].includes(userResponse[0])) {
                stretchLength = (bufferLength) => Math.floor(
                  bufferLength * (+userResponse.replace(/[^0-9.]/g, '')));
            } else if (['/', '%', '÷'].includes(userResponse[0])) {
                stretchLength = (bufferLength) => Math.floor(
                  bufferLength / (+userResponse.replace(/[^0-9.]/g, '')));
            } else if (!isNaN(userResponse)) {
                stretchLength = Math.floor(Math.abs(+userResponse) * (unitOfMeasure === 'seconds' ? masterSR : 1));
            }
        }
    }
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            if (typeof stretchLength === 'function') {
                editor.stretch(event, f, false, stretchLength(f.buffer.length));
            } else {
                editor.stretch(event, f, false, stretchLength);
            }
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function reverseSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.reverse(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function shiftSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.shift(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function nudgeCrossingsSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.nudgeCrossings(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function padWithZeroSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.padWithZero(event, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function serializeSelected(event, method = 'LR') {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(
          f => f.meta.checked && f.buffer.numberOfChannels === 2);
        selected.forEach((f, idx) => {
            editor.serialize(event, f, false, method);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function deserializeSelected(event, method = 'LR') {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(
          f => f.meta.checked && f.buffer.numberOfChannels === 1);
        selected.forEach((f, idx) => {
            editor.deserialize(event, f, false, method);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function pitchUpSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.perSamplePitch(event, 2, -12, f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function doubleSelected(event, pingPong = false) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.double(event, f, pingPong, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function pingPongSelected(event) {
    doubleSelected(event, true);
}

function fuzzSelected(event) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            editor.fade('fuzz', f, false);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function crushSelected(event) {
    let crushAmount = 25;
    if (event.shiftKey || modifierKeys.shiftKey) {
        const userResponse = prompt(
          `Please enter a custom crush amount (25 is the default, above 127 will sound the same)...`);
        if (userResponse && !isNaN(userResponse)) {
            crushAmount = Math.abs(+userResponse);
        }
    }
    crushAmount = Math.min(Math.floor(Math.abs(crushAmount)), 127);

    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(async () => {
        const selected = files.filter(f => f.meta.checked);
        await new Promise(resolve => selected.forEach((f, idx) => {
            editor.perSamplePitch(event, 1, 1, f, false, crushAmount, 8);
            if (idx === selected.length - 1) {
                resolve(true);
            }
        }));
        await new Promise(
          resolve => setTimeout(() => (selected.forEach((f, idx) => {
              //editor.perSamplePitch(event, .5, 12, f, false);
              editor.normalize(event, f, false);
              if (idx === selected.length - 1) {
                  document.body.classList.remove('loading');
                  resolve(true);
              }
          })), 1000));
        renderList();
    }, 250);
}

function fadeSelected(event, type) {
    files.forEach(f => f.meta.checked ? f.source?.stop() : '');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => {
        const selected = files.filter(f => f.meta.checked);
        selected.forEach((f, idx) => {
            let start = 0,
              end = f.buffer.length < 256 ? f.buffer.length : 256;
            if (type === 'out') {
                start = f.buffer.length < 256 ? 0 : f.buffer.length - 256;
                end = f.buffer.length;
            }
            editor.fade(type, f, false, start, end, true);
            if (idx === selected.length - 1) {
                document.body.classList.remove('loading');
            }
        });
        renderList();
    }, 250);
}

function showInfo() {
    const description = document.querySelector(
      'meta[name=description]').content;
    const version = document.querySelector(
      'meta[name=version]').content;
    const infoPanelContentEl = document.querySelector(
      '#infoPanelMd .content');
    infoPanelContentEl.innerHTML = `
  <h3>DigiChain (${version})</h3>
  <p>${description}</p>
  <p class="float-right"><a href="https://brianbar.net/" target="_blank">Brian Barnett</a>
  (<a href="https://github.com/brian3kb" target="_blank">brian3kb</a>) </p>
`;
    document.querySelector('#infoPanelMd').showModal();
}

function pitchExports(value, silent) {
    const octaves = {
        2: 1,
        4: 2,
        8: 3
    };
    if ([.25, .5, 1, 2, 4, 8].includes(+value)) {
        pitchModifier = +value;
        localStorage.setItem('pitchModifier', pitchModifier);
        infoEl.textContent = pitchModifier === 1
          ? ''
          : `All exported samples will be pitched up ${octaves[pitchModifier]} octave${pitchModifier >
          2 ? 's' : ''}`;
        if (silent) { return; }
        setCountValues();
        showExportSettingsPanel();
    }
    return value;
}

function toggleSetting(param, value) {
    if (param === 'zipDl') {
        zipDownloads = !zipDownloads;
        localStorage.setItem('zipDownloads', zipDownloads);
        showExportSettingsPanel();
    }
    if (param === 'treatDualMonoStereoAsMono') {
        treatDualMonoStereoAsMono = !treatDualMonoStereoAsMono;
        localStorage.setItem('treatDualMonoStereoAsMono',
          treatDualMonoStereoAsMono);
        showExportSettingsPanel();
    }
    if (param === 'shiftClickForFileDownload') {
        shiftClickForFileDownload = !shiftClickForFileDownload;
        localStorage.setItem('shiftClickForFileDownload',
          shiftClickForFileDownload);
        showExportSettingsPanel();
    }
    if (param === 'embedSliceData') {
        embedSliceData = !embedSliceData;
        localStorage.setItem('embedSliceData', embedSliceData);
        showExportSettingsPanel();
    }
    if (param === 'embedCuePoints') {
        embedCuePoints = !embedCuePoints;
        localStorage.setItem('embedCuePoints', embedCuePoints);
        showExportSettingsPanel();
    }
    if (param === 'embedOrslData') {
        embedOrslData = !embedOrslData;
        localStorage.setItem('embedOrslData', embedOrslData);
        showExportSettingsPanel();
    }
    if (param === 'exportWithOtFile') {
        exportWithOtFile = !exportWithOtFile;
        localStorage.setItem('exportWithOtFile', exportWithOtFile);
        showExportSettingsPanel();
    }
    if (param === 'importFileLimit') {
        importFileLimit = !importFileLimit;
        localStorage.setItem('importFileLimit', importFileLimit);
        showExportSettingsPanel();
    }
    if (param === 'skipMiniWaveformRender') {
        skipMiniWaveformRender = !skipMiniWaveformRender;
        localStorage.setItem('skipMiniWaveformRender', skipMiniWaveformRender);
        showExportSettingsPanel();
    }
    if (param === 'reverseEvenSamplesInChains') {
        reverseEvenSamplesInChains = !reverseEvenSamplesInChains;
        localStorage.setItem('reverseEvenSamplesInChains', reverseEvenSamplesInChains);
        showExportSettingsPanel();
    }
    if (param === 'attemptToFindCrossingPoint') {
        attemptToFindCrossingPoint = !attemptToFindCrossingPoint;
        localStorage.setItem('attemptToFindCrossingPoint',
          attemptToFindCrossingPoint);
        showExportSettingsPanel();
    }
    if (param === 'darkModeTheme') {
        darkModeTheme = !darkModeTheme;
        localStorage.setItem('darkModeTheme', darkModeTheme);
        document.body.classList[
          darkModeTheme ? 'remove' : 'add'
          ]('light');
        showExportSettingsPanel();
    }
    if (param === 'normalizeContrast') {
        normalizeContrast = !normalizeContrast;
        localStorage.setItem('normalizeContrast', normalizeContrast);
        document.body.classList[
          normalizeContrast ? 'add' : 'remove'
          ]('normalize-contrast');
        showExportSettingsPanel();
    }
    if (param === 'restoreLastUsedAudioConfig') {
        restoreLastUsedAudioConfig = !restoreLastUsedAudioConfig;
        localStorage.setItem('restoreLastUsedAudioConfig',
          restoreLastUsedAudioConfig);
        showExportSettingsPanel();
    }
    if (param === 'retainSessionState') {
        retainSessionState = !retainSessionState;
        localStorage.setItem('retainSessionState',
            retainSessionState);
        if (retainSessionState) {
            configDb(true);
        } else {
            clearDbBuffers();
        }
        showExportSettingsPanel();
    }
    if (param === 'showTouchModifierKeys') {
        showTouchModifierKeys = !showTouchModifierKeys;
        localStorage.setItem('showTouchModifierKeys', showTouchModifierKeys);
        document.querySelector('.touch-buttons').classList[
          showTouchModifierKeys ? 'remove' : 'add'
          ]('hidden');
        showExportSettingsPanel();
    }
    if (param === 'playWithPopMarker') {
        playWithPopMarker = value;
        files.forEach(f => f.meta.peak = undefined);
        localStorage.setItem('playWithPopMarker', playWithPopMarker);
        showExportSettingsPanel();
    }
    if (param === 'deClick') {
        deClick = value;
        localStorage.setItem('deClick', deClick);
        showExportSettingsPanel();
    }
}

function setCustomSecondsPerFileValue(targetEl, size, silent = false) {
    let newValue = size;
    if (!silent) {
        newValue = prompt(
          `Change max seconds per file "${size}" to what new value?`, size);
    }
    if (newValue && !isNaN(newValue)) {
        newValue = Math.abs(Math.ceil(+newValue));
        secondsPerFile = +newValue;
        targetEl.textContent = newValue;
    }
    return +newValue;
};

function toggleSecondsPerFile(event, value) {
    const toggleEl = document.querySelector('.toggle-seconds-per-file');
    const toggleSpanEl = document.querySelector(
      '.toggle-seconds-per-file span');
    if (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) {
        value = setCustomSecondsPerFileValue(toggleSpanEl, secondsPerFile) ||
          value;
    }
    if (value !== undefined) {
        secondsPerFile = value;
    } else {
        secondsPerFile = secondsPerFile === 0 ?
          (masterChannels === 2 ? 20 : 12) :
          0;
    }
    if (secondsPerFile === 0) {
        toggleEl.classList.remove('on');
        toggleSpanEl.innerText = 'off';
    } else {
        toggleEl.classList.add('on');
        toggleSpanEl.innerText = `${secondsPerFile}s`;
        selectSliceAmount({
            shiftKey: true,
            target: document.querySelector('.slice-grid-off')
        }, 0);
    }
    setCountValues();
}

function toggleHelp() {
    const helpToggleEl = document.querySelector('.toggle-help-panel');
    const helpEnabled = document.body.classList.contains('show-help');
    document.body.classList[helpEnabled ? 'remove' : 'add']('show-help');
    document.querySelector('.help-text').classList[helpEnabled
      ? 'add'
      : 'remove']('hidden');
    helpToggleEl.classList[helpEnabled ? 'add' : 'remove']('fade');
    if (helpToggleEl.dataset.interval) {
        clearInterval(+helpToggleEl.dataset.interval);
        helpToggleEl.dataset.interval = null;
    }
    if (!helpEnabled) {
        const intervalId = setInterval(() => {
            const helpTextEl = document.querySelector('.help-text');
            const activeEl = document.activeElement;
            helpTextEl.textContent = activeEl.title;
            helpTextEl.classList[activeEl.title ? 'remove' : 'add']('fade');
        }, 500);
        helpToggleEl.dataset.interval = `${intervalId}`;
    }
}

function changeOpParam(event, id, param, value) {
    const rowEl = getRowElementById(id);
    const item = getFileById(id);
    if (param === 'bal') {
        event.draggable = false;
        event.preventDefault();
        const balEl = rowEl.querySelector(
          '.channel-options-stereo-opf .channel-balance');
        let newValue = +event.target.value ?? 16384;
        newValue = newValue - newValue % 1024;
        item.meta.opPan = newValue;
    }
    if (param === 'baltoggle') {
        item.meta.opPanAb = !item.meta.opPanAb;
        rowEl.querySelector('.channel-options-stereo-opf').classList[
          item.meta.opPanAb ? 'add' : 'remove']('op-pan-ab-true');
    }
    return false;
}

function showExportSettingsPanel(page = 'settings') {
    const panelEl = document.querySelector('#exportSettingsPanel');
    const panelContentEl = document.querySelector(
      '#exportSettingsPanel .content');
    if (page === 'settings') {
        panelContentEl.innerHTML = `
  <div class="export-options">
  <span class="${page !== 'settings' ? 'active': ''}" onpointerdown="digichain.showExportSettingsPanel('audio')">Audio Config</span>
  <span class="${page === 'settings' ? 'active': ''}">Settings</span>
  </div>
  <span class="settings-info">All settings here will persist when the app re-opens.</span>
  <table style="padding-top:0;">
  <thead>
  <tr>
  <th width="68%"></th>
  <th></th>
</tr>
</thead>
  <tbody>
  <tr>
  <td><span>Pitch up exported files by octave &nbsp;&nbsp;&nbsp;</span></td>
  <td>    <button onpointerdown="digichain.pitchExports(1)" class="check ${pitchModifier ===
        1 ? 'button' : 'button-outline'}">OFF</button>
  <button onpointerdown="digichain.pitchExports(2)" class="check ${pitchModifier ===
        2 ? 'button' : 'button-outline'}">1</button>
  <button onpointerdown="digichain.pitchExports(4)" class="check ${pitchModifier ===
        4 ? 'button' : 'button-outline'}">2</button>
  <button onpointerdown="digichain.pitchExports(8)" class="check ${pitchModifier ===
        8 ? 'button' : 'button-outline'}">3</button><br></td>
</tr>
<tr>
<td><span>Reverse all even samples in a chain? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('reverseEvenSamplesInChains')"
 title="When enabled, all even samples in chains will be reversed (back-to-back mode)."
 class="check ${reverseEvenSamplesInChains
          ? 'button'
          : 'button-outline'}">${reverseEvenSamplesInChains ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Restore the last used Sample Rate/Bit Depth/Channel? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('restoreLastUsedAudioConfig')" class="check ${restoreLastUsedAudioConfig
          ? 'button'
          : 'button-outline'}">${restoreLastUsedAudioConfig ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Retain session data between browser refreshes? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('retainSessionState')" class="check ${retainSessionState
          ? 'button'
          : 'button-outline'}">${retainSessionState ? 'YES' : 'NO'}</button></td>
</tr>
  <tr>
  <td><span>Play pop markers when playing back samples?&nbsp;&nbsp;&nbsp;</span></td>
  <td>
  <button onpointerdown="digichain.toggleSetting('playWithPopMarker', 0)" class="check ${playWithPopMarker ===
        0 ? 'button' : 'button-outline'}">OFF</button>
  <button title="0db prevents DT normalization." onpointerdown="digichain.toggleSetting('playWithPopMarker', 1)" class="check ${playWithPopMarker ===
        1 ? 'button' : 'button-outline'}">0db</button>
  <button title="Peak sets pop to loudest sample peak." onpointerdown="digichain.toggleSetting('playWithPopMarker', 2)" class="check ${playWithPopMarker ===
        2 ? 'button' : 'button-outline'}">Peak</button>
  </td>
  </tr>
  <td><span>Try to match start/end sample when cropping/truncating?&nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Could give shorter length samples than specified but can help
   reduce clicks on looping cropped/truncated samples" onpointerdown="digichain.toggleSetting('attemptToFindCrossingPoint')" class="check ${attemptToFindCrossingPoint
          ? 'button'
          : 'button-outline'}">${attemptToFindCrossingPoint ? 'YES' : 'NO'}</button></td>
</tr>
    <tr>
  <td><span>De-click exported samples?<br>Helps when importing non-wav files of a different<br>sample rate than the export file, or small buffered audio interfaces. &nbsp;&nbsp;&nbsp;</span></td>
  <td>
  <button onpointerdown="digichain.toggleSetting('deClick', 0)" class="check ${+deClick ===
        0 ? 'button' : 'button-outline'}">OFF</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.1)" class="check ${+deClick ===
        0.1 ? 'button' : 'button-outline'}">&gt;10%</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.2)" class="check ${+deClick ===
        0.2 ? 'button' : 'button-outline'}">&gt;20%</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.3)" class="check ${+deClick ===
        0.3 ? 'button' : 'button-outline'}">&gt;30%</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.4)" class="check ${+deClick ===
        0.4 ? 'button' : 'button-outline'}">&gt;40%</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.5)" class="check ${+deClick ===
        0.5 ? 'button' : 'button-outline'}">&gt;50%</button>
  <button onpointerdown="digichain.toggleSetting('deClick', 0.75)" class="check ${+deClick ===
        0.75 ? 'button' : 'button-outline'}">&gt;75%</button>
  </td>
  </tr>
<tr>
<td><span>Download multi-file/joined downloads as one zip file? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('zipDl')" class="check ${zipDownloads
          ? 'button'
          : 'button-outline'}">${zipDownloads ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>When exporting stereo, export dual mono files as mono? &nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Often, stereo files are just the same mono audio data on both channels, if this is the case, export the file as mono." onpointerdown="digichain.toggleSetting('treatDualMonoStereoAsMono')" class="check ${treatDualMonoStereoAsMono
          ? 'button'
          : 'button-outline'}">${treatDualMonoStereoAsMono ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Embed slice information in exported wav files?&nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Embed the slice information into the wav file in DigiChain format, this includes start, end points and the source file name for the slice." onpointerdown="digichain.toggleSetting('embedSliceData')" class="check ${embedSliceData
          ? 'button'
          : 'button-outline'}">${embedSliceData ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Embed slice information as CUE points in exported wav files?&nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Embed slice data as wav CUE point markers, compatible with DirtyWave M8 slice sampler. The end points will extend to the start point of the next sample, or the end of the wav file for the last slice." onpointerdown="digichain.toggleSetting('embedCuePoints')" class="check ${embedCuePoints
          ? 'button'
          : 'button-outline'}">${embedCuePoints ? 'YES' : 'NO'}</button></td>
</tr>
<!--<tr>
<td><span>Embed slice information as Lofi-12 XT points in exported wav files?<br>(Applied only to 12/24 kHz wav exports) &nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Embed slice data in wav file header in the Sonicware custom format for the Lofi-12 XT sampler." onpointerdown="digichain.toggleSetting('embedOrslData')" class="check ${embedOrslData
          ? 'button'
          : 'button-outline'}">${embedOrslData ? 'YES' : 'NO'}</button></td>
</tr>-->
<tr>
<td><span>Create accompanying .ot metadata file?<br>(Applied only to 44.1 kHz 16/24 [non-aif] audio contexts) &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('exportWithOtFile')" class="check ${exportWithOtFile
          ? 'button'
          : 'button-outline'}">${exportWithOtFile ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Limit imports to maximum of 750 files?&nbsp;&nbsp;&nbsp;</span></td>
<td><button title="Enforces a limit of 750 files per import, to help prevent crashes on nested folders of many files - disabling may result in slow-downs or timeouts." onpointerdown="digichain.toggleSetting('importFileLimit')" class="check ${importFileLimit
          ? 'button'
          : 'button-outline'}">${importFileLimit ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Skip rendering the mini audio waveform in the list?&nbsp;&nbsp;&nbsp;</span></td>
<td><button title="When processing large lists of files, skiping the renderings of the waveform can improve the responsiveness of the browse as no canvas element per row will be rendered." onpointerdown="digichain.toggleSetting('skipMiniWaveformRender')" class="check ${skipMiniWaveformRender
          ? 'button'
          : 'button-outline'}">${skipMiniWaveformRender ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Show Shift/Ctrl modifier touch buttons?&nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('showTouchModifierKeys')" class="check ${showTouchModifierKeys
          ? 'button'
          : 'button-outline'}">${showTouchModifierKeys ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Shift+Click to download single files from the list?&nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('shiftClickForFileDownload')" class="check ${shiftClickForFileDownload
          ? 'button'
          : 'button-outline'}">${shiftClickForFileDownload ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Use Dark theme as the default? (No = Light theme)&nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('darkModeTheme')" class="check ${darkModeTheme
          ? 'button'
          : 'button-outline'}">${darkModeTheme ? 'YES' : 'NO'}</button></td>
</tr>
<tr>
<td><span>Normalize text/waveform color contrast? &nbsp;&nbsp;&nbsp;</span></td>
<td><button onpointerdown="digichain.toggleSetting('normalizeContrast')" class="check ${normalizeContrast
          ? 'button'
          : 'button-outline'}">${normalizeContrast ? 'YES' : 'NO'}</button></td>
</tr>
</tbody>
</table>
`;
    } else {
        panelContentEl.innerHTML = `
  <div class="export-options">
    <span class="${page !== 'settings' ? 'active': ''}">Audio Config</span>
    <span class="${page === 'settings' ? 'active': ''}" onpointerdown="digichain.showExportSettingsPanel()">Settings</span>
  </div>
  <table style="padding-top:0;" id="settingAudioConfig">
  <thead>
  <tr>
  <th style="border: none;"></th>
  <th style="border: none;"></th>
</tr>
</thead>
  <tbody>
    <tr>
      <td style="border: none;"><span>Working Sample Rate (Hz)&nbsp;&nbsp;&nbsp;</span></td>
      <td style="border: none;">
          <div class="input-set" id="settingsWorkingSampleRateGroup" style="display: flex; align-items: flex-start;">
              <input type="number" placeholder="Sample Rate between ${supportedSampleRates.toString()}Hz"
              onfocus="(() => {this.placeholder = this.value; this.value = '';})()"
              onblur="(() => { this.value = this.value || this.placeholder; this.placeholder = this.dataset.placeholder;})()"
              id="settingsWorkingSampleRate" value="${masterSR}" data-sample-rate="${masterSR}" list="commonSR"
              data-placeholder="Sample Rate between ${supportedSampleRates.toString()}"
              min="${supportedSampleRates[0]}" max="${supportedSampleRates[1]}">
              <datalist id="commonSR">
                ${[12000, 24000, 32000, 44100, 48000].map(
          v => '<option value="' + v + '">').join('')}
              </datalist>
              <button title="Restore currently active working sample rate" class="button-clear" onpointerdown="(() => {const i = document.getElementById('settingsWorkingSampleRate'); i.value = i.dataset.sampleRate;})()"><i class="gg-undo"></i></button>
          </div>
      </td>
  </tr>
    <tr><td colspan="2"><span><small>Caution: Changing the working sample rate will resample any files currently in the list to the specified sample rate.</small></span><br><br></td></tr>
  <tr>
      <td style="border: none;"><span>Target Sample Rate (Hz)&nbsp;&nbsp;&nbsp;</span></td>
      <td style="border: none;">
          <div class="input-set ${targetContainer === 'a' ? 'disabled' : ''}" id="settingsSampleRateGroup" style="display: flex; align-items: flex-start;">
              <input type="number" placeholder="Sample Rate between ${supportedSampleRates.toString()}Hz"
              ${targetContainer === 'a' ? 'disabled="disabled"' : ''}
              onfocus="(() => {this.placeholder = this.value; this.value = '';})()"
              onblur="(() => { this.value = this.value || this.placeholder; this.placeholder = this.dataset.placeholder;})()"
              id="settingsSampleRate" value="${targetSR}" data-sample-rate="${targetSR}" list="commonSR"
              data-placeholder="Sample Rate between ${supportedSampleRates.toString()}"
              min="${supportedSampleRates[0]}" max="${supportedSampleRates[1]}">
              <datalist id="commonSR">
                ${[12000, 24000, 32000, 44100, 48000].map(
                  v => '<option value="' + v + '">').join('')}
              </datalist>
              <button title="Restore currently active sample rate" class="button-clear" onpointerdown="(() => {const i = document.getElementById('settingsSampleRate'); i.value = i.dataset.sampleRate;})()"><i class="gg-undo"></i></button>
          </div>
      </td>
  </tr>
  <tr><td colspan="2"></td></tr>

  <tr>
  <td><span>Bit Depth&nbsp;&nbsp;&nbsp;</span></td>
  <td>
  <div style="padding: 1.5rem 0;" class="${targetContainer === 'a' ? 'disabled' : ''}" id="bitDepthGroup" data-bit-depth="${masterBitDepth}" onclick="((event, el) => {
      el.dataset.bitDepth = event.target.dataset.bitDepth || el.dataset.bitDepth;
  el.querySelectorAll('button').forEach(b => b.classList = b.dataset.bitDepth === el.dataset.bitDepth ? 'check button' : 'check button-outline')
  })(event, this);">
      <button id="acoBitDepth8" data-bit-depth="8" class="check button${masterBitDepth !== 8 ? '-outline' : ''}">8 Bit</button>
      <button id="acoBitDepth16" data-bit-depth="16" class="check button${masterBitDepth !== 16 ? '-outline' : ''}">16 Bit</button>
      <button id="acoBitDepth24" data-bit-depth="24" class="check button${masterBitDepth !== 24 ? '-outline' : ''}">24 Bit</button>
     <button id="acoBitDepth32" data-bit-depth="32" class="check button${masterBitDepth !== 32 ? '-outline' : ''}">32 Bit</button>
 </div>
  </td>
  </tr>
  <tr>
      <td><span>Channels&nbsp;&nbsp;&nbsp;</span></td>
      <td>
        <div style="padding: 1.5rem 0;" id="channelsGroup" data-channels="${masterChannels}" onclick="((event, el) => {
      el.dataset.channels = event.target.dataset.channels || el.dataset.channels;
  el.querySelectorAll('button').forEach(b => b.classList = b.dataset.channels === el.dataset.channels ? 'check button' : 'check button-outline')
  })(event, this);">
        <button id="acoChannelm" data-channels="1" class="check button${masterChannels !== 1 ? '-outline' : ''}">MONO</button>
          <button id="acoChannels" data-channels="2" class="check button${masterChannels !== 2 ? '-outline' : ''}">STEREO</button>
          </div>
      </td>
  </tr>

  <tr>
      <td style="border: none;"><span>Container&nbsp;&nbsp;&nbsp;</span></td>
      <td style="border: none;">
        <div style="padding: 1.5rem 0;" id="targetContainerGroup" data-container="${targetContainer}" onclick="((event, el) => {
      el.dataset.container = event.target.dataset.container || el.dataset.container;
  el.querySelectorAll('button').forEach(b => b.classList = b.dataset.container === el.dataset.container ? 'check button' : 'check button-outline');
  if (el.dataset.container === 'a') {
      document.getElementById('acoBitDepth16').click();
      document.getElementById('bitDepthGroup').classList.add('disabled');
      document.getElementById('settingsSampleRate').value = 44100;
      document.getElementById('settingsSampleRate').disabled = true;
      document.getElementById('settingsSampleRateGroup').classList.add('disabled');
  } else {
        document.getElementById('bitDepthGroup').classList.remove('disabled');
        document.getElementById('settingsSampleRate').disabled = false
        document.getElementById('settingsSampleRateGroup').classList.remove('disabled');
  }
  })(event, this);">
        <button id="acoContainerw" data-container="w" class="check button${targetContainer === 'w' ? '' : '-outline'}">WAV</button>
          <button id="acoContainera" data-container="a" class="check button${targetContainer === 'a' ? '' : '-outline'}">AIF</button>
          </div>
      </td>
  </tr>
    <tr><td colspan="3"><span><small>Note: Choosing AIF will set the sample rate to 44100 and the bit depth to 16 bit.</small></span><br><br></td></tr>

  <tr>

  <tr>
    <td><span>Slice Grid Options&nbsp;&nbsp;&nbsp;</span></td>
    <td>
        <div id="sliceGridGroup">
           ${[1,2,3,4,5,6].map((g, i) => '<input id="gridSize' + g + '" placeholder="" type="number" class="acoSliceGridOption" onfocus="(() => {this.placeholder = this.value; this.value = \'\';})()" onblur="(() => { this.value = this.value || this.placeholder;})()" list="commonGridSizes" value="' + sliceOptions[i + 1] + '">').join('')}
           <datalist id="commonGridSizes">
                ${[2,4,8,10,12,15,16,24,30,32,48,60,64,128].map(
          v => '<option value="' + v + '">').join('')}
           </datalist>
        </div>
    </td>
  </tr>

  <td style="border-bottom: none;">
    <a class="button" style="margin: 2.5rem 2rem;" onpointerdown="digichain.changeAudioConfig()">Apply Audio Settings</a>
  </td>
  <td style="border-bottom: none;">
    <select id="audioValuesFromCommonSelect" class="btn-audio-config" style="margin: 0 2rem; max-width: 25rem; float: right;" onchange="digichain.setAudioOptionsFromCommonConfig(event)">
        <option value="none" disabled selected>Common Configurations</option>
        <option value="48000m16w0-4-8-16-32-64-128">Digitakt</option>
        <option value="48000s16w0-4-8-16-32-64-128">Digitakt II</option>
        <option value="44100s16w0-4-8-16-32-64-128">Dirtywave M8</option>
        <option value="48000m16w0-8-10-12-15-30-60">Model:Samples</option>
        <option value="44100s16w0-4-8-16-32-48-64">Octatrack (16bit)</option>
        <option value="44100s24w0-4-8-16-32-48-64">Octatrack (24bit)</option>
        <option value="44100s16a0-4-8-12-16-20-24">OP-1 Field</option>
        <option value="44100m16a0-4-8-12-16-20-24">OP-1 / OP-Z</option>
        <option value="44100m16w0-4-8-16-24-32-48">Polyend Tracker</option>
        <option value="44100s16w0-4-8-16-24-32-48">Polyend Tracker Mini</option>
        <option value="48000m16w0-8-10-12-15-30-60">Rytm</option>
        <option value="12000m16w0-2-4-8-10-12-15">Sonicware Lofi-12 XT 12kHz</option>
        <option value="24000m16w0-2-4-8-10-12-15">Sonicware Lofi-12 XT 24kHz</option>
        <option value="46875m16w0-3-4-6-8-9-12">TE EP-133 / EP-1320 (mono)</option>
        <option value="46875s16w0-3-4-6-8-9-12">TE EP-133 / EP-1320 (stereo)</option>
    </select>
  </td>
  </tr>
  <tr><td colspan="2"  style="border: none;">&nbsp;</td></tr>
</tbody>
</table>
`;
    }

    if (!panelEl.open) {
        panelEl.showModal();
    }
}

function getMonoFloat32ArrayFromBuffer(
  buffer, channel, getAudioBuffer = false) {
    return bufferToFloat32Array(buffer, channel, getAudioBuffer, audioCtx,
      masterChannels, masterSR);
}

function showMergePanel() {
    const mergePanelEl = document.getElementById('mergePanel');
    const mergePanelContentEl = document.getElementById('mergePanelContent');
    mergeFiles = files.filter(f => f.meta.checked).map(f => {
        f.meta.pan = f.meta.pan || 'C';
        return f;
    });
    if (mergeFiles.length < 2) {
        return alert('Merge requires more than one file to be selected.');
    }

    mergePanelContentEl.innerHTML = `
   <div class="row">
   <div class="column mh-60vh">
     <table id="mergeList">
      <thead>
        <tr>
        <th>Filename</th>
        <th>Duration</th>
        <th>Mono Channel Choice</th>
        <th>Panning</th>
        </tr>
      </thead>
    <tbody>
` + mergeFiles.map(mf => buildRowMarkupFromFile(mf, 'merge')).join('') +
      `</tbody>
   </table>
 </div>
</div>
<span class="merge-info">Merging flattens each source sample to mono based on the mixdown choice and pans that mono file hard left/right or centers. If you want to retain a stereo files stereo field in the merge, duplicate it first and choose its L/R mix.</span>
<button class="float-right" onclick="digichain.performMergeUiCall()">Merge Files</button>
`;
    if (!mergePanelEl.open) { mergePanelEl.showModal(); }
}

function performMergeUiCall() {
    const mergePanelEl = document.getElementById('mergePanel');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    if (files.filter(f => f.meta.checked).length === 0) {
        return;
    }
    mergePanelEl.close();
    setTimeout(() => performMerge(mergeFiles), 100);
}

function performMerge(mFiles) {
    let longest = mFiles[0];
    mFiles.forEach(mf => longest = longest.buffer.length > mf.buffer.length
      ? longest
      : mf);
    let newItem = {
        file: {...longest.file},
        buffer: audioCtx.createBuffer(
          2,
          longest.buffer.length,
          masterSR
        ),
        meta: {
            ...longest.meta,
            channel: 'L',
            isMerge: true,
            editOf: '',
            id: crypto.randomUUID(),
            checked: false
        },
        waveform: false
    };
    for (let i = 0; i < newItem.buffer.length; i++) {
        newItem.buffer.getChannelData(0)[i] = 0;
        newItem.buffer.getChannelData(1)[i] = 0;
    }
    mFiles.forEach((mf, idx) => {
        const panChannel = mf.meta.pan === 'L' ? 0 : 1;
        let data = mf.buffer.getChannelData(0);
        if (mf.buffer.numberOfChannels === 2) {
            data = getMonoFloat32ArrayFromBuffer(mf.buffer, mf.meta?.channel);
        }
        if (mf.meta.pan === 'C') {
            for (let i = 0; i < mf.buffer.length; i++) {
                newItem.buffer.getChannelData(
                  0)[i] = (newItem.buffer.getChannelData(
                  0)[i] + (data[i] || 0)) / 2;
                newItem.buffer.getChannelData(
                  1)[i] = (newItem.buffer.getChannelData(
                  1)[i] + (data[i] || 0)) / 2;
            }
        } else {
            const buffer = newItem.buffer.getChannelData(panChannel);
            for (let i = 0; i < mf.buffer.length; i++) {
                newItem.buffer.getChannelData(panChannel)[i] = buffer[i] === 0 ?
                  (data[i] || 0) :
                  ((buffer[i] + (data[i] || 0)) / 2);
            }
        }

        if (idx === mFiles.length - 1) {
            files.unshift(newItem);
            unsorted.push(newItem.meta.id);
            document.body.classList.remove('loading');
            renderList();
        }
    });

}

function showBlendPanel() {
    const mergePanelEl = document.getElementById('mergePanel');
    const mergePanelContentEl = document.getElementById('mergePanelContent');
    mergeFiles = files.filter(f => f.meta.checked).map(f => {
        f.meta.pan = f.meta.pan || 'C';
        return f;
    });
    if (mergeFiles.length < 2) {
        return alert('Blend requires more than one file to be selected.');
    }

    mergePanelContentEl.innerHTML = `
   <div class="row">
   <div class="column mh-60vh">
     <table id="mergeList">
      <thead>
        <tr>
        <th>Filename</th>
        <th>Duration</th>
        <th>Mono Channel Choice</th>
        </tr>
      </thead>
    <tbody>
` + mergeFiles.map(mf => buildRowMarkupFromFile(mf, 'blend')).join('') +
      `</tbody>
   </table>
 </div>
</div>
<div class="row" style="padding-left: 1rem; padding-top: 2rem;">
<label for="blendLength">Blend length: </label>
<select class="btn-audio-config" style="max-width: 100px;margin-left: 1rem;margin-top: -.75rem;" name="blendLength" id="blendLength">
${[16, 32, 64, 128, 256, 512, 1024, 2048, 4096].reduce((a, c) =>
          a += '<option value="' + c + '"' +
            (c === 64 ? 'selected="selected">' : '>') + c + '</option>'
        , '')}
</select>
</div>
<span class="merge-info">EXPERIMENTAL: Blend interpolates between the selected samples by the number of steps specified. Works best when the selected files are approximately the same durations.</span>
<button class="float-right" onclick="digichain.performBlendUiCall()">Blend Files</button>
`;
    if (!mergePanelEl.open) { mergePanelEl.showModal(); }
}

function performBlendUiCall() {
    const blendLengthEl = document.getElementById('blendLength');
    const blendLength = +blendLengthEl.value;
    const blendPanelEl = document.getElementById('mergePanel');
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    if (files.filter(f => f.meta.checked).length === 0 || !blendLength) {
        return;
    }
    blendPanelEl.close();
    setTimeout(() => performBlend(mergeFiles, blendLength), 100);
}

function performBlend(mFiles, blendLength) {
    const blendLengths = mFiles.map((f, i) =>
      Math.floor(blendLength / mFiles.length) +
      (i === mFiles.length - 1 ? blendLength % mFiles.length : 0)
    );

    let blendName = `${getNiceFileName(
      mFiles.at(0).file.name)}-${getNiceFileName(
      mFiles.at(-1).file.name)}_blend`;
    let newItemBuffer = audioCtx.createBuffer(
      1,
      mFiles.reduce((a, f, i) => a += f.buffer.length * blendLengths[i], 0),
      masterSR
    );
    let newItem = {
        file: {
            name: blendName,
            filename: `${blendName}.wav`,
            path: '',
            type: 'audio/wav'
        },
        buffer: newItemBuffer,
        meta: {
            length: newItemBuffer.length,
            duration: Number(newItemBuffer.length / masterSR).toFixed(3),
            startFrame: 0,
            endFrame: newItemBuffer.length,
            isBlend: true,
            editOf: '',
            id: crypto.randomUUID(),
            checked: false
        },
        waveform: false
    };
    for (let i = 0; i < newItem.buffer.length; i++) {
        newItem.buffer.getChannelData(0)[i] = 0;
    }

    let pos = 0;
    mFiles.forEach((mf, idx) => {
        const nextMf = idx === mFiles.length - 1 ? mFiles[0] : mFiles[idx + 1];
        let data = mf.buffer.numberOfChannels === 2 ?
          getMonoFloat32ArrayFromBuffer(mf.buffer, mf.meta?.channel) :
          mf.buffer.getChannelData(0);
        let data2 = nextMf.buffer.numberOfChannels === 2 ?
          getMonoFloat32ArrayFromBuffer(nextMf.buffer, nextMf.meta?.channel) :
          nextMf.buffer.getChannelData(0);

        for (let n = 0; n < blendLengths[idx]; n++) {
            for (let i = 0; i < data.length; i++) {
                newItem.buffer.getChannelData(0)[pos] = (data[i] || 0) +
                  ((n + 1) / blendLengths[idx]) *
                  ((data2[i] || 0) - (data[i] || 0));
                pos++;
            }
        }

        if (idx === mFiles.length - 1) {
            files.unshift(newItem);
            unsorted.push(newItem.meta.id);
            document.body.classList.remove('loading');
            renderList();
        }
    });

}

function joinAllUICall(event, pad) {
    if (files.length === 0 || files.filter(f => f.meta.checked).length === 0) { return; }
    if (secondsPerFile !== 0) {
        let _files = files.filter(f => f.meta.duration < secondsPerFile);
        if (_files.length === 0) { return;}
    }
    document.getElementById('loadingText').textContent = 'Processing';
    document.body.classList.add('loading');
    setTimeout(() => joinAll(event, pad), 500);
}

async function joinAll(
  event, pad = false, filesRemaining = [], fileCount = 0,
  toInternal = false, zip = false) {
    if (files.length === 0) { return; }
    if (toInternal ||
      (event.shiftKey || modifierKeys.shiftKey)) { toInternal = true; }
    try {
        if (zipDownloads && !toInternal && files.filter(
          f => f.meta.checked).length > 1) { zip = zip || new JSZip(); }

        let _files = filesRemaining.length > 0 ? filesRemaining : files.filter(
          f => f.meta.checked);

        let tempFiles, slices, largest;
        let totalLength = 0;

        if (secondsPerFile === 0) { /*Using slice grid file lengths*/
            tempFiles = _files.splice(0,
              (sliceGrid > 0 ? sliceGrid : _files.length));

            filesRemaining = Array.from(_files);
            _files = tempFiles;
            if (pad && sliceGrid !== 0 && _files.length !== 0) {
                while (_files.length !== sliceGrid) {
                    _files.push(_files[_files.length - 1]);
                }
            }
            largest = _files.reduce(
              (big, cur) => big > cur.buffer.length ? big : cur.buffer.length, 0);
            totalLength = _files.reduce((total, file) => {
                total += pad ? largest : file.buffer.length;
                return total;
            }, 0);

        } else { /*Using max length in seconds (if aif also limit upto 24 files per chain)*/
            _files = _files.filter(f => f.meta.duration < secondsPerFile);
            let maxChainLength = (
              targetContainer === 'a' ? 24 : (sliceGrid === 0
                ? 64
                : sliceGrid));
            const processing = _files.reduce((a, f) => {
                if (
                  (a.duration + +f.meta.duration <=
                    (secondsPerFile * pitchModifier)) &&
                  (a.processed.length < maxChainLength)) {
                    a.duration = a.duration + +f.meta.duration;
                    a.totalLength = a.totalLength + +f.meta.length;
                    a.processed.push(f);
                } else {
                    a.skipped.push(f);
                }
                return a;
            }, {duration: 0, totalLength: 0, processed: [], skipped: []});

            totalLength = processing.totalLength;
            filesRemaining = processing.skipped;
            _files = processing.processed;
        }

        slices = [];
        let offset = 0;
        for (let x = 0; x < _files.length; x++) {
            const fileSliceData = _files[x].meta.slices || metaFiles.getByFileInDcFormat(_files[x]);
            if (fileSliceData.length) {
                if (slices.length > 0) {
                    const _slices = JSON.parse(
                      JSON.stringify(fileSliceData));
                    _slices.forEach(slice => {
                        slice.s = slice.s + offset;
                        slice.e = slice.e + offset;
                    });
                    slices = [...slices, ..._slices];
                } else {
                    slices = [...slices, ...fileSliceData];
                }
            } else {
                slices.push({
                    s: offset,
                    e: offset + (pad ? largest : +_files[x].buffer.length),
                    n: _files[x].file.name,
                    p: _files[x].meta.opPan ?? 16384,
                    pab: _files[x].meta.opPanAb ?? false,
                    st: _files[x].meta.opPitch ?? 0
                });
            }
            offset += (pad ? largest : +_files[x].buffer.length);
        }
        slices.forEach(s => {
            s.s = s.s > totalLength ? totalLength : s.s;
            s.e = s.e > totalLength ? totalLength : s.e;
        });
        slices = slices.filter(s => s.s < s.e);
        const audioArrayBuffer = audioCtx.createBuffer(
          masterChannels,
          totalLength,
          masterSR
        );

        for (let channel = 0; channel < masterChannels; channel++) {
            for (let i = 0; i < totalLength; i++) {
                audioArrayBuffer.getChannelData(channel)[i] = 0;
            }
        }

        if (masterChannels === 1) {
            joinToMono(audioArrayBuffer, _files, largest, pad, reverseEvenSamplesInChains);
        }
        if (masterChannels === 2) {
            joinToStereo(audioArrayBuffer, _files, largest, pad, reverseEvenSamplesInChains);
        }

        const joinedEl = document.getElementById('getJoined');
        const path = _files[0].file.path ? `${(_files[0].file.path || '').replace(
          /\//gi, '-')}` : '';
        const fileData = {
            file: {
                name: chainFileNamesAvailable() ? getNextChainFileName(
                  _files.length) : (_files.length === 1 ?
                  `${path}chain_${pad ? 'spaced_' : ''}${getNiceFileName('',
                    _files[0], true)}_${fileCount + 1}--[${_files.length}].wav` :
                  `${path}chain_${pad ? 'spaced_' : ''}${fileCount +
                  1}--[${_files.length}].wav`)
            }, buffer: audioArrayBuffer, meta: {slices}
        };
        if (toInternal) {

            const wav = await setWavLink(fileData, joinedEl, false, false,
              (masterBitDepth === 8 ? 8 : 32));
            const fileReader = new FileReader();
            fileReader.readAsArrayBuffer(wav.blob);
            fileReader.fileCount = fileCount;
            fileReader.onload = async (e) => {
                const fb = e.target.result.slice(0);
                await (masterSR !== (wav.sampleRate || masterSR)
                    ? new AudioContext(
                        {
                            sampleRate: wav.sampleRate,
                            latencyHint: 'interactive'
                        })
                    : audioCtx).decodeAudioData(e.target.result, buffer => {
                    parseWav(buffer, fb, {
                        lastModified: new Date().getTime(),
                        name: fileData.file.name,
                        embedSliceData: embedSliceData,
                        sampleRate: wav.sampleRate || masterSR,
                        channels: buffer.numberOfChannels,
                        // name: _files.length === 1 ?
                        //     `${path}resample_${pad ? 'spaced_' : ''}${getNiceFileName('',
                        //         _files[0], true)}_${fileReader.fileCount +
                        //     1}--[${_files.length}].wav` :
                        //     `${path}resample_${pad ? 'spaced_' : ''}${fileReader.fileCount +
                        //     1}--[${_files.length}].wav`,
                        size: (((masterBitDepth === 8 ? 8 : 32) * (wav.sampleRate || masterSR) *
                            (buffer.length / (wav.sampleRate || masterSR))) /
                          8) * buffer.numberOfChannels / 1024,
                        type: 'audio/wav'
                    }, '', true, false);
                    renderList();
                });
            };

        } else {
            const renderAsAif = targetContainer === 'a';
            if (zip) {
                const wav = await setWavLink(fileData, joinedEl, renderAsAif, true);
                fileData.file.name = targetContainer === 'a' ?
                  fileData.file.name.replace('.wav', '.aif') :
                  fileData.file.name;
                zip.file(fileData.file.name, wav.blob, {binary: true});
                let otFile = await createAndSetOtFileLink(
                  fileData.meta.slices ?? [], fileData,
                  fileData.file.name);
                if (otFile) {
                    zip.file(otFile.name, otFile.blob, {binary: true});
                }
            } else {
                await setWavLink(fileData, joinedEl, renderAsAif, true);
                joinedEl.click();
                let otFile = await createAndSetOtFileLink(
                  fileData.meta.slices ?? [], fileData,
                  fileData.file.name, joinedEl);
                if (otFile) {joinedEl.click(); }
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
    } catch (joinError) {
        let errorMessage = `An unexpected error was encountered while building the sample chain(s).`;
        if (joinError) {
            errorMessage += `\n\n "${joinError.toString ? joinError.toString() : JSON.stringify(joinError)}"`;
        }
        document.getElementById('loadingText').textContent = 'Unexpected Error';
        alert(errorMessage);
        setTimeout(() => document.body.classList.remove('loading'), 3000);
        console.log(joinError);
    }
}

function convertChain(event, toSpacedChain = false) {
    const el = document.getElementById('splitOptions');
    const excludeSlices = [...el.querySelectorAll(`div.line.fade`)].map(
      s => +s.dataset.idx);
    const newItem = duplicate(event, lastSelectedRow.dataset.id, true);

    newItem.item.meta.slices = (newItem.item.meta.slices ?
      newItem.item.meta.slices :
      metaFiles.getByFileInDcFormat(
        getFileById(lastSelectedRow.dataset.id))).filter(
      (x, idx) => !excludeSlices.includes(idx));

    if (toSpacedChain && sliceGrid !== 0) {
        while (newItem.item.meta.slices.length < sliceGrid) {
            newItem.item.meta.slices.push(
              JSON.parse(JSON.stringify(newItem.item.meta.slices.at(-1))));
        }
    }

    const sliceLengths = newItem.item.meta.slices.map(s => s.e - s.s);
    const largestSlice = Math.max(...sliceLengths);

    let buffers = newItem.item.meta.slices.map(slice => {
        const buffer = new AudioBuffer({
            numberOfChannels: newItem.item.buffer.numberOfChannels,
            length: (slice.e - slice.s),
            sampleRate: newItem.item.buffer.sampleRate
        });
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            for (let i = 0; i < buffer.length; i++) {
                buffer.getChannelData(
                  channel)[i] = newItem.item.buffer.getChannelData(
                  channel)[slice.s + i] || 0;
            }
        }
        return {buffer, meta: {}};
    });

    if (!toSpacedChain) {
        buffers.forEach(buffer => {
            editor.trimRight(event, buffer, false);
        });
    }
    const trimmedLength = toSpacedChain ?
      (buffers.length * largestSlice) :
      buffers.reduce((length, item) => length += item.buffer.length, 0);
    const trimmedBuffer = new AudioBuffer({
        numberOfChannels: newItem.item.buffer.numberOfChannels,
        length: trimmedLength,
        sampleRate: newItem.item.buffer.sampleRate
    });

    if (trimmedBuffer.numberOfChannels === 1) {
        joinToMono(trimmedBuffer, buffers, largestSlice, toSpacedChain);
    }
    if (trimmedBuffer.numberOfChannels === 2) {
        joinToStereo(trimmedBuffer, buffers, largestSlice, toSpacedChain);
    }

    let progress = 0;
    buffers.forEach((item, idx) => {
        const length = toSpacedChain ? largestSlice : item.buffer.length;
        if (newItem.item.meta.slices) {
            newItem.item.meta.slices[idx].s = progress;
            newItem.item.meta.slices[idx].e = progress + length;
        }
        progress += length;
    });
    newItem.item.buffer = trimmedBuffer;
    newItem.item.meta = {
        ...newItem.item.meta,
        length: trimmedBuffer.length,
        duration: Number(trimmedBuffer.length / masterSR).toFixed(3),
        startFrame: 0, endFrame: trimmedBuffer.length
    };
    delete newItem.item.meta.op1Json;
    newItem.callback(newItem.item, newItem.fileIdx);
    closeSplitOptions();
}

function joinAllByPath(event, pad = false) { //TODO: test and hook into UI
    const filesByPath = {};
    files.filter(f => f.meta.checked).forEach(file => {
        const path = file.file.path.replace(/\//gi, '-');
        filesByPath[path] = filesByPath[path] || [];
        filesByPath[path].push(file);
    });
    for (const fBP of filesByPath) {
        joinAll(event, pad, fBP, fBP.length);
    }
}

const stopPlayFile = (event, id) => {
    const file = getFileById(id || lastSelectedRow?.dataset?.id);
    if (!file) { return; }
    try {
        file?.source?.stop();
    } catch (e) {}
    if (file.meta.playing && file.meta.playing !== true) {
        const [fnType, fnId] = file.meta.playing.split('_');
        window['clear' + fnType](+fnId);
        file.meta.playing = false;
        file.playHead?.remove();
        file.playHead = false;
    }
    file.waveform?.classList?.remove('playing');
    if (file.meta.playing === true) {
        file.meta.playing = false;
    }
    let playHead = file.playHead ||
      file.waveform?.parentElement?.querySelector('.play-head');
    if (playHead) { playHead.remove(); }
};

const playFile = (event, id, loop, start, end) => {
    const file = getFileById(id || lastSelectedRow.dataset.id);
    let playHead;
    loop = loop || (event.shiftKey || modifierKeys.shiftKey) || false;

    stopPlayFile(false, (id || file.meta.id));

    const isAudioCtxClosed = checkAudioContextState();
    if (isAudioCtxClosed) { return; }

    file.source = audioCtx.createBufferSource();
    let buffer = file.meta.channel && masterChannels === 1 ?
      getMonoFloat32ArrayFromBuffer(file.buffer, file.meta.channel, true) :
      file.buffer;

    if (playWithPopMarker && !event?.editor) {
        const popAudio = audioCtx.createBuffer(1, 8, masterSR);
        const popBuffer = audioCtx.createBuffer(buffer.numberOfChannels,
          buffer.length + (popAudio.length * 2), masterSR);
        const popData = popAudio.getChannelData(0);
        let peak;
        if (playWithPopMarker === 2) {
            peak = file.meta.peak ?? editor.normalize(event, file, false, true);
        } else {
            peak = 1;
        }
        new Array(popAudio.length).fill(0).
          forEach((x, i) => popAudio.getChannelData(0)[i] = peak);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            popBuffer.copyToChannel(popData, channel);
            popBuffer.copyToChannel(channelData, channel, popAudio.length);
            popBuffer.copyToChannel(popData, channel,
              popAudio.length + channelData.length);
        }
        buffer = popBuffer;
    }

    file.source.buffer = buffer;
    file.source.connect(audioCtx.destination);
    file.source.loop = loop;

    if (id && !event?.editor &&event.target && event.target !== file.waveform) {
        file.waveform = event.target;
    }

    if (id && !event?.editor && file.waveform && file.waveform.nodeName !== 'BUTTON') {
        playHead = document.createElement('span');
        playHead.classList.add('play-head');
        playHead.style.animationDuration = `${file.meta.duration}s`;
        file.waveform.parentElement.appendChild(playHead);
        file.playHead = playHead;
    }

    file.source.start(
      0,
      start || 0,
      end
    );

    if (id && !event?.editor) {
        file.waveform?.classList?.add('playing');
        if (playHead) {
            playHead.style.animationIterationCount = file.source.loop
              ? 'infinite'
              : 'unset';

            if (file.source.loop) {
                file.meta.playing = 'Interval_' + setInterval(() => {
                    const ph = file.waveform?.parentElement?.querySelector(
                      '.play-head');
                    if (ph) {
                        const phClone = ph.cloneNode(true);
                        ph.remove();
                        file.waveform.parentElement.appendChild(phClone);
                    } else { // Buffer modified while playing, so clear out the meta.
                        stopPlayFile(false, file.meta.id);
                    }
                }, file.meta.duration * 1000);
            } else {
                file.meta.playing = 'Timeout_' + setTimeout(() => {
                    stopPlayFile(false, file.meta.id);
                }, file.meta.duration * 1000);
            }
        } else if (file.source.loop) {
            file.meta.playing = file.source.loop  || 'Timeout_' + setTimeout(() => {
                stopPlayFile(false, file.meta.id);
            }, file.meta.duration * 1000);
        }
    }

};

const playSlice = (event, id, startPoint, endPoint, loop) => {
    if ((event.ctrlKey || event.metaKey || modifierKeys.ctrlKey)) {
        const start = startPoint / masterSR;
        const end = (endPoint / masterSR) - start;
        playFile(event, id, loop, start, end);
    }
};

function sliceAction(event, id, params) {
    const file = getFileById(id);
    const lineEl = event.target.closest('.line');
    if (
      (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) &&
      (event.shiftKey || modifierKeys.shiftKey)
    ) {
        document.getElementById('splitOptions').querySelectorAll(`div.line`).forEach(line => {
            line.classList.remove('file-loop-on');
            line.classList.remove('file-loop-pp');
        });
        const sliceLinesEl = document.getElementById('sliceLines');
        file.meta.otLoop = parseInt(file.meta?.otLoop) < 2 ? file.meta.otLoop+1 : 0;
        if (file.meta.otLoop === 0) {
            file.meta.otLoopStart = 0;
        } else {
            [...document.getElementById('splitOptions').querySelectorAll(`div.line`)].slice(+lineEl.dataset.idx).forEach(
              (line, idx) => line.classList.add(file.meta.otLoop === 1 ? 'file-loop-on' : 'file-loop-pp')
            );
            file.meta.otLoopStart = +params.startPoint;
        }
        return;
    }

    if ((event.ctrlKey || event.metaKey || modifierKeys.ctrlKey)) {
        playSlice(event, id, +params.startPoint, +params.endPoint, params.loop);
    }
    if ((event.shiftKey || modifierKeys.shiftKey)) {
        const slice = file.meta.slices[+lineEl.dataset.idx];
        if (slice) {
            lineEl.classList.toggle('slice-loop');
            slice.l = slice.l === -1 ? slice.s : -1;
        }
    }
}

const toggleCheck = (event, id, silent = false, ignoreShiftKey = false) => {
    try {
        const rowEl = getRowElementById(id);
        const el = getRowElementById(id).querySelector('.toggle-check');
        const file = getFileById(id);
        event.preventDefault();
        if ((event.shiftKey || modifierKeys.shiftKey) && !ignoreShiftKey) {
            const lastRowId = getFileIndexById(lastLastSelectedRow.dataset.id);
            const thisRowId = getFileIndexById(id);
            const from = Math.min(lastRowId, thisRowId);
            const to = Math.max(lastRowId, thisRowId);
            for (let i = from; i <= to; i++) {
                const loopRow = getRowElementById(files[i].meta.id);
                const check = !(event.ctrlKey || event.metaKey || modifierKeys.ctrlKey);
                files[i].meta.checked = check;
                loopRow.querySelector('.toggle-check').classList[check
                  ? 'remove'
                  : 'add']('button-outline');
                loopRow.classList[check ? 'add' : 'remove']('checked');
            }
        } else {
            file.meta.checked = !file.meta.checked;
            el.classList[file.meta.checked ? 'remove' : 'add'](
              'button-outline');
            rowEl.classList[file.meta.checked ? 'add' : 'remove']('checked');
            if (!file.meta.checked && silent) {
                file.source?.stop();
            }
        }
        lastSort = '';
        setCountValues();
    } catch (err) {
        setCountValues();
    }
};

const changeChannel = (
  event, id, channel, allowModKey = true, tableId = '#masterList') => {
    const el = getRowElementById(id, tableId).
      querySelector('.channel-option-' + channel);
    const file = getFileById(id);
    if ((event.shiftKey || modifierKeys.shiftKey) && allowModKey) {
        const opts = {
            L: 'audio from the Left channel',
            R: 'audio from the Right channel',
            S: 'Sum both channels of audio to mono',
            D: 'Difference between Left and Right channels'
        };
        const confirmSetAllSelected = confirm(
          `Confirm setting all selected samples that are stereo to ${opts[channel]}?`);
        if (confirmSetAllSelected) {
            files.filter(f => f.meta.checked && f.buffer.numberOfChannels > 1).
              forEach(f => {
                  f.meta.channel = channel;
                  file.waveform = false;
              });
        }
        if (!modifierKeys.shiftKey &&
          document.body.classList.contains('shiftKey-down')) {
            document.body.classList.remove('shiftKey-down');
        }
        return renderList();
    }
    file.meta.channel = channel;

    if (tableId === '#masterList') {
        file.waveform = false;
        return renderRow(file);
    }
    if (document.getElementById('mergePanel').open &&
      document.getElementById('blendLength')) {
        showBlendPanel();
    } else {
        showMergePanel();
    }
    //file.waveform.getContext('2d').clear();
    //drawWaveform(file, file.waveform, file.buffer.numberOfChannels);
    // getRowElementById(id, tableId).
    //     querySelectorAll('.channel-options a').
    //     forEach(opt => opt.classList.remove('selected'));
    // el.classList.add('selected');
};

const changePan = (event, id, pan) => {
    const el = getRowElementById(id, '#mergeList').
      querySelector('.pan-option-' + pan);
    const file = getFileById(id);
    file.meta.pan = pan;
    //file.waveform.getContext('2d').clear();
    //drawWaveform(file, file.waveform, file.buffer.numberOfChannels);
    getRowElementById(id, '#mergeList').
      querySelectorAll('.pan-options a').
      forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
};

const invertFileSelection = () => {
    if (files.length === 0) { return; }
    files.forEach(file => file.meta.checked = !file.meta.checked);
    renderList();
};

const changeSliceOption = (targetEl, size, silent = false) => {
    let newValue = size;
    if (!silent) {
        newValue = prompt(`Temporarily change slice value "${size}" to what new value?`,
          size);
    }
    if (newValue && !isNaN(newValue)) {
        newValue = Math.abs(Math.ceil(+newValue));
        sliceOptions[targetEl.dataset.sel] = +newValue;
        targetEl.textContent = newValue;
    }
    return +newValue;
};

const selectSliceAmount = (event, size) => {
    if (!event.target) { return; }
    if ((event.ctrlKey || event.metaKey || modifierKeys.ctrlKey)) {
        if (size === 0) {
            DefaultSliceOptions.forEach((option, index) => changeSliceOption(
              document.querySelector(`.master-slices .sel-${index}`), option,
              true
            ));
            sliceOptions = Array.from(DefaultSliceOptions);
            return selectSliceAmount({shiftKey: true}, 0);
        }
        return selectSliceAmount({shiftKey: true},
          changeSliceOption(event.target, size));
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
    if ((event.shiftKey || modifierKeys.shiftKey)) {
        /*Shift+click to change grid and set the selection to the grid size.*/
        files.forEach(f => f.meta.checked = false);
        for (let i = 0; i < (size < files.length ? size : files.length); i++) {
            toggleCheck(event, files[i].meta.id, true, true);
        }
        renderList();
    }
};

const duplicate = (event, id, prepForEdit = false) => {
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
    item.waveform = false;
    item.meta.playing = false;
    item.meta.id = crypto.randomUUID();
    item.file.name = getUniqueName(files, item.file.name);
    if (prepForEdit) {
        item.meta.editOf = id;
        return {
            item,
            fileIdx,
            callback: (_item, _fileIdx) => {
                files.splice(((event.shiftKey || modifierKeys.shiftKey)
                  ? files.length
                  : _fileIdx), 0, _item);
                unsorted.push(_item.meta.id);
                renderList();
            }
        };
    }
    item.meta.dupeOf = id;
    files.splice(
      ((event.shiftKey || modifierKeys.shiftKey) ? files.length : fileIdx), 0,
      item);
    unsorted.push(item.meta.id);
    renderList();
};

function splitFromFile(input) {
    const trackButtonsContainerEl = document.querySelector(
      '.slice-from-file-buttons');
    const trackButtonsEl = document.querySelectorAll(
      '.slice-from-file-buttons button');
    if (!input.target?.files?.length) { return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        if (!e.target.result) { return; }
        const json = JSON.parse(e.target.result);
        if (!json.clips) { return; }
        lastSliceFileImport = json.clips.map(clip => ({
            track: clip.ch + 1,
            startPoint: Math.round((clip.start / 44100) * masterSR),
            endPoint: Math.round((clip.stop / 44100) * masterSR)
        }));
        lastSliceFileImport.trackSlices = {};
        lastSliceFileImport.forEach(
          slice => lastSliceFileImport.trackSlices[`t${slice.track}`] = (lastSliceFileImport.trackSlices[`t${slice.track}`] ??
            0) + 1);
        trackButtonsContainerEl.classList.remove('hidden');
        trackButtonsEl.forEach((
          btn,
          i) => btn.textContent = `${lastSliceFileImport.trackSlices[`t${i +
        1}`]}`);
    };
    reader.readAsText(input.target.files[0]);
}

function splitFromTrack(event, track) {
    const sliceGroupEl = document.querySelector(
      `#splitOptions .slice-group`);
    const file = getFileById(sliceGroupEl.dataset.id);
    file.meta.customSlices = {
        slices: lastSliceFileImport.filter(slice => slice.track === track)
    };
    file.meta.customSlices.sliceCount = file.meta.customSlices.slices.length;
    drawSliceLines(file.meta.customSlices.length, file, file.meta.customSlices);
}

const splitByOtSlices = (
  event, id, pushInPlace = false, sliceSource = 'ot',
  excludeSlices = [], saveSlicesMetaOnly = false) => {
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
    if (!otMeta) { return; }
    if (saveSlicesMetaOnly) {
        file.meta.slices = metaFiles.getByFileInDcFormat(
          sliceSource === 'transient' ?
            '---sliceToTransientCached---' :
            file
        ).filter((x, idx) => !excludeSlices.includes(idx));
        metaFiles.removeByName(
          sliceSource === 'transient' ?
            '---sliceToTransientCached---' :
            file.file.filename
        );
        file.meta.slices = file.meta.slices.length > 0
          ? file.meta.slices
          : false;
        file.meta.op1Json = false;
        splitAction(event, id);
        return;
    }
    for (let i = 0; i < otMeta.sliceCount; i++) {
        if (excludeSlices.includes(i)) {
            continue;
        }
        const newLength = (otMeta.slices[i].endPoint -
          otMeta.slices[i].startPoint);
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
        if (otMeta.slices[i].name) {
            slice.file.name = otMeta.slices[i].name;
        }
        slice.meta = {
            length: audioArrayBuffer.length,
            duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
            startFrame: 0, endFrame: audioArrayBuffer.length,
            checked: true, id: uuid,
            sliceNumber: `${file.meta.sliceNumber
              ? file.meta.sliceNumber + '-'
              : ''}${i + 1}`, slicedFrom: file.meta.id,
            channel: audioArrayBuffer.numberOfChannels > 1 ? 'L' : '',
            opPan: otMeta.slices[i].p ?? 16384,
            opPanAb: otMeta.slices[i].pab ?? false,
            opPitch: otMeta.slices[i].st ?? 0
        };
        slice.meta.customSlices = false;
        slice.meta.op1Json = false;
        slice.meta.slices = false;

        file.buffer.getChannelData(0).
          slice(otMeta.slices[i].startPoint, otMeta.slices[i].endPoint).
          forEach((a, idx) => slice.buffer.getChannelData(0)[idx] = a);
        if (file.buffer.numberOfChannels === 2) {
            file.buffer.getChannelData(1).
              slice(otMeta.slices[i].startPoint, otMeta.slices[i].endPoint).
              forEach((a, idx) => slice.buffer.getChannelData(1)[idx] = a);
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

const splitEvenly = (
  event, id, slices, pushInPlace = false, excludeSlices = [],
  saveSlicesMetaOnly = false) => {
    const file = getFileById(id);
    const frameSize = file.buffer.length / slices;
    const pushInPlaceItems = [];
    if (saveSlicesMetaOnly) {
        file.meta.slices = Array.from('.'.repeat(slices)).map((x, i) => ({
            s: Math.round((file.buffer.length / slices) * i),
            e: Math.round((file.buffer.length / slices) * (i + 1)),
            n: '',
            l: -1
        })).filter((x, idx) => !excludeSlices.includes(idx));
        metaFiles.removeByName(file.file.filename);
        file.meta.slices = file.meta.slices.length > 0
          ? file.meta.slices
          : false;
        splitAction(event, id);
        return;
    }
    for (let i = 0; i < slices; i++) {
        if (excludeSlices.includes(i)) {
            continue;
        }
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
            sliceNumber: `${file.meta.sliceNumber
              ? file.meta.sliceNumber + '-'
              : ''}${i + 1}`, slicedFrom: file.meta.id,
            channel: audioArrayBuffer.numberOfChannels > 1 ? 'L' : ''
        };

        file.buffer.getChannelData(0).
          slice((i * frameSize), (i * frameSize) + frameSize).
          forEach((a, idx) => slice.buffer.getChannelData(0)[idx] = a);
        if (file.buffer.numberOfChannels === 2) {
            file.buffer.getChannelData(1).
              slice((i * frameSize), (i * frameSize) + frameSize).
              forEach((a, idx) => slice.buffer.getChannelData(1)[idx] = a);
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

const splitByTransient = (file, threshold = .5) => {
    const frameSize = Math.floor(file.buffer.length / 256);
    let transientPositions = [];
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
                if (Math.abs(file.buffer.getChannelData(0)[i]).toFixed(3) ==
                  0 || i +
                  frameSize > file.buffer.length) {
                    //lastEnd =  i + frameSize > file.buffer.length ? i : i + frameSize;
                    lastEnd = i;
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

    transientPositions = transientPositions.filter(s => {
        if (s.startPoint > s.startPoint + 512) {
            return new Array(512).fill(0).every(
              (p, i) => Math.abs(
                file.buffer.getChannelData(0)[s.startPoint - i]) < 0.03);
        } else {
            return true;
        }
    }).map((s, i, a) => {
        s.endPoint = a[i + 1]?.startPoint ??
          (i === a.length - 1 ? file.buffer.length : s.endPoint);
        return s;
    });

// map transient positions into slice object.
    let metaTransient = metaFiles.getByFileName('---sliceToTransientCached---');

    metaTransient.slices = transientPositions;
    metaTransient.sliceCount = metaTransient.slices.length;
    return metaTransient;
};

const splitSizeAction = (event, slices, threshold) => {
    let file, otMeta;
    const sliceGroupEl = document.querySelector(
      `#splitOptions .slice-group`);
    const optionsEl = document.querySelectorAll(
      `#splitOptions .slice-group button`);
    const convertChainButtonEl = document.getElementById('convertChainButton');

    convertChainButtonEl.style.display = 'none';

    if (slices === 'ot' && sliceGroupEl.dataset.id) {
        file = getFileById(sliceGroupEl.dataset.id);
        otMeta = metaFiles.getByFile(file);
        slices = otMeta?.slices ?? [];
        convertChainButtonEl.style.display = slices.length > 0
          ? 'block'
          : 'none';
    }
    if (slices === 'transient' && sliceGroupEl.dataset.id) {
        file = getFileById(sliceGroupEl.dataset.id);
        otMeta = splitByTransient(file, (+threshold) / 100);
        slices = otMeta?.slices ?? [];
    } else {
        metaFiles.removeByName('---sliceToTransientCached---');
    }

    optionsEl.forEach(option => option.classList.add('button-outline'));
    sliceGroupEl.dataset.sliceCount = typeof slices === 'number'
      ? slices ?? 0
      : otMeta?.sliceCount ?? 0;
    optionsEl.forEach((option, index) => {
        (+option.dataset.sel === +sliceGroupEl.dataset.sliceCount && !otMeta) ||
        (option.dataset.sel === 'ot' && otMeta && otMeta.name !==
          '---sliceToTransientCached---') ||
        (option.dataset.sel === 'transient' && otMeta && otMeta.name ===
          '---sliceToTransientCached---') ?
          option.classList.remove('button-outline') :
          option.classList.add('button-outline');
    });
    drawSliceLines(slices, (file || getFileById(lastSelectedRow.dataset.id)),
      otMeta);
    if (file?.meta?.customSlices) {
        file.meta.customSlices = false;
    }
};

const remove = (id) => {
    stopPlayFile(false, id);
    const rowEl = getRowElementById(id);
    const fileIdx = getFileIndexById(id);
    const removed = files.splice(fileIdx, 1);
    const unsortIdx = unsorted.findIndex(uuid => uuid === id);
    unsorted.splice(unsortIdx, 1);
    if (removed[0]) {
        metaFiles.removeByName(removed[0].file.name);
        removed.buffer ? delete removed.buffer : false;
    }
    rowEl.classList.add('hide');
    rowEl.remove();
    storeState();
};

const move = (event, id, direction) => {
    const from = getFileIndexById(id);
    let item;
    let to = direction === 1 ? (from + 1) : (from - 1);
    if (to === -1) { to = files.length - 1; }
    if (to >= files.length) { to = 0; }
    item = files.splice(from, 1)[0];
    if ((event.shiftKey || modifierKeys.shiftKey)) { /*If shift key, move to top or bottom of list.*/
        from > to ? files.splice(0, 0, item) : files.splice(files.length, 0,
          item);
    } else {
        files.splice(to, 0, item);
    }
    renderList();
};
const sort = (event, by, prop = 'meta') => {
    const groupByChecked = (event.shiftKey || modifierKeys.shiftKey);
    const forLocaleCompare = ['name'];
    const mapOrder = (order, prop, by) => (a, b) => {
        let oA = order.indexOf(a[prop][by]);
        let oB = order.indexOf(b[prop][by]);
        return oA >= oB ? 1 : -1;
    }
    if (by === 'id') {
        if (groupByChecked === true) {
            files.sort(
              () => crypto.randomUUID().localeCompare(crypto.randomUUID()));
        } else {
            const newImports = unsorted.filter(u => !importOrder.includes(u));
            importOrder = [...importOrder, ...newImports];
            files.sort(mapOrder(importOrder, prop, by));
            lastSort = '';
        }
    } else if (by === 'note') {
        const noteOrder = [];
        const notes = [
            'C',
            'C#',
            'Db',
            'D',
            'D#',
            'Eb',
            'E',
            'F',
            'F#',
            'Gb',
            'G',
            'G#',
            'Ab',
            'A',
            'A#',
            'Bb',
            'B'];
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach(
          o => notes.forEach(n => noteOrder.push(`${n}${o}`)));
        files = files.sort((a, b) => {
            const noteA = a[prop][by];
            const noteB = b[prop][by];
            const noteValueA = noteOrder.indexOf(noteA);
            const noteValueB = noteOrder.indexOf(noteB);
            return noteValueA < noteValueB ? -1 : 1;
        });
        if (lastSort === by) {
            files.reverse();
            lastSort = '';
        } else {
            lastSort = by;
        }
    } else {
        if (lastSort === by) {
            //files.reverse();
            if (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) {
                files.sort((a, b) => (+(b[prop][by].replace(/\D+/gi, ''))  - +(a[prop][by].replace(/\D+/gi, '')) ));
            } else {
                files = forLocaleCompare.includes(by) ?
                  files.sort((a, b) => b[prop][by].localeCompare(a[prop][by])) :
                  files.sort((a, b) => (b[prop][by] - a[prop][by]));
            }
            lastSort = '';
        } else {
            if (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) {
                files.sort((a, b) => (+(a[prop][by].replace(/\D+/gi, '')) - +(b[prop][by].replace(/\D+/gi, '')) ));
            } else {
                files = forLocaleCompare.includes(by) ?
                  files.sort((a, b) => a[prop][by].localeCompare(b[prop][by])) :
                  files.sort((a, b) => (a[prop][by] - b[prop][by]));
            }
            lastSort = by;
        }
    }
    if (groupByChecked === true && by !== 'id') {
        files.sort((a, b) => (b.meta.checked - a.meta.checked));
    }
    if (event.skipRender) {
        return;
    }
    renderList();
};

const selectedHeaderClick = (event, id) => {
    if (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) {
        const allChecked = files.every(f => f.meta.checked);
        files.forEach(f => f.meta.checked = !allChecked);
        renderList();
    } else {
        sort(event, 'checked');
    }
};

const handleRowClick = (event, id) => {
    const row = getRowElementById(id);
    if (document.querySelector('.pop-up.show')) { return; }
    if (lastSelectedRow) { lastSelectedRow.classList.remove('selected'); }
    row.classList.add('selected');
    lastLastSelectedRow = lastSelectedRow;
    lastSelectedRow = row;
    lastSelectedRow.scrollIntoViewIfNeeded(true);
    setCountValues();

};

const rowDragStart = (event) => {
    if (event.target?.classList?.contains('file-row')) {
        lastSelectedRow = event.target;
        attachDragDownloadBlob(event, event.target.dataset.id);
    }
};

const drawSliceLines = (slices, file, otMeta) => {
    const _slices = typeof slices === 'number'
      ? Array.from('.'.repeat(slices)).map((x, i) => ({
          startPoint: (file.buffer.length / slices) * i,
          endPoint: (file.buffer.length / slices) * (i + 1)
      }))
      : slices;
    const sliceLinesEl = document.getElementById('sliceLines');
    const splitPanelWaveformContainerEl = document.querySelector(
      `#splitOptions .waveform-container`);
    const waveformWidth = splitPanelWaveformContainerEl.dataset.waveformWidth;
    let lines = [];
    if (file && otMeta) {
        let scaleSize = file.buffer.length / waveformWidth;
        lines = otMeta.slices.map(
            (slice, idx) => `
                <div
                    class="line ${(slice.loopPoint??-1) !== -1 ? 'slice-loop' : ''} ${(file.meta?.otLoop === 1 && slice.startPoint >= file.meta?.otLoopStart) ? 'file-loop-on' : ''} ${(file.meta?.otLoop === 2 && slice.startPoint >= file.meta?.otLoopStart) ? 'file-loop-pp' : ''}"
                    data-idx="${idx}"
                    onclick="digichain.sliceAction(event, '${file.meta.id}', {startPoint: '${slice.startPoint}', endPoint: '${slice.endPoint}'})"
                    ondblclick="this.classList[this.classList.contains('fade') ? 'remove' : 'add']('fade')"
                    title="${slice.name || ('Slice ' + (idx + 1))}"
                    style="margin-left:${(slice.startPoint / scaleSize)}px; width:${(slice.endPoint / scaleSize) - (slice.startPoint / scaleSize)}px;"
                ></div>
            `
        );
    } else {
        lines = _slices.map((slice, idx) => `
            <div class="line" data-idx="${idx}" onpointerdown="digichain.playSlice(event, '${file.meta.id}', '${slice.startPoint}', '${slice.endPoint}')" ondblclick="this.classList[this.classList.contains('fade') ? 'remove' : 'add']('fade')"style="margin-left:${(waveformWidth /
                _slices.length) * idx}px; width:${(waveformWidth /
                _slices.length)}px;" title="Slice ${idx + 1}"></div>
        `);
        //
        // lines = _slices.map((slice, idx) => `
        //   <div class="line" onclick="digichain.selectSlice(event)" style="margin-left:${(waveformWidth/_slices.length) * idx}px; width:${(waveformWidth/_slices.length)}px;"></div>
        // `);
    }
    sliceLinesEl.innerHTML = lines.join('');
};

const splitAction = (event, id, slices, saveSlicesMetaOnly) => {
    const el = document.getElementById('splitOptions');
    const fileNameEl = document.getElementById('splitFileName');
    const sliceGroupEl = document.querySelector(
      `#splitOptions .slice-group`);
    const sliceByOtButtonEl = document.getElementById('sliceByOtButton');
    const sliceByTransientButtonEl = document.getElementById(
      'sliceByTransientButton');
    const sliceByTransientThresholdEl = document.getElementById(
      'transientThreshold');
    const splitPanelWaveformContainerEl = document.querySelector(
      `#splitOptions .waveform-container`);
    const splitPanelWaveformEl = document.getElementById('splitPanelWaveform');
    const excludeSlices = [...el.querySelectorAll(`div.line.fade`)].map(
      s => +s.dataset.idx);
    let item;
    let otMeta;
    let pushInPlace = (event.shiftKey || modifierKeys.shiftKey);
    if ((event.target.className.includes('is-') ||
        event.target.parentElement.className.includes('is-')) &&
      (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey)) {
        item = getFileById(id || lastSelectedRow.dataset.id);
        const confirmClear = confirm(`Clear slice data for ${item.file.name}?`);
        if (confirmClear) {
            item.meta.slices = false;
            if (item.meta.op1Json) {
                item.meta.op1Json = false;
            }
            metaFiles.removeByName(item.file.name);
            reRenderListRow(item.meta.id);
        }
        return;
    }
    if (id) {
        lastSelectedRow = getRowElementById(id);
        sliceGroupEl.dataset.id = id;
    }
    if (slices === true) { slices = sliceGroupEl.dataset.sliceCount; }
    item = getFileById(id || lastSelectedRow.dataset.id);
    if (slices) {
        id = id || item.meta.id;
        if (slices === 'ot' ||
          !sliceByTransientButtonEl.classList.contains('button-outline') ||
          !sliceByOtButtonEl.classList.contains('button-outline')) {
            const sliceSource = sliceByTransientButtonEl.classList.contains(
              'button-outline') ? 'ot' : 'transient';
            splitByOtSlices(event, id, pushInPlace, sliceSource, excludeSlices,
              saveSlicesMetaOnly);
        } else {
            if (item.meta.customSlices) {
                splitByOtSlices(event, id, pushInPlace, 'custom', excludeSlices,
                  saveSlicesMetaOnly);
            } else {
                splitEvenly(event, id, slices, pushInPlace, excludeSlices,
                  saveSlicesMetaOnly);
            }
        }
        if (saveSlicesMetaOnly) {
            setTimeout(() => sliceByOtButtonEl.dispatchEvent(new PointerEvent('pointerdown')), 250);
        } else {
            return el.close();
        }
    }
    otMeta = metaFiles.getByFile(item);
    fileNameEl.textContent = getNiceFileName('', item, true);
    sliceByOtButtonEl.style.display = otMeta ? 'inline-block' : 'none';
    sliceByOtButtonEl.textContent = otMeta ? `${otMeta.sliceCount}` : 'OT';
    splitSizeAction(false, 0);
    if (!el.open) { el.showModal(); }
    drawWaveform(item, splitPanelWaveformEl, item.meta?.channel ?? 0, {
        width: +splitPanelWaveformContainerEl.dataset.waveformWidth, height: 128
    });
    item.meta.customSlices = false;
    if (otMeta?.sliceCount) {
        sliceByOtButtonEl.dispatchEvent(new PointerEvent('pointerdown'));
    }
    reRenderListRow(item.meta.id);
};

const secondsToMinutes = (time) => {
    const mins = Math.floor(time / 60);
    const seconds = Number(time % 60).toFixed(2);
    return mins > 0 ? `${mins}m ${Math.round(+seconds)}s` : `${seconds}s`;
};

const clearModifiers = () => {
    modifierKeys.shiftKey = false;
    modifierKeys.ctrlKey = false;
    document.body.classList.remove('shiftKey-down');
    document.body.classList.remove('ctrlKey-down');
};

const setCountValues = () => {
    const filesSelected = files.filter(f => f.meta.checked);
    const selectionCount = filesSelected.length;
    const filesDuration = files.reduce((a, f) => a += +f.meta.duration, 0);
    const filesSelectedDuration = filesSelected.reduce(
      (a, f) => a += +f.meta.duration, 0);
    const joinCount = selectionCount === 0 ? 0 : (selectionCount > 0 &&
    sliceGrid > 0 ? Math.ceil(selectionCount / sliceGrid) : 1);
    document.getElementById(
      'fileNum').textContent = `${files.length}/${selectionCount}`;
    document.querySelector(
      '.selection-count').textContent = ` ${selectionCount || '-'} `;
    document.querySelector(
      '.selection-count').dataset.selectionCount = selectionCount;
    document.getElementById(
      'lengthHeaderLink').textContent = `Length (${secondsToMinutes(
      filesSelectedDuration)}/${secondsToMinutes(filesDuration)})`;
    if (secondsPerFile === 0) {
        document.querySelectorAll('.join-count').
          forEach((el, idx) => {
              el.textContent = ` ${
                joinCount === 0
                  ? '-'
                  : joinCount}${idx === 0 ? ' Spaced' : ''}${joinCount === 1
                ? ' Chain'
                : ' Chains'}`;
              el.dataset.joinCount = joinCount;
          });
        try {
            document.querySelectorAll('tr').
              forEach(row => row.classList.remove('end-of-grid'));
            document.querySelectorAll('tr.checked').forEach(
              (row, i) => (i + 1) % sliceGrid === 0 ? row.classList.add(
                'end-of-grid') : row.classList.remove('end-of-grid'));

        } catch (e) {}
    } else { /*When using max length in seconds.*/
        const calcFiles = (items, count = 0) => {
            let progress = {duration: 0, processed: [], skipped: [], count};
            let _items = items.filter(f => +f.meta.duration < secondsPerFile);
            let maxChainLength = (
              targetContainer === 'a' ? 24 : (sliceGrid === 0
                ? 64
                : sliceGrid));
            while (_items.length > 0) {
                progress = _items.reduce((a, f) => {
                    if (a.duration + +f.meta.duration <=
                      (secondsPerFile * pitchModifier) && a.processed.length <
                      maxChainLength) {
                        a.duration = a.duration + +f.meta.duration;
                        a.processed.push(f);
                    } else {
                        a.skipped.push(f);
                    }
                    return a;
                }, progress);
                progress.count++;
                progress.duration = 0;
                progress.processed = [];
                _items = Array.from(progress.skipped);
                progress.skipped = [];
            }
            return progress.count;
        };

        let joinCountSec = filesSelected.length === 0 ? 0 : calcFiles(
          filesSelected);
        document.querySelector(
          '.join-count-chain').textContent = ` ${joinCountSec === 0
          ? '-'
          : joinCountSec}${joinCountSec === 1 ? ' Chain' : ' Chains'}`;
        document.querySelector(
          '.join-count-chain').dataset.joinCount = joinCountSec;
        try {
            document.querySelectorAll('tr').
              forEach(row => row.classList.remove('end-of-grid'));
        } catch (e) {}
    }
    clearModifiers();
};

function reRenderListRow(id) {
    const item = getFileById(id);
    const rowEl = getRowElementById(id);
    rowEl.innerHTML = buildRowMarkupFromFile(item);
    rowEl.querySelector('canvas.waveform').replaceWith(item.waveform);
}

const getWaveformElementContent = f => {
    if (skipMiniWaveformRender) {
        return `<i onpointerdown="digichain.playFile(event, '${f.meta.id}')" class="gg-play-button waveform-btn ${f.meta.playing
          ? 'playing'
          : ''}"></i>`;
    }
    return `<canvas onpointerdown="digichain.playFile(event, '${f.meta.id}')" class="waveform waveform-${f.meta.id} ${f.meta.playing
      ? 'playing'
      : ''}"></canvas>`;
};

const buildRowMarkupFromFile = (f, type = 'main') => {
    return type === 'main' ?
      `
    <tr class="file-row ${f.meta.checked
        ? 'checked'
        : ''}" data-id="${f.meta.id}"
          onpointerdown="digichain.handleRowClick(event, '${f.meta.id}')"
          ondragstart="digichain.rowDragStart(event)" draggable="true">
      <td>
          <i class="gg-more-vertical"></i>
      </td>
      <td class="toggle-td">
          <button onpointerdown="digichain.toggleCheck(event, '${f.meta.id}')" class="${f.meta.checked
        ? ''
        : 'button-outline'} check toggle-check">&nbsp;</button>
      </td>
      <td class="move-up-td">
          <button title="Move up in sample list." onclick="digichain.move(event, '${f.meta.id}', -1)" class="button-clear move-up"><i class="gg-chevron-up-r has-shift-mod-i"></i></button>
      </td>
      <td class="move-down-td">
          <button title="Move down in sample list." onclick="digichain.move(event, '${f.meta.id}', 1)" class="button-clear move-down"><i class="gg-chevron-down-r has-shift-mod-i"></i></button>
      </td>
      <td class="waveform-td">` +
        getWaveformElementContent(f) +
      `</td>
      <td class="file-path-td">
      ${(f.file.path + f.file.name).length + 4 > 127
        ?
        '<div title="This files path and name will exceed 127 chars." class="path-exceeds-127">'
        :
        '<div>'
      }
          <span class="file-path">${f.file.path}</span>
          <a title="${shiftClickForFileDownload ? 'Shift+Click to d' : 'D'}ownload processed wav file of sample." class="wav-link" onclick="digichain.downloadFile('${f.meta.id}', true, event)">${getNiceFileName(
        f.file.name)}</a>
          ${f.meta.dupeOf ? ' d' : ''}
          ${f.meta.editOf ? ' e' : ''}
          ${f.meta.isMerge ? ' m' : ''}
          ${f.meta.sliceNumber ? ' s' + f.meta.sliceNumber : ''}
          <a class="wav-link-hidden" target="_blank"></a>
          <a class="meta-link-hidden" target="_blank"></a>
          </div>
      </td>
      <td class="duration-td">
          <span>${f.meta.duration} s</span>
      </td>
      <td class="channel-options-td">
          <div class="channel-options has-shift-mod" style="display: ${f.buffer.numberOfChannels >
      1 && masterChannels === 1 ? 'block' : 'none'}">
          <a title="Left channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'L')" class="${f.meta.channel ===
      'L' ? 'selected' : ''} channel-option-L">L</a>
          <a title="Sum to mono" onclick="digichain.changeChannel(event, '${f.meta.id}', 'S')" class="${f.meta.channel ===
      'S' ? 'selected' : ''} channel-option-S">S</a>
          <a title="Right channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'R')" class="${f.meta.channel ===
      'R' ? 'selected' : ''} channel-option-R">R</a>
          <a title="Difference between Left and Right channels" onclick="digichain.changeChannel(event, '${f.meta.id}', 'D')" class="${f.meta.channel ===
      'D' ? 'selected' : ''} channel-option-D">D</a>
          </div>` +

      (targetContainer === 'a' ?
        `<div class="channel-options channel-options-stereo channel-options-stereo-opf ${f.meta.opPanAb
          ? 'op-pan-ab-true'
          : ''}" title="${f.buffer.numberOfChannels === 1
          ? 'Mono sample'
          : 'Stereo sample'}" style="display: ${masterChannels === 2
          ? 'block'
          : 'none'}"
           ondblclick="digichain.changeOpParam(event, '${f.meta.id}', 'baltoggle')"
           >
              <input class="channel-balance" type="range" style="display: ${f.buffer.numberOfChannels ===
        2
          ? 'inline-block'
          : 'none'}" min="0" max="32768" onchange="digichain.changeOpParam(event, '${f.meta.id}', 'bal')" value="${f.meta.opPan ??
        16384}" />
              <i class="gg-shape-circle" style="display: ${f.buffer.numberOfChannels ===
        1 ? 'inline-block' : 'none'}"></i>
              <div style="display: ${f.buffer.numberOfChannels === 2
          ? 'inline-block'
          : 'none'}">
                <span class="op-la"></span>
                <span class="op-rb"></span>
              </div>
          </div>` :
        `<div class="channel-options channel-options-stereo" title="${f.buffer.numberOfChannels ===
        1
          ? 'Mono sample'
          : 'Stereo sample' + (f.meta.dualMono
          ? ' (Dual Mono)'
          : '')}" style="display: ${masterChannels === 2
          ? 'block'
          : 'none'}">
              <i class="gg-shape-circle"></i>
              <i class="gg-shape-circle stereo-circle" style="display: ${f.buffer.numberOfChannels ===
        2 ? 'inline-block' : 'none'}"></i>
          </div>`) +

      `</td>
      <td class="split-td">
          <button title="Slice sample." onpointerdown="digichain.splitAction(event, '${f.meta.id}')" class="button-clear split gg-menu-grid-r ${metaFiles.getByFile(
        f)?.cssClass}" data-slice-count="${f.meta?.slices?.length || f.meta?.op1Json?.sliceCount || ''}"><i class="gg-menu-grid-r has-ctrl-mod-i"></i></button>
      </td>
      <td class="duplicate-td">
          <button title="Duplicate sample." onpointerdown="digichain.duplicate(event, '${f.meta.id}')" class="button-clear duplicate"><i class="gg-duplicate has-shift-mod-i"></i></button>
      </td>
      <td class="toggle-edit-td">
          <button title="Edit" onpointerdown="digichain.showEditPanel(event, '${f.meta.id}')" class="button-clear toggle-edit"><i class="gg-pen"></i></button>
      </td>
      <td class="remove-td">
          <button title="Remove sample (double-click)." ondblclick="digichain.remove('${f.meta.id}')" class="button-clear remove"><i class="gg-trash"></i></button>
      </td>
    </tr>` :
      `
<tr class="file-row" data-id="${f.meta.id}">
  <td class="file-path-td">
    <span class="file-path">${f.file.path}</span>
    <span>${getNiceFileName(
        f.file.name)}</span>
    ${f.meta.dupeOf ? ' d' : ''}
    ${f.meta.editOf ? ' e' : ''}
    ${f.meta.isMerge ? ' m' : ''}
    ${f.meta.sliceNumber ? ' s' + f.meta.sliceNumber : ''}
    <a class="wav-link-hidden" target="_blank"></a>
  </td>
  <td class="duration-td">
    <span>${f.meta.duration} s</span>
  </td>
  <td class="channel-options-td"">
      <div class="channel-options" style="display: ${f.buffer.numberOfChannels >
      1 ? 'block' : 'none'}">
      <a title="Left channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'L', false, '#mergeList')" class="${f.meta.channel ===
      'L' ? 'selected' : ''} channel-option-L">L</a>
      <a title="Sum to mono" onclick="digichain.changeChannel(event, '${f.meta.id}', 'S', false, '#mergeList')" class="${f.meta.channel ===
      'S' ? 'selected' : ''} channel-option-S">S</a>
      <a title="Right channel" onclick="digichain.changeChannel(event, '${f.meta.id}', 'R', false, '#mergeList')" class="${f.meta.channel ===
      'R' ? 'selected' : ''} channel-option-R">R</a>
      <a title="Difference between Left and Right channels" onclick="digichain.changeChannel(event, '${f.meta.id}', 'D', false, '#mergeList')" class="${f.meta.channel ===
      'D' ? 'selected' : ''} channel-option-D">D</a>
      </div>
      <div class="channel-options channel-options-stereo" title="Mono sample" style="display: ${f.buffer.numberOfChannels ===
      1 ? 'block' : 'none'}">
          <i class="gg-shape-circle"></i>
      </div>
  </td>
  <td class="pan-options-td ${type === 'blend' ? 'hide' : ''}">
      <div class="pan-options" style="display: block;">
      <a title="Hard Left" onclick="digichain.changePan(event, '${f.meta.id}', 'L')" class="${f.meta.pan ===
      'L' ? 'selected' : ''} pan-option-L">L</a>
      <a title="Centre" onclick="digichain.changePan(event, '${f.meta.id}', 'C')" class="${f.meta.pan ===
      'C' ? 'selected' : ''} pan-option-C">C</a>
      <a title="Hard Right" onclick="digichain.changePan(event, '${f.meta.id}', 'R')" class="${f.meta.pan ===
      'R' ? 'selected' : ''} pan-option-R">R</a>
      </div>
  </td>
</tr>`;
};

const drawEmptyWaveforms = (_files) => {
    const canvasElements = document.querySelectorAll('.waveform');
    if (canvasElements.length === 0) {
        document.querySelectorAll('.waveform-btn').forEach((el, i) => {
            if (!_files[i] || _files[i].waveform) { return; }
            _files[i].waveform = el;
        });
        return setCountValues();
    }
    canvasElements.forEach((el, i) => {
        if (!_files[i]) { return; }
        if (_files[i].waveform) {
            el.replaceWith(_files[i].waveform);
            if (_files[i].playHead && !_files[i].waveform.nextElementSibling) {
                _files[i].waveform.parentElement.appendChild(
                  _files[i].playHead);
            }
        } else {
            drawWaveform(_files[i], el,
              ((masterChannels > 1 && _files[i].buffer.numberOfChannels > 1)
                ? 'S'
                : _files[i].meta?.channel ?? 0));
            _files[i].waveform = el;
        }
    });
    setCountValues();
};

const renderRow = (item, type) => {
    const rowData = item || getFileById(lastSelectedRow.dataset.id);
    const rowEl = item ? getRowElementById(item.meta.id) : lastSelectedRow;
    rowEl.innerHTML = buildRowMarkupFromFile(rowData, type);
    drawEmptyWaveforms(files);
    document.body.classList.remove('loading');
};

const renderList = (fromIdb = false) => {
    listEl.innerHTML = showSamplesList ?
      files.map(f => buildRowMarkupFromFile(f)).join('') :
      `<tr><td colspan="14" style="padding: 2.5rem 1rem 0 4rem;"><p>Hiding samples list, press <code>Shift + L</code> to show.</p></td></tr>`;
    if (files.length === 0) {
        listEl.innerHTML = '';
    }
    document.body.classList.remove('loading');
    drawEmptyWaveforms(files);
    if (files.length && !fromIdb) {
        storeState();
    }
};
const bytesToInt = (bh, bm, bl) => {
    return ((bh & 0x7f) << 7 << 7) + ((bm & 0x7f) << 7) + (bl & 0x7f);
};

function noteFromFileName(name) {
    const match = name.match(/(_| |-)([A-Ga-g](?:#|b)?)(-?\d+)\.\w+$/);
    return match && match.length > 2 ? (match[1] + match[2] +
      (match[3] || '')).replace(/_|-|\./g, '').trim() : '';
}

async function createOtMetaFile() {
    const el = document.getElementById('splitOptions');
    const metaEl = getRowElementById(lastSelectedRow.dataset.id).querySelector('.meta-link-hidden');
    const file = getFileById(lastSelectedRow.dataset.id);
    const excludeSlices = [...el.querySelectorAll(`div.line.fade`)].map(
      s => +s.dataset.idx);
    const slices = metaFiles.getByFileInDcFormat(file).filter(
      (x, idx) => !excludeSlices.includes(idx));

    const otFile = await createAndSetOtFileLink(slices, file, file.file.name, metaEl, true);
    if (otFile) { metaEl.click(); }
}

async function createAndSetOtFileLink(slices, file, fileName, linkEl, skipExportWithCheck) {
    if (checkShouldExportOtFile(skipExportWithCheck) && slices && slices.length > 0) {
        let bufferLength = file.buffer.length;
        const tempo = await detectTempo(file.buffer, fileName);
        let _slices = slices.length > 64 ? slices.slice(0, 64) : slices;
        let data = encodeOt(_slices, bufferLength, tempo?.match??120, {
            loop: file.meta.otLoop??0,
            loopStart: file.meta.otLoopStart??0
        });
        let fName = fileName.replace(/\.[^.]*$/, '.ot')
        if (!data) { return false; }
        let blob = new window.Blob([data], {
            type: 'application/octet-stream'
        });
        if (linkEl) {
            linkEl.href = URL.createObjectURL(blob);
            linkEl.setAttribute('download', fName);
        }
        return {blob: blob, name: fName};
    }
    return false;
}

const parseXml = (xml, fullPath) => {
    let uuid = crypto.randomUUID();
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const docType = doc.childNodes[0].tagName;

        if (docType === 'RenoiseSong') {
            const path = fullPath.replace('Song.xml', '');
            const samples = [...doc.getElementsByTagName('Sample')];
            const sampleSlices = samples.map(sample => ({
                uuid: crypto.randomUUID(),
                name: sample.getElementsByTagName('Name')[0].textContent,
                loopEnd: +sample.getElementsByTagName('DisplayLength')[0].textContent,
                slices: [...sample.getElementsByTagName('SliceMarker')].map(
                  slice => +slice.getElementsByTagName('SamplePosition')[0].textContent
                )
            })).filter(sample => sample.slices.length > 0)

            sampleSlices.forEach(sample => {
                uuid = sample.uuid;
                metaFiles.push({
                    uuid,
                    name: sample.name,
                    path: path,
                    sliceCount: sample.slices.length,
                    loopEnd: sample.loopEnd,
                    slices: sample.slices.map((slice, idx, slices) => ({
                        startPoint: slice,
                        endPoint: slices[idx + 1] ?? sample.loopEnd,
                        loopPoint: -1
                    }))
                });
                unsorted.push(uuid);
            });
        }
        return uuid;
    } catch (err) {
        return {uuid, failed: true};
    }
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
        if (![
            0x46, 0x4F, 0x52, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x44, 0x50, 0x53,
            0x31, 0x53, 0x4D, 0x50, 0x41].every(
          (b, i) => b === fd[i])
        ) {
            return {uuid, failed: true};
        }
        let loop = getInt32([fd[39], fd[40], fd[41], fd[42]]);
        let loopStart = getInt32([fd[54], fd[55], fd[56], fd[57]]);
        let slices = [];
        let sliceCount = getInt32([fd[826], fd[827], fd[828], fd[829]]);
        let t = 58;
        for (let s = 0; s < sliceCount; s++) {
            if (masterSR === 44100) {
                slices.push({
                    startPoint: getInt32(
                      [fd[t], fd[t + 1], fd[t + 2], fd[t + 3]]),
                    endPoint: getInt32(
                      [fd[t + 4], fd[t + 5], fd[t + 6], fd[t + 7]]),
                    loopPoint: getInt32(
                      [fd[t + 8], fd[t + 9], fd[t + 10], fd[t + 11]])
                });
            } else {
                slices.push({
                    startPoint: Math.round(
                      (getInt32([fd[t], fd[t + 1], fd[t + 2], fd[t + 3]]) /
                        44100) *
                      masterSR),
                    endPoint: Math.round(
                      (getInt32([fd[t + 4], fd[t + 5], fd[t + 6], fd[t + 7]]) /
                        44100) * masterSR),
                    loopPoint: Math.round(
                      (getInt32(
                          [fd[t + 8], fd[t + 9], fd[t + 10], fd[t + 11]]) /
                        44100) * masterSR)
                });
            }
            t = t + 12;
        }
        metaFiles.push({
            uuid,
            name: file.name,
            path: fullPath,
            cssClass: 'is-ot-file',
            otLoop: loop,
            otLoopStart: loopStart,
            sliceCount,
            slices
        });
        unsorted.push(uuid);
        return uuid;
    } catch (err) {
        return {uuid, failed: true};
    }
};
const parseAif = async (
  arrayBuffer, fd, file, fullPath = '', pushToTop = false) => {
    const uuid = file.uuid || crypto.randomUUID();
    let result;
    try {
        let dv = new DataView(arrayBuffer);
        let chunks = {};
        let chunkKeys = ['FORM', 'COMM', 'APPL', 'SSND'];

        const getChunkData = (code, offset) => {
            switch (code) {
                case 'FORM':
                    chunks.form = {
                        offset,
                        id: String.fromCharCode(dv.getUint8(offset),
                          dv.getUint8(offset + 1),
                          dv.getUint8(offset + 2), dv.getUint8(offset + 3)),
                        fileSize: dv.getUint32(offset + 4),
                        type: String.fromCharCode(dv.getUint8(offset + 8),
                          dv.getUint8(offset + 9), dv.getUint8(offset + 10),
                          dv.getUint8(offset + 11))
                    };
                    break;
                case 'COMM':
                    chunks.comm = {
                        offset,
                        id: String.fromCharCode(dv.getUint8(offset),
                          dv.getUint8(offset + 1), dv.getUint8(offset + 2),
                          dv.getUint8(offset + 3)),
                        size: dv.getUint32(offset + 4),
                        channels: dv.getUint16(offset + 8),
                        frames: dv.getUint32(offset + 10),
                        bitDepth: dv.getUint16(offset + 14),
                        sampleRate: ((os) => {
                            const srArr = [];
                            for (let x = os; x < os + 10; x++) {
                                srArr.push(dv.getUint8(x));
                            }
                            return getAifSampleRate(srArr);
                        })(offset + 16)
                    };
                    break;
                case 'APPL'://'op-1':
                    const utf8Decoder = new TextDecoder('utf-8');
                    //let maxSize = chunks.form.type === 'AIFC' ? 44100 * 20 : 44100 * 12;
                    //let scale = chunks.form.type === 'AIFC' &&
                    let scale = chunks.comm.channels === 2 ? 2434 : 4058;
                    chunks.json = {
                        id: String.fromCharCode(dv.getUint8(offset),
                          dv.getUint8(offset + 1), dv.getUint8(offset + 2),
                          dv.getUint8(offset + 3)),
                        size: dv.getUint32(offset + 4),
                        //bytesInLength: maxSize * 2,
                        scale
                    };
                    let jsonString = utf8Decoder.decode(
                      arrayBuffer.slice(offset + 12,
                        chunks.json.size + offset + 8));
                    chunks.json.data = JSON.parse(
                      jsonString.replace(/\]\}(.|\n)+/gi, ']}').trimEnd());
                    // if (chunks.json.data?.original_folder === 'digichain') {
                    //   chunks.json.scale = 2434;
                    // }
                    //jsonString.replace(/\]\}.*/gi, ']}').trimEnd());
                    break;
                case 'SSND':
                    chunks.buffer = arrayBuffer.slice(offset + 4);
                    chunks.bufferDv = new DataView(chunks.buffer);
            }
        };

        for (let i = 0; i < dv.byteLength - 4; i++) {
            const code = String.fromCharCode(dv.getUint8(i), dv.getUint8(i + 1),
              dv.getUint8(i + 2), dv.getUint8(i + 3));
            if (chunkKeys.includes(code)) {
                getChunkData(code, i);
                chunkKeys = chunkKeys.filter(k => k !== code);
            }
        }

        /*Only supporting 16bit Aif files, other bit-depths will be skipped.*/
        if (+chunks.comm.bitDepth !== 16) {
            const loadingEl = document.getElementById('loadingText');
            loadingEl.textContent = `Skipping unsupported ${chunks.comm.bitDepth}bit aif file '${file.name}'...`;
            delete chunks.buffer;
            delete chunks.bufferDv;
            dv = false;
            arrayBuffer = false;
            return {uuid, failed: true};
        }

        const offset = 4; // The offset of the first byte of audio data
        const bytesPerSample = chunks.comm.bitDepth / 8;
        const channels = [];
        for (let i = 0; i < chunks.comm.channels; i++) {
            channels.push(new Float32Array(chunks.comm.frames));
        }

        for (let i = 0; i < chunks.comm.channels; i++) {
            let channel = channels[i];
            for (let j = 0; j < chunks.comm.frames; j++) {
                let index = offset;
                index += (j * chunks.comm.channels + i) * bytesPerSample;
                // Sample
                let value = chunks.bufferDv.getInt16(index,
                  chunks.form.type === 'AIFC');
                // Scale range from 0 to 2**bitDepth -> -2**(bitDepth-1) to
                // 2**(bitDepth-1)
                let range = 1 << chunks.comm.bitDepth - 1;
                if (value >= range) {
                    value |= ~(range - 1);
                }
                // Scale range to -1 to 1
                channel[j] = value / range;
                if (j === 0) {
                    channel[j] = 0;
                }
            }
        }

        let resample, resampleR;
        resample = new Resampler(chunks.comm.sampleRate, masterSR, 1,
          channels[0]);
        resample.resampler(resample.inputBuffer.length);

        if (chunks.comm.channels === 2) {
            resampleR = new Resampler(chunks.comm.sampleRate, masterSR, 1,
              channels[1]);
            resampleR.resampler(resampleR.inputBuffer.length);
        }

        const audioArrayBuffer = audioCtx.createBuffer(
          chunks.comm.channels,
          resample.outputBuffer.length,
          masterSR
        );
        if (chunks.comm.channels === 2) {
            for (let i = 0; i < resample.outputBuffer.length; i++) {
                audioArrayBuffer.getChannelData(
                  0)[i] = resample.outputBuffer[i];
                audioArrayBuffer.getChannelData(
                  1)[i] = resampleR.outputBuffer[i];
            }
        } else {
            for (let i = 0; i < resample.outputBuffer.length; i++) {
                audioArrayBuffer.getChannelData(
                  0)[i] = resample.outputBuffer[i];
            }
        }
        const getRelPosition = (v, i) => {
            //const cVal = Math.min(Math.max(v - 1, 0), chunks.json.maxSize);
            //return Math.round((chunks.comm.frames * 44100) / chunks.json.bytesInLength * cVal * 2);
            //return v / (chunks.json.bytesInLength / chunks.comm.frames);
            return (v / chunks.json.scale) - (i * 13);
        };

        /*Update the slice points to masterSR - hardcoded to 44100 as OP sample rate will always be this.*/
        if (chunks.json && chunks.json.data.start) {
            chunks.json.data.start = chunks.json.data.start.map(
              (s, i) => Math.floor((getRelPosition(s, i) / 44100) * masterSR));
        }
        if (chunks.json && chunks.json.data.end) {
            chunks.json.data.end = chunks.json.data.end.map(
              (s, i) => Math.floor((getRelPosition(s, i) / 44100) * masterSR));
        }

        const parsedFile = {
            file: {
                lastModified: file.lastModified,
                name: getUniqueName(files, file.name),
                filename: file.name,
                path: fullPath.replace(file.name, ''),
                size: file.size,
                type: file.type
            },
            buffer: audioArrayBuffer, meta: {
                length: audioArrayBuffer.length,
                duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
                startFrame: 0, endFrame: audioArrayBuffer.length,
                op1Json: chunks.json ? chunks.json.data : false,
                channel: audioArrayBuffer.numberOfChannels > 1 ? 'L' : '',
                checked: true, id: uuid,
                slices: false,
                note: noteFromFileName(file.name)
            }
        };
        const otMeta = metaFiles.getByFile(parsedFile);
        if (otMeta && parsedFile.meta.op1Json) {
            parsedFile.meta.op1Json.sliceCount = otMeta.sliceCount;
        }
        files[pushToTop ? 'unshift' : 'push'](parsedFile);
        unsorted.push(uuid);
        return uuid;
    } catch (err) {
        return {uuid, failed: true};
    }
};

const parseSds = (fd, file, fullPath = '', pushToTop = false) => {
    const uuid = file.uuid || crypto.randomUUID();
    try {
        // Check header is correct.
        if (!(fd[0] === 240 && fd[1] === 126 && fd[3] === 1 && fd[20] ===
          247)) {
            return {uuid, failed: true};
        }
        const bitRate = fd[6];
        const sampleRate = Math.ceil(10e7 / bytesToInt(fd[9], fd[8], fd[7])) *
          10;
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
            for (let t = (idx + 5); t < (idx + 125) && lengthRead <
            length; t += 3) {
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
                name: getUniqueName(files, file.name),
                filename: file.name,
                path: fullPath.replace(file.name, ''),
                size: file.size,
                type: file.type
            },
            buffer: audioArrayBuffer, meta: {
                length: resample.outputBuffer.length,
                loopStart,
                loopEnd,
                loopType,
                duration: Number(resample.outputBuffer.length / masterSR).
                  toFixed(3),
                startFrame: 0,
                endFrame: resample.outputBuffer.length,
                checked: true,
                id: uuid,
                slices: false,
                note: noteFromFileName(file.name)
            }
        });
        unsorted.push(uuid);
        return uuid;
    } catch (err) {
        return {uuid, failed: true};
    }
};

const parsePti = async (buffer, audioDataBuffer, file, fullPath = '') => {
    const uuid = file.uuid || crypto.randomUUID();
    try {
        const audioArrayBuffer = (masterSR !== 44100
          ? new AudioContext(
            {
                sampleRate: 44100,
                latencyHint: 'interactive'
            })
          : audioCtx).createBuffer(1, audioDataBuffer.length - 4, 44100);

        for (let i = 0; i < audioDataBuffer.length - 4; i++) {
            const v = audioDataBuffer[i] / 32768;
            audioArrayBuffer.getChannelData(0)[i] = v < 0 ? Math.max(-1, v) : Math.min(v, 1);
        }

        let resampleBuffer;
        if (masterSR !== 44100) {
            let resample;
            resample = new Resampler(44100, masterSR, 1,
              audioArrayBuffer.getChannelData(0));
            resample.resampler(resample.inputBuffer.length);

            const resampleBuffer = audioCtx.createBuffer(
              1,
              resample.outputBuffer.length,
              masterSR
            );

            for (let i = 0; i < resample.outputBuffer.length; i++) {
                resampleBuffer.getChannelData(
                  0)[i] = resample.outputBuffer[i];
            }
        }

        let dv = new DataView(buffer);
        const sliceCount = dv.getUint8(376);
        let slices = [];
        for (let i = 280; i < 280 + (sliceCount * 2); i += 2) {
            slices.push(dv.getUint16(i, true));
        }
        slices = slices.map(
          slice => (slice / 65535) * (resampleBuffer || audioArrayBuffer).length
        );
        slices = slices.map((slice, sliceIdx) => ({
            s: slice,
            e: sliceIdx !== sliceCount - 1 ? slices[sliceIdx +
            1] : (resampleBuffer || audioArrayBuffer).length,
            l: -1,
            n: `Slice ${sliceIdx + 1}`
        }));

        const parsedFile= {
            file: {
                lastModified: file.lastModified,
                name: getUniqueName(files, file.name),
                filename: file.name,
                path: fullPath.replace(file.name, ''),
                size: file.size,
                type: file.type
            },
            buffer: (resampleBuffer ||audioArrayBuffer), meta: {
                length: (resampleBuffer ||audioArrayBuffer).length,
                duration: Number((resampleBuffer ||audioArrayBuffer).length / masterSR).toFixed(3),
                startFrame: 0, endFrame: (resampleBuffer ||audioArrayBuffer).length,
                channel: (resampleBuffer ||audioArrayBuffer).numberOfChannels > 1 ? 'L' : '',
                checked: true, id: uuid,
                slices: slices.length > 1 ? slices : false,
                note: noteFromFileName(file.name)
            }
        };

        files.push(parsedFile);
        unsorted.push(uuid);
        return uuid;
    } catch (err) {
        return {uuid, failed: true};
    }
};

const parseWav = (
  audioArrayBuffer, arrayBuffer, file, fullPath = '', pushToTop = false,
  checked = true) => {
    const uuid = file.uuid || crypto.randomUUID();
    let slices = false;
    try {
        let dv = new DataView(arrayBuffer);
        for (let i = 0; i < dv.byteLength - 4; i++) {
            const code = String.fromCharCode(dv.getUint8(i), dv.getUint8(i + 1),
              dv.getUint8(i + 2), dv.getUint8(i + 3));
            if (code === 'data') {
                const size = dv.getUint32(i + 4, true);
                if (size && size < dv.byteLength) {
                    i = i < size ? size - 8 : i;
                    continue;
                }
            }
            if (code === 'DCSD') {
                const size = dv.getUint32(i + 4, true);
                const utf8Decoder = new TextDecoder('utf-8');
                let jsonString = utf8Decoder.decode(
                  arrayBuffer.slice(i + 8, i + 8 + size));
                const json = JSON.parse(jsonString.trimEnd());
                if (json.sr !== masterSR) {
                    slices = json.dcs.map(slice => ({
                        s: Math.round((slice.s / json.sr) * masterSR),
                        e: Math.round((slice.e / json.sr) * masterSR),
                        l: Math.round(((slice.l || -1) / json.sr) * masterSR),
                        n: slice.n
                    }));
                } else {
                    slices = json.dcs;
                }
            }
            if (code === 'cue ') {
                const size = dv.getUint32(i + 4, true);
                const cueCount = dv.getUint32(i + 8, true);
                i += 12;
                const wavSr = dv.getUint32(24, true);
                const cuePoints = [];
                for (let ci = 0; ci < cueCount; ci++) {
                    const cueId = dv.getUint32(i, true);
                    const cuePos = dv.getUint32(i + 20, true);
                    cuePoints.push({cueId, cuePos});
                    i += 24;
                }
                slices = slices || [];
                cuePoints.forEach((cue, cueIdx) => slices.push({
                    s: Math.round((cue.cuePos / wavSr) * masterSR),
                    e: Math.round((
                      (cueIdx !== cuePoints.length - 1 ? cuePoints[cueIdx +
                      1].cuePos : -1)
                      / wavSr) * masterSR),
                    l: -1,
                    n: `Cue ${cue.cueId + 1}`
                }));
            }
            if (code === 'ORSL') {
                const size = dv.getUint32(i + 4);
                const sliceCount = dv.getUint8(i + 8);
                i += 12;
                const slicePoints = [];
                for (let si = 0; si < sliceCount; si++) {
                    const sliceId = dv.getUint8(i);
                    const sliceStart = dv.getUint32(i + 4, true);
                    const sliceEnd = dv.getUint32(i + 8, true);
                    slicePoints.push({sliceId, sliceStart, sliceEnd});
                    i += 32;
                }
                slices = [];
                slicePoints.forEach(slice => slices.push({
                    s: Math.round((slice.sliceStart / file.sampleRate) * masterSR),
                    e: Math.round((slice.sliceEnd / file.sampleRate) * masterSR),
                    l: -1,
                    n: `Slice ${slice.sliceId + 1}`
                }));
            }
        }
    } catch (e) {
        slices = false;
    }
    try {
        /*duration, length, numberOfChannels, sampleRate*/
        let resampledArrayBuffer;

        if (file.sampleRate && file.sampleRate !== masterSR) {
            let resample, resampleR;
            resample = new Resampler(file.sampleRate, masterSR, 1,
              audioArrayBuffer.getChannelData(0));
            resample.resampler(resample.inputBuffer.length);

            if (file.channels === 2) {
                resampleR = new Resampler(file.sampleRate, masterSR, 1,
                  audioArrayBuffer.getChannelData(1));
                resampleR.resampler(resampleR.inputBuffer.length);
            }

            resampledArrayBuffer = audioCtx.createBuffer(
              file.channels,
              resample.outputBuffer.length,
              masterSR
            );

            resampledArrayBuffer.copyToChannel(resample.outputBuffer, 0);
            if (file.channels === 2) {
                resampledArrayBuffer.copyToChannel(resampleR.outputBuffer, 1);
            }
        }

        if (Array.isArray(slices)) {
            /*Set the end point to the length of the buffer is the end is -1*/
            slices.forEach(s => s.e = s.e === -1 ? (resampledArrayBuffer ||
              audioArrayBuffer).length : s.e);
            /*De-dupe the slices list, in the event of both DCSD and cue chunks being found in the wav file data.*/
            const ddSlices = [];
            slices.forEach(
              slice => ddSlices.findIndex(s => s.s === slice.s) > -1
                ? false
                : ddSlices.push(slice));
            slices = ddSlices;
        }
        /*Prefer .ot file slices when available.*/
        const metaFile = metaFiles.getByFileName(file.name);
        let otLoop = 0;
        let otLoopStart = 0;
        if (metaFile && metaFile.slices && metaFile.slices.length > 0) {
            slices = file.name.endsWith('.flac') ?
              metaFile.slices.map((slice, idx) => ({
                  s: (slice.startPoint / metaFile.loopEnd) * (resampledArrayBuffer || audioArrayBuffer).length,
                  e: (slice.endPoint / metaFile.loopEnd) * (resampledArrayBuffer || audioArrayBuffer).length,
                  l: slice.loopPoint
              }))
              : metaFile.slices.map((slice, idx) => ({
                    s: slice.startPoint,
                    e: slice.endPoint,
                    l: slice.loopPoint,
                    n: slice.name || `OT slice ${idx + 1}`
                }));
            otLoop = metaFile.otLoop;
            otLoopStart = metaFile.otLoopStart;
            metaFiles.removeByName(file.name);
        }
        if (Array.isArray(slices)) {
            slices = slices.filter(s => s.s < s.e);
        }

        files[pushToTop ? 'unshift' : 'push']({
            file: {
                lastModified: file.lastModified,
                name: getUniqueName(files, file.name),
                filename: file.name,
                path: fullPath.replace(file.name, ''),
                size: file.size,
                type: file.type
            },
            buffer: (resampledArrayBuffer || audioArrayBuffer),
            meta: {
                sourceBitDepth: file.bitDepth,
                sourceSampleRate: file.sampleRate,
                length: (resampledArrayBuffer || audioArrayBuffer).length,
                duration: Number(
                  (resampledArrayBuffer || audioArrayBuffer).length / masterSR).
                  toFixed(3),
                startFrame: 0,
                endFrame: (resampledArrayBuffer || audioArrayBuffer).length,
                checked: checked,
                id: uuid,
                channel: (resampledArrayBuffer ||
                  audioArrayBuffer).numberOfChannels > 1 ? 'L' : '',
                dualMono: false,
                slices: slices.length > 0 ? slices : false,
                otLoop,
                otLoopStart,
                opPan: 16384,
                opPanAb: false,
                opPitch: 0,
                note: noteFromFileName(file.name)
            }
        });
        unsorted.push(uuid);
        return uuid;
    } catch (err) {
        console.log(err);
        return {uuid, failed: true};
    }
};

const renderListWhenReady = (count, fileCount) => {
    count = count.filter(c => c !== false);
    importOrder = [...new Set(importOrder)];
    if (count.every(c => unsorted.includes(c))) {
        sort({skipRender: true}, 'id');
        renderList();
    } else {
        setTimeout(() => renderListWhenReady(count), 1000);
    }
};

const setLoadingProgress = (count, total) => {
    const el = document.getElementById('loadingText');
    let progress = (count / total) * 100;
    el.style.backgroundImage = `linear-gradient(90deg, #cf8600 ${progress}%, #606c76 ${progress +
    1}%, #606c76 100%)`;
};

const getRandomFileSelectionFrom = (fileCollection) => {
    let selection = [...fileCollection].sort(
      f => crypto.randomUUID().localeCompare(crypto.randomUUID())
    );
    return selection.filter(
      (file, idx) => idx < (sliceGrid > 0 ? sliceGrid : 256) ||
        file.fromArchive);
    //return selection.slice(0, (sliceGrid > 0 ? sliceGrid : 256));
};

const addBlankFile = () => {
    const uuid = crypto.randomUUID();
    checkAndSetAudioContext();
    const audioArrayBuffer = audioCtx.createBuffer(
      masterChannels,
      8,
      masterSR
    );

    for (let channel = 0; channel < masterChannels; channel++) {
        for (let i = 0; i < audioArrayBuffer.length; i++) {
            audioArrayBuffer.getChannelData(channel)[i] = 0;
        }
    }

    const insertAt = lastSelectedRow ? getFileIndexById(
      lastSelectedRow.dataset.id) + 1 : files.length;

    files.splice(insertAt, 0, {
        file: {
            lastModified: Date.now(),
            name: getUniqueName(files, 'blank.wav'),
            filename: 'blank.wav',
            path: '',
            size: 0
        },
        buffer: audioArrayBuffer, meta: {
            length: audioArrayBuffer.length,
            duration: Number(audioArrayBuffer.length / masterSR).toFixed(3),
            startFrame: 0, endFrame: audioArrayBuffer.length,
            checked: true, id: uuid,
            channel: audioArrayBuffer.numberOfChannels > 1 ? 'L' : '',
            dualMono: false,
            slices: false,
            note: ''
        }
    });
    unsorted.push(uuid);
    renderList();
};

const consumeFileInput = (event, inputFiles) => {
    const loadingEl = document.getElementById('loadingText');
    loadingEl.textContent = 'Loading samples';
    document.body.classList.add('loading');
    checkAndSetAudioContext();
    const isAudioCtxClosed = checkAudioContextState();
    if (isAudioCtxClosed) { return; }

    inputFiles = [...inputFiles];

    let _zips = [...inputFiles].filter(
      f => ['zip', 'dtprj', 'xrns'].includes(
        f?.name?.split('.')?.reverse()[0].toLowerCase())
    );

    if (_zips.length > 0) {
        _zips.forEach((archive, zidx) => {
            const zip = new JSZip();
            let prog = 1;
            inputFiles[inputFiles.findIndex(f => f === archive)] = false;
            zip.loadAsync(archive).then(() => {
                const fileCount = Object.keys(zip.files).length;
                const supportedFileCount = importFileLimit &&
                  Object.keys(zip.files).filter(
                    zf => supportedAudioTypes.includes(
                      zf.split('.').at(-1).toLowerCase())
                  ).length;
                if (supportedFileCount + files.length > importFileLimitValue) {
                    loadingEl.textContent = `skipping zip '${archive.name}', files (${supportedFileCount}) will exceed ${importFileLimitValue} file import limit...`;
                    if (zidx === _zips.length - 1) {
                        setTimeout(() => consumeFileInput(event, inputFiles),
                          3000);
                    }
                    return; /*Don't process zip contents if the files count exceed the importLimit if limit is on*/
                }
                for (let key in zip.files) {
                    zip.files[key].async('blob').then(blobData => {
                        blobData.name = key.split('/').at(-1);
                        blobData.fullPath = `${archive.name}/${key}`;
                        blobData.fromArchive = archive.name;
                        inputFiles.push(blobData);
                        blobData.uuid = crypto.randomUUID();
                        if (supportedAudioTypes.some(ext => blobData.name.toLowerCase().endsWith(ext))) {
                            importOrder.push(blobData.uuid);
                        }
                        if (zidx === _zips.length - 1 && prog === fileCount) {
                            consumeFileInput(event, inputFiles);
                        }
                        prog++;
                    });
                }
            });
        });
        return;
    }

    let _files = [...inputFiles].filter(
      f => supportedAudioTypes.includes(
        f?.name?.split('.')?.reverse()[0].toLowerCase())
    );
    let _mFiles = [...inputFiles].filter(
      f => ['ot', 'xml'].includes(f?.name?.split('.')?.reverse()[0].toLowerCase())
    );

    if (event.shiftKey || modifierKeys.shiftKey) {
        _files = getRandomFileSelectionFrom(_files);
    }

    if (importFileLimit && _files.length > importFileLimitValue) {
        _files = _files.filter(
          (file, idx) => idx < importFileLimitValue || file.fromArchive);
    }

    _mFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            file.uuid = crypto.randomUUID();
            file.fullPath = file.fullPath || '';
            if (file.name.toLowerCase().endsWith('.ot')) {
                // binary data
                const buffer = e.target.result;
                const bufferByteLength = buffer.byteLength;
                const bufferUint8Array = new Uint8Array(buffer, 0,
                  bufferByteLength);
                let result = parseOt(bufferUint8Array, file, file.fullPath);
            }
            if (file.name.toLowerCase().endsWith('.xml')) {
                const xmlString = e.target.result;
                parseXml(xmlString, file.fullPath);
            }
        };
        if (file.name.toLowerCase().endsWith('.ot')) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    });
    if (_files.length === 0) {
        return renderList();
    }

    const checkCount = (idx, filesLength) => {
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
    let error = {
        encountered: false,
        text: '',
        count: 0
    };

    _files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                file.uuid = file.uuid || crypto.randomUUID();
                if (supportedAudioTypes.some(ext => file.name.toLowerCase().endsWith(ext))) {
                    importOrder.push(file.uuid);
                }
                file.fullPath = file.fullPath || '';
                const buffer = e.target.result;

                if (file.name.toLowerCase().endsWith('.syx') ||
                  file.name.toLowerCase().endsWith('.aif') ||
                  file.name.toLowerCase().endsWith('.pti')
                ) {
                    // binary data
                    const bufferByteLength = buffer.byteLength;
                    const bufferUint8Array = new Uint8Array(buffer, 0,
                      bufferByteLength);
                    count.push(file.uuid);
                    let result;
                    if(file.name.toLowerCase().endsWith('.aif')){
                        result = await parseAif(buffer, bufferUint8Array, file,
                          file.fullPath)
                    }
                    if (file.name.toLowerCase().endsWith('.syx')) {
                        result = parseSds(bufferUint8Array, file, file.fullPath);
                    }
                    if (file.name.toLowerCase().endsWith('.pti')) {
                        result = await parsePti(buffer, new Int16Array(buffer, 392), file,
                          file.fullPath)
                    }
                    if (result.failed) {
                        count.splice(count.findIndex(c => c === result.uuid),
                          1);
                    }
                    setLoadingProgress(idx + 1, _files.length);
                    checkCount(idx, _files.length);
                }

                if ((
                    file.name.toLowerCase().endsWith('.wav') ||
                    file.type === 'audio/wav') ||
                  file.name.toLowerCase().endsWith('.flac') ||
                  file.name.toLowerCase().endsWith('.webm') ||
                  file.name.toLowerCase().endsWith('.m4a') ||
                  file.name.toLowerCase().endsWith('.mp3')
                ) {
                    count.push(file.uuid);
                    const fb = buffer.slice(0);

                    if (file.name.toLowerCase().endsWith('.wav') ||
                      file.type === 'audio/wav') {
                        let dv = new DataView(buffer);
                        for (let i = 0; i < dv.byteLength - 4; i++) {
                            const code = String.fromCharCode(dv.getUint8(i),
                              dv.getUint8(i + 1),
                              dv.getUint8(i + 2), dv.getUint8(i + 3));
                            if (i > dv.byteLength || code === 'PAD ') {
                                break;
                            }
                            if (code === 'fmt ') {
                                file.channels = dv.getUint16(i + 10, true);
                                file.sampleRate = dv.getUint32(i + 12, true);
                                file.bitDepth = dv.getUint16(i + 22, true);
                                if (file.channels < 1 || file.sampleRate === 0 || file.bitDepth > 32) {
                                    delete file.channels;
                                    delete file.sampleRate;
                                    delete file.bitDepth;
                                } else {
                                    break;
                                }
                            }
                        }
                    }

                    await (masterSR !== file.sampleRate
                      ? new AudioContext(
                        {
                            sampleRate: file.sampleRate,
                            latencyHint: 'interactive'
                        })
                      : audioCtx).decodeAudioData(buffer, data => {
                        let result = parseWav(data, fb, file, file.fullPath);
                        if (result.failed) {
                            count.splice(
                              count.findIndex(c => c === result.uuid), 1);
                        }
                        setLoadingProgress(idx + 1, _files.length);
                        checkCount(idx, _files.length);
                    }, (error) => {
                        count.splice(count.findIndex(c => c === file.uuid), 1);
                        setLoadingProgress(idx + 1, _files.length);
                        checkCount(idx, _files.length);
                    });
                }
            } catch (err) {
                error.encountered = true;
                error.count++;
                if (file.fromArchive) {
                    error.text = `There was an error extracting files from the zip archive, not all zip files are readable.\n
            Please use store or deflate compression methods, and generate files with either 7zip as zip, or Windows Explorer.`;
                }
                if (error.encountered && error.text && idx === _files.length -
                  1) {
                    alert(error.text + ` (failed: ${error.count})`);
                }
            }
        };
        reader.readAsArrayBuffer(file);
    });

    if (digichain.importInt) { clearInterval(digichain.importInt); }
    digichain.importInt = setInterval(() => {
        if (!document.body.classList.contains('loading')) {
            _files.forEach((v, i) => delete _files[i]);
            _files = [];
            _mFiles = [];
            count = [];
            clearInterval(digichain.importInt);
        }
    }, 10000);
};

const dropHandler = (event) => {
    event.preventDefault();
    checkAndSetAudioContext();
    if (event?.dataTransfer?.items?.length &&
      event?.dataTransfer?.items[0].kind === 'string') {
        try {
            event?.dataTransfer?.items[0].getAsString(async link => {
                let linkedFile = await fetch(link);
                if (!linkedFile.url.includes('.wav')) { return; } // probably not a wav file
                let buffer = await linkedFile.arrayBuffer();
                const fb = buffer.slice(0);
                await audioCtx.decodeAudioData(buffer,
                  data => parseWav(data, fb, {
                      lastModified: new Date().getTime(),
                      name: linkedFile.url.split('/').reverse()[0],
                      size: ((masterBitDepth * masterSR *
                          (buffer.length / masterSR)) / 8) *
                        buffer.numberOfChannels / 1024,
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
                      file.uuid = crypto.randomUUID();
                      if (supportedAudioTypes.some(ext => file.name.toLowerCase().endsWith(ext))) {
                          importOrder.push(file.uuid);
                      }
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
        };
        for (const entry of event.dataTransfer.items) {
            const itemAsEntry = entry.getAtEntry
              ? entry.getAtEntry()
              : entry.webkitGetAsEntry();
            if (itemAsEntry) {
                addItem(itemAsEntry);
            }
        }
        let doneInterval = setInterval(() => {
            if (total <= 0 && toConsume.count === toConsume.length) {
                clearInterval(doneInterval);
                consumeFileInput(event, toConsume);
            }
        }, 500);
    } else {
        let target = event.target;
        if (document.getElementById('opExportPanel').
          classList.
          contains('show')) {
            // Block row re-ordering while op export side panel is open.
            return;
        }
        while (target && !target.classList.contains('file-row')) {
            target = target.parentElement || document.body;
            target = target.nodeName === 'THEAD' ? document.querySelector(
              'tr.file-row') : target;
            target = target === document.body ? document.querySelector(
              'tr.file-row:last-of-type') : target;
        }
        if (target) {
            let selectedRowId = getFileIndexById(lastSelectedRow.dataset.id);
            let targetRowId = getFileIndexById(target.dataset.id);
            let item = files.splice(selectedRowId, 1)[0];
            files.splice(targetRowId, 0, item);
            targetRowId === 0 ? target.before(lastSelectedRow) : target.after(
              lastSelectedRow);
        }
    }
};

function init() {

    /*Basic browser version detection - we won't prevent trying to use, just an alert.*/
    (() => {
        try {
            const chromeVersion = navigator.userAgent.match(
              /\d+\.\d+\.\d+\.\d+/);
            if (chromeVersion && chromeVersion[0] &&
              +chromeVersion[0].split('.')[0] < 114) {
                return alert(
                  'Chromium browser versions below 114.x.x are not supported.');
            }
            const safariVersion = navigator.userAgent.match(
              /Version\/\d+\.\d+\.\d+/);
            if (safariVersion && safariVersion[0] &&
              +safariVersion[0].match(/\d+\.\d+/) < 16.3) {
                return alert(
                  'Safari browser versions below 16.3 are not supported.');
            }
            const firefoxVersion = navigator.userAgent.match(
              /Firefox\/\d+\.\d+/);
            if (firefoxVersion && firefoxVersion[0] &&
              +firefoxVersion[0].match(/\d+\.\d+/) < 115) {
                return alert(
                  'Firefox browser versions below 115.x are not supported.');
            }
        } catch (e) {}
    })();

    uploadInput.addEventListener(
      'change',
      () => consumeFileInput({shiftKey: modifierKeys.shiftKey},
        uploadInput.files),
      false
    );
    uploadInput.addEventListener(
      'click',
      (event) => {
          if (event.ctrlKey || event.metaKey || modifierKeys.ctrlKey) {
              event.preventDefault();
              event.stopPropagation();
              addBlankFile();
          }
      },
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
      dropHandler,
      false
    );

    document.body.addEventListener('keyup', (event) => {
        clearModifiers();
    });

    document.body.addEventListener('keydown', (event) => {
        const numberKeys = [
            'Digit1',
            'Digit2',
            'Digit3',
            'Digit4',
            'Digit5',
            'Digit6',
            'Digit7',
            'Digit8',
            'Digit9',
            'Digit0'];
        const eventCodes = [
            'ArrowDown',
            'ArrowUp',
            'Escape',
            'Enter',
            'KeyD',
            'KeyE',
            'KeyG',
            'KeyH',
            'KeyI',
            'KeyL',
            'KeyP',
            'KeyR',
            'KeyS',
            'KeyX',
            ...numberKeys
        ];
        if (keyboardShortcutsDisabled) { return; }

        if (event.shiftKey) { document.body.classList.add('shiftKey-down'); }
        if (event.ctrlKey || event.metaKey) {
            document.body.classList.add('ctrlKey-down');
        }
        if (event.code === 'Escape') {
            if (files.length && !(event.shiftKey || modifierKeys.shiftKey)) {
                files.filter(f => f.meta.playing && f.meta.id).
                  forEach(f => stopPlayFile(false, f.meta.id));
            }
            return closePopUps();
        }

        if (
          document.activeElement.nodeName === 'INPUT' &&
          document.activeElement.disabled === false
        ) {
            return;
        }

        if (event.shiftKey && (event.code === 'KeyK' || event.code === 'Slash')) {
            const shortcutsPanel = document.getElementById('keyboardShortcuts');
            shortcutsPanel.open ? shortcutsPanel.close() : shortcutsPanel.showModal();
            return;
        }

        if (arePopUpsOpen()) {
            // Don't listen for keyboard commands when popups are open.
            // If editor panel is open, use these shortcuts.
            if (document.getElementById('editPanel').open) {
                if (event.code === 'KeyP') {
                    event.altKey
                      ? digichain.editor.editorPlayFile(event, false, true)
                      : digichain.editor.editorPlayFile(event);
                } else if (masterChannels === 1 &&
                  (event.code === 'KeyL' || event.code === 'KeyR' ||
                    event.code ===
                    'KeyS' || event.code === 'KeyD')) {
                    digichain.editor.changeChannel(event,
                      event.code.replace('Key', ''));
                } else if (event.code === 'KeyN') {
                    digichain.editor.sliceCreate(event);
                } else if (event.code === 'KeyU') {
                    digichain.editor.sliceUpdate(event);
                } else if (event.code === 'KeyX') {
                    digichain.editor.sliceRemove(event);
                }
            }
            return;
        }

        if (numberKeys.includes(event.code)) {
            let id = +event.code.charAt(event.code.length - 1);
            const selected = files.filter(f => f.meta.checked);
            id = id === 0 ? 9 : (id - 1);
            if (selected[id]) {
                event.altKey ?
                  stopPlayFile(false, selected[id].meta.id) :
                  playFile(false, selected[id].meta.id,
                    (event.shiftKey || modifierKeys.shiftKey));
            }
        }

        if (event.code === 'ArrowDown' &&
          (!lastSelectedRow || !lastSelectedRow.isConnected)) {
            lastSelectedRow = document.querySelector('#fileList tr');
            return;
        }
        if (files.length && (event.code === 'KeyI')) {
            return invertFileSelection();
        }
        if (files.length && (event.code === 'KeyE')) {
            const editPanelEl = document.getElementById('editPanel');
            if ((event.shiftKey || modifierKeys.shiftKey)) {
                setTimeout(() => {
                    if (editPanelEl.open) {
                        const editFileNameEl = document.getElementById(
                          'editFileName');
                        const editFilePathEl = document.getElementById(
                          'editFilePath');
                        editFileNameEl.removeAttribute('readonly');
                        editFilePathEl.removeAttribute('readonly');
                        editFileNameEl.focus();
                    }
                }, 100);
            }
            return lastSelectedRow
              ? showEditPanel(lastSelectedRow.dataset.id)
              : false;
        }
        if (event.code === 'KeyH' &&
          (event.shiftKey || modifierKeys.shiftKey)) {
            toggleOptionsPanel();
        }
        if (event.code === 'KeyL' &&
          (event.shiftKey || modifierKeys.shiftKey)) {
            toggleListVisibility();
        }
        if (event.code === 'KeyG' &&
          (event.shiftKey || modifierKeys.shiftKey)) {
            document.body.classList.contains('grid-view')
              ? document.body.classList.remove('grid-view')
              : document.body.classList.add('grid-view');
        }
        if (eventCodes.includes(event.code) && lastSelectedRow &&
          lastSelectedRow?.isConnected) {
            if (event.code === 'ArrowDown' &&
              lastSelectedRow.nextElementSibling) {
                if (!(event.shiftKey || modifierKeys.shiftKey)) {
                    return handleRowClick(event,
                      lastSelectedRow.nextElementSibling.dataset.id);
                }
                let idx = getFileIndexById(lastSelectedRow.dataset.id);
                let item = files.splice(idx, 1)[0];
                files.splice(idx + 1, 0, item);
                lastSelectedRow.nextElementSibling.after(lastSelectedRow);
                lastSelectedRow.scrollIntoViewIfNeeded(true);
                setCountValues();
            } else if (event.code === 'ArrowUp' &&
              lastSelectedRow.previousElementSibling) {
                if (!(event.shiftKey || modifierKeys.shiftKey)) {
                    return handleRowClick(event,
                      lastSelectedRow.previousElementSibling.dataset.id);
                }
                let idx = getFileIndexById(lastSelectedRow.dataset.id);
                let item = files.splice(idx, 1)[0];
                files.splice(idx - 1, 0, item);
                lastSelectedRow.previousElementSibling.before(lastSelectedRow);
                lastSelectedRow.scrollIntoViewIfNeeded(true);
                setCountValues();
            } else if (event.code === 'Enter') {
                toggleCheck(event, lastSelectedRow.dataset.id);
            } else if (event.code === 'KeyP') {
                event.altKey
                  ? stopPlayFile(false, lastSelectedRow.dataset.id)
                  : playFile(event, lastSelectedRow.dataset.id);
            } else if (masterChannels === 1 &&
              (event.code === 'KeyL' || event.code === 'KeyR' || event.code ===
                'KeyS' || event.code === 'KeyD')) {
                const item = getFileById(lastSelectedRow.dataset.id);
                if (item.meta.channel) {
                    changeChannel(event, lastSelectedRow.dataset.id,
                      event.code.replace('Key', ''));
                }
            }
        }
    });

    window.addEventListener('beforeunload', (event) => {
        audioCtx?.close();
    });

    /*Actions based on restored local storage states*/
    pitchExports(pitchModifier, true);
    document.querySelector('.touch-buttons').classList[
      showTouchModifierKeys ? 'remove' : 'add'
      ]('hidden');
    if (localStorage.getItem('darkModeTheme') === null) {
        darkModeTheme = window.matchMedia(
          '(prefers-color-scheme: dark)').matches;
        localStorage.setItem('darkModeTheme',
          JSON.stringify(darkModeTheme)
        );
    }
    document.querySelector(`.logo h3`).dataset.version = document.querySelector(
      'meta[name=version]').content;
    document.body.classList[
      darkModeTheme ? 'remove' : 'add'
      ]('light');
    document.body.classList[
      normalizeContrast ? 'add' : 'remove'
      ]('normalize-contrast');
    if (restoreLastUsedAudioConfig) {
        changeAudioConfig(lastUsedAudioConfig, true);
    } else {
        setEditorConf({
            audioCtx,
            masterSR,
            masterChannels,
            masterBitDepth
        });
    }
    setTimeout(() => toggleOptionsPanel(), 250);
    configDb();
    document.getElementById('modifierKeyctrlKey').textContent= navigator.userAgent.indexOf('Mac') !== -1 ? 'CMD' : 'CTRL';
}

function configDb(skipLoad = false) {
    if (!retainSessionState) {return;}
    dbReq = indexedDB.open('digichain', 1);
    dbReq.onsuccess = () => {
        db = dbReq.result;
        checkAndSetAudioContext();
        if (!skipLoad) {
            document.body.classList.add('loading');
            loadState();
        }
    };

    dbReq.onupgradeneeded = event => {
        db = event.target.result;
        db.createObjectStore('state');
    };
}
function storeState() {
    if (!retainSessionState) {return new Promise(resolve => resolve(true));}
    const transaction = db.transaction(['state'], 'readwrite', {durability: 'relaxed'});
    const objectStore = transaction.objectStore('state');
    importOrder = importOrder.filter(id => unsorted.includes(id));
    objectStore.put(unsorted, 'unsorted');
    objectStore.put(importOrder, 'importOrder');
    return new Promise(resolve => {
        objectStore.put(files.map(f => {
            if (f === files.at(-1)) {
                setTimeout(() => resolve(true), 2000);
            }
            return {
                file: f.file,
                meta: f.meta,
                buffer: {
                    duration: f.buffer.duration,
                    length: f.buffer.length,
                    numberOfChannels: f.buffer.numberOfChannels,
                    sampleRate: f.buffer.sampleRate,
                    channel0: f.buffer.getChannelData(0),
                    channel1: f.buffer.numberOfChannels > 1 ? f.buffer.getChannelData(1) : false
                }
            };
        }), 'files');
    });

}
function loadState(skipConfirm = false) {
    if (!retainSessionState) {return;}
    const transaction = db.transaction(['state'], 'readonly');
    const objectStore = transaction.objectStore('state');
    let requestUnsorted = objectStore.get('unsorted');
    let requestImportOrder = objectStore.get('importOrder');
    requestUnsorted.onsuccess = () => {
        if (requestUnsorted.result) {
            unsorted = requestUnsorted.result;
        }
    }
    requestImportOrder.onsuccess = () => {
        if (requestImportOrder.result) {
            importOrder = requestImportOrder.result;
        }
    }
    let requestFiles = objectStore.get('files');
    requestFiles.onsuccess = () => {
        if (requestFiles.result && requestFiles.result.length > 0) {

            if (!skipConfirm) {
                const proceed = confirm(`There are ${requestFiles.result.length} files from your last session, would you like to restore them?`);
                if (!proceed) {
                    clearDbBuffers();
                    document.body.classList.remove('loading');
                    return ;
                }
            }

            files = requestFiles.result.map(f => bufferRateResampler(f));
            renderList(true);
        } else {
            document.body.classList.remove('loading');
        }
    }
}
function clearDbBuffers() {
    db.transaction(['state'], 'readwrite', {durability: 'relaxed'}).objectStore('state').clear();
}

function saveSession() {
    const zip = new JSZip();
    const data = files.map(f => ({
        file: f.file,
        meta: f.meta,
        buffer: {
            duration: f.buffer.duration,
            length: f.buffer.length,
            numberOfChannels: f.buffer.numberOfChannels,
            sampleRate: f.buffer.sampleRate,
            channel0: f.buffer.getChannelData(0),
            channel1: f.buffer.numberOfChannels > 1 ? f.buffer.getChannelData(1) : false
        }
    }));
    const settings = {
        lastUsedAudioConfig,
        workingSR: masterSR,
        sliceOptions
    };
    zip.file('files', JSON.stringify(data), {
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    zip.file('unsorted', JSON.stringify(unsorted), {
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    zip.file('importOrder', JSON.stringify(importOrder), {
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    zip.file('settings', JSON.stringify(settings), {
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    zip.generateAsync({
        type: "blob",
        compression: "DEFLATE"
    }).then(blob => {
        const el = document.getElementById('getJoined');
        el.href = URL.createObjectURL(blob);
        el.setAttribute('download', 'digichain_session.dcsd');
        el.click();
        document.body.classList.remove('loading');
    });
}

if ('launchQueue' in window) {
    window.launchQueue.setConsumer((launchParams) => {
        if (launchParams.files && launchParams.files.length) {
            consumeFileInput({}, launchParams.files);
        }
    });
}

try {
    init();
} catch (err) {
    let alertText = 'An unexpected error was encountered, please refresh the page. ';
    if (navigator.brave) {
        alertText += 'If you are using Brave browser, please disable Brave Shields for digichain.brianbar.net.';
    }
    alert(alertText);
    console.log(err);
}

/*Expose properties/methods used in html events to the global scope.*/
window.digichain = {
    sliceOptions: () => sliceOptions,
    saveSession,
    changeAudioConfig,
    removeSelected,
    toggleSelectedActionsList,
    trimRightSelected,
    roughStretchSelected,
    truncateSelected,
    normalizeSelected,
    reverseSelected,
    shiftSelected,
    pitchUpSelected,
    doubleSelected,
    pingPongSelected,
    fuzzSelected,
    crushSelected,
    fadeSelected,
    stretchSelected,
    shortenNameSelected,
    serializeSelected,
    deserializeSelected,
    condenseSelected,
    nudgeCrossingsSelected,
    padWithZeroSelected,
    showMergePanel,
    showBlendPanel,
    sort,
    selectedHeaderClick,
    renderList,
    renderRow,
    joinAll: joinAllUICall,
    performMergeUiCall,
    performBlendUiCall,
    selectSliceAmount,
    showInfo,
    toggleCheck,
    move,
    playFile,
    playSlice,
    sliceAction,
    stopPlayFile,
    downloadFile,
    downloadAll,
    changeChannel,
    changePan,
    duplicate,
    remove,
    handleRowClick,
    rowDragStart,
    splitAction,
    splitEvenly,
    splitFromFile,
    splitSizeAction,
    splitFromTrack,
    convertChain,
    toggleModifier,
    toggleListVisibility,
    toggleOptionsPanel,
    showExportSettingsPanel,
    showEditPanel,
    closeEditPanel,
    closeSplitOptions,
    createOtMetaFile,
    pitchExports,
    toggleSetting,
    toggleSecondsPerFile,
    changeOpParam,
    toggleHelp,
    toggleChainNamePanel,
    changeChainName,
    generateChainNames,
    removeMetaFile,
    getSlicesFromMetaFile,
    setAudioOptionsFromCommonConfig,
    bufferRateResampler,
    editor
};
