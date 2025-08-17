/*!
DigiChain v1.4.17-latest [ https://digichain.brianbar.net/ ]
<https://github.com/brian3kb/digichain>

(c) 2023 Brian Barnett <me [at] brianbar.net>
[ @brian3kb ]
Licensed under AGPLv3 <https://github.com/brian3kb/digichain/blob/main/LICENSE>

DigiChain bundled resources:
[MIT license] JSZip  : <https://github.com/Stuk/jszip/blob/main/LICENSE.markdown>
[MIT license] Pako : <https://github.com/nodeca/pako/blob/main/LICENSE>
[MIT license] msgpack-lite : <https://github.com/kawanet/msgpack-lite>
[MIT license] Modified version of Audiobuffer-to-wav : <https://github.com/Experience-Monks/audiobuffer-to-wav/blob/master/LICENSE.md>
[MIT license] Modified version of Audiobuffer-to-aiff : <https://github.com/hunjunior/audiobuffer-to-aiff/blob/master/LICENSE>

Brian referenced the following during development:
[BSD-3] MIDI-SDS, for how the Machine Drum stores audio data in syx files : <https://github.com/eh2k/uwedit/blob/master/core/MidiSDS.cpp> / <https://github.com/eh2k/uwedit/blob/master/LICENSE.txt>
[Unlicense] OctaChainer, how to read/write .ot binary files correctly : <https://github.com/KaiDrange/OctaChainer/blob/master/otwriter.cpp> / <https://github.com/KaiDrange/OctaChainer/blob/master/License.txt>
Tips and Tricks on drawing array buffers to the canvas element: <https://css-tricks.com/making-an-audio-waveform-visualizer-with-vanilla-javascript/>
[MIT License] Basic beat detection : https://github.com/JMPerez/beats-audio-api/blob/gh-pages/script.js / http://joesul.li/van/beat-detection-using-web-audio/
*/
import {settings} from './settings.js';

export const opToXyValues = {
    pan: () => 0,
    playmode: value => {
        switch (value) {
            case 4096:
                return 'gate';
            case 20480:
                return 'group';
            case 28672:
                return 'loop';
            case 12288:
            default:
                return 'oneshot';
        }
    },
    reverse: value => value === 24576,
    volume: () => 0,
    pitch: value => (value || value !== 0 ? Math.round((value / 512) / 12) : 0) || 0,
};

/* check the last 256 samples per slice to nudge to a zero crossing*/
const nudgeEndToZero = (start, end, buffer, seekRegion = 256) => {
    if (!buffer) {
        return end;
    }
    const isStereo = buffer.numberOfChannels > 1;
    let firstZeroCrossingLeft, lastZeroCrossingLeft;
    for (let i = (end ?? buffer.length); buffer.length > i; i--) {
        if (i < start || i < (end - seekRegion)) {
            return end;
        }
        if (+buffer.getChannelData(0)[i].toFixed(4) === 0 || i === 0) {
            if (isStereo === false){
                return i;
            }
            firstZeroCrossingLeft = firstZeroCrossingLeft || i;
            lastZeroCrossingLeft = i;

        }
        if (isStereo && +buffer.getChannelData(1)[i].toFixed(4) === 0 || i === 0) {
            if (lastZeroCrossingLeft === i) {
                return i;
            }
        }
    }
    return firstZeroCrossingLeft || end;
};

export function buildOpData(slices = [], numChannels, audioBuffer = false, returnTemplate = false) {
    const template = slices?.length ? {
        attack: new Array(24).fill(0),
        drum_version: 2,
        dyna_env: [0, 8192, 0, 8192, 0, 0, 0, 0],
        end: new Array(24).fill(0),
        fx_active: false,
        fx_params: [8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000],
        fx_type: 'delay',
        lfo_active: false,
        lfo_params: [16000, 16000, 16000, 16000, 0, 0, 0, 0],
        lfo_type: 'tremolo',
        mtime: 1682173750,
        name: 'DigiChain Kit',
        octave: 0,
        original_folder: 'DigiChain',
        pan: new Array(24).fill(16384),
        pan_ab: new Array(24).fill(false),
        pitch: new Array(24).fill(0),
        playmode: new Array(24).fill(12288), /*4096 = ->, 12288 = ->|, 20480 = ->G, 28672 = loop */
        reverse: new Array(24).fill(8192), /*8192 = ->, 24576 = <- */
        start: new Array(24).fill(0),
        stereo: numChannels === 2,
        type: 'drum',
        volume: new Array(24).fill(8192)
    } : {
        adsr: [64, 10746, 32767, 10000, 4000, 64, 4000, 18021],
        base_freq: 440,
        fade: 0,
        fx_active: false,
        fx_params: [8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000],
        fx_type: 'delay',
        knobs: [0, 0, 0, 8600, 12000, 0, 0, 8192],
        lfo_active: false,
        lfo_params: [16000, 0, 0, 16000, 0, 0, 0, 0],
        lfo_type: 'tremolo',
        mtime: 1683144375,
        name: 'DigiChain Sample',
        octave: 0,
        original_folder: 'DigiChain',
        stereo: numChannels === 2,
        synth_version: 3,
        type: 'sampler'
    };
    if (returnTemplate) { return template; }
    const opData = JSON.parse(JSON.stringify(template));
    if (!slices?.length || slices?.length === 0) {
        return opData; /*Return single synth sampler template*/
    }

    const scale = 2147483646 / (44100 * (numChannels === 2 ? 20 : 12));
    const s = slices.map(slice => ({
        p: slice.p??16384,
        pab: slice.pab || false,
        st: (slice.st > 24576 ? 24576 : (slice.st < -24576 ? -24576 : slice.st)) || 0,
        pm: slice.pm??12288,
        r: slice.r??8192,
        s: Math.floor(slice.s * scale),
        e: Math.floor(nudgeEndToZero(slice.s, slice.e, audioBuffer) * scale)
    }));

    for (let idx = 0; idx < 24; idx++) {
        let slice = s.shift();
        opData.pan[idx] = slice.p;
        opData.pan_ab[idx] = slice.pab;
        opData.pitch[idx] = slice.st;
        opData.playmode[idx] = slice.pm;
        opData.reverse[idx] = slice.r;
        opData.start[idx] = slice.s;
        opData.end[idx] = slice.e;
        s.push(slice);
    }
    return opData;
}

export function buildXyRegionFromSlice(slice, index) {
    return {
        'fade.in': 0,
        'fade.out': 0,
        'framecount': slice.fc || (slice.e - slice.s),
        'gain': 0,
        'hikey': 53 + index,
        'lokey': 53 + index,
        'pan': opToXyValues.pan(slice.p),
        'pitch.keycenter': 60,
        'playmode': opToXyValues.playmode(slice.pm),
        'reverse': opToXyValues.reverse(slice.r),
        'sample': `${slice.name || 'slice_' + (index + 1)}.wav`,
        'sample.end': slice.e,
        'sample.start': slice.s || 0,
        'transpose': opToXyValues.pitch(slice.st),
        'tune': 0
    };
}

export function buildXyDrumPatchData(file, slices = []) {
    const _slices = slices.map(slice => ({
        ...slice,
        fc: slice.fc || (slice.e - slice .s),
        e: nudgeEndToZero(slice.s, slice.e, slice.buffer || file.buffer),
        name: (file.buffer ? file.kitName : slice.name)??''
    }));
    const modulationDefault = () => ({'amount': 16384, 'target': 0});
    const template = {
        'engine': {
            'bendrange': 8191,
            'highpass': 0,
            'modulation': {
                'aftertouch': modulationDefault(),
                'modwheel': modulationDefault(),
                'pitchbend': modulationDefault(),
                'velocity': modulationDefault()
            },
            'params': Array.from({length: 8}).fill(16384),
            'playmode': 'poly',
            'portamento.amount': 0,
            'portamento.type': 32767,
            'transpose': 0,
            'tuning.root': 0,
            'tuning.scale': 0,
            'velocity.sensitivity': 19660,
            'volume': 28505,
            'width': 0
        },
        'envelope': {
            'amp': {
                'attack': 0,
                'decay': 0,
                'release': 32767,
                'sustain': 32604
            },
            'filter': {
                'attack': 0,
                'decay': 0,
                'release': 32767,
                'sustain': 32767
            }
        },
        'fx': {
            'active': false,
            'params': [22014, 0, 4423, 0, 0, 32767, 0, 0],
            'type': 'z lowpass'
        },
        'lfo': {
            'active': false,
            'params': [14848, 16384, 19000, 16384, 0, 0, 0, 0],
            'type': 'tremolo'
        },
        'octave': 0,
        'platform': 'OP-XY',
        'regions': _slices.map(buildXyRegionFromSlice),
        "type": "drum",
        "version": 4
    };
    return template;
}

function buildXyMultiSamplerRegionFromSlice(slice, index) {
    return {
        'framecount': slice.fc,
        'hikey': slice.hk, /* 0 - 92*/
        'lokey': 0,
        'loop.crossfade': 0,
        'loop.end': slice.fc,
        'loop.onrelease': false,
        'loop.start': 0,
        'pitch.keycenter': slice.pkc || slice.hk,
        'reverse': false,
        'sample': `${slice.name || 'slice_' + (index + 1)}.wav`,
        'sample.end': slice.e,
        'sample.start': slice.s || 0,
        'tune': 0
    };
}

export function buildXyMultiSamplePatchData(file, slices = []) {
    return {
        'engine': {
            'bendrange': 13653,
            'highpass': 1638,
            'modulation': {
                'aftertouch': { 'amount': 16383, 'target': 0 },
                'modwheel': { 'amount': 16383, 'target': 0 },
                'pitchbend': { 'amount': 16383, 'target': 0 },
                'velocity': { 'amount': 32767, 'target': 17694 }
            },
            'params': [16384, 16384, 16384, 16384, 16384, 16384, 16384, 16384],
            'playmode': 'poly',
            'portamento.amount': 128,
            'portamento.type': 32767,
            'transpose': 0,
            'tuning.root': 0,
            'tuning.scale': 0,
            'velocity.sensitivity': 26540,
            'volume': 21295,
            'width': 0
        },
        'envelope': {
            'amp': { 'attack': 0, 'decay': 32767, 'release': 3276, 'sustain': 32767 },
            'filter': { 'attack': 0, 'decay': 0, 'release': 3276, 'sustain': 32767 }
        },
        'fx': {
            'active': false,
            'params': [12697, 3440, 163, 0, 0, 32767, 0, 0],
            'type': 'svf'
        },
        'lfo': {
            'active': false,
            'params': [23095, 16384, 15889, 16000, 0, 0, 0, 0],
            'type': 'tremolo'
        },
        'octave': 0,
        'platform': 'OP-XY',
        'regions': slices.sort((a, b) => a.hk - b.hk).map(buildXyMultiSamplerRegionFromSlice),
        'type': 'multisampler',
        'version': 4
    };

}

export function showToastMessage(messageString, duration = 3000) {
    const attachToEl = [...document.querySelectorAll('dialog')].find(d => d.open) || document.body;
    const toast = document.createElement('div');
    const existingToast = attachToEl.querySelectorAll('.toast');
    if (existingToast.length > 0) {
        existingToast.forEach(et => et.classList.add('fadeOutUp'));
    }
    toast.classList.add('toast');
    toast.classList.add('fadeInDown');
    toast.innerHTML = messageString;
    attachToEl.appendChild(toast);
    setTimeout(() => {
        setTimeout(() => toast.remove(), 500);
        toast.classList.add('fadeOutUp');
    }, duration);
}

export async function dcDialog(type = 'message', messageString = '', config = {}) {
    const msgTypes = {message: 'alert', ask: 'prompt', confirm: 'confirm', prompt: 'prompt'};
    
    if (type === 'prompt' || type === 'confirm' || type === 'alert') {
        return await new Promise(resolve => {
            const dcDialogEl = document.querySelector('#dcDialog');

            dcDialogEl.innerHTML = `
                <div class="content">
                    <div class="prompt">${messageString}</div>
                    <input
                        style="display: ${type === 'prompt' ? 'block' : 'none'};"
                        type="${config.inputType??'text'}"
                        class="prompt-input"
                        value="${config.defaultValue??''}"
                    >
                    <div class="buttons-group">
                        <button type="submit" class="prompt-ok">${config.okLabel??'OK'}</button>` +
              (config.centerLabel ? `<button class="prompt-center button-outline" style="margin-left: 2rem;">${config.centerLabel}</button>` : '') +
                        `<button class="prompt-cancel button-outline ${type === 'alert' ? 'hidden' : ''}">${config.cancelLabel??'Cancel'}</button>
                    </div>
                </div>
            `;

            const promptInputEl = document.querySelector('#dcDialog .content .prompt-input');
            const promptCancelEl = document.querySelector('#dcDialog .content .prompt-cancel');
            const promptCenterEl = document.querySelector('#dcDialog .content .prompt-center');
            const promptOkEl = document.querySelector('#dcDialog .content .prompt-ok');

            promptCancelEl.onclick = () => {
                resolve(config.defaultValue??false);
                dcDialogEl.close();
            };
            promptOkEl.onclick = () => {
                resolve(type === 'prompt' ? (promptInputEl.value||'') : true);
                dcDialogEl.close();
            };

            if (promptCenterEl) {
                promptCenterEl.onclick = () => {
                    resolve(type === 'prompt' ? (promptInputEl.value||'') : 'center');
                    dcDialogEl.close();
                };
            }

            dcDialogEl.onkeydown = dcDialogEvent => {
                if (dcDialogEvent.code === 'Escape') {
                    return promptCancelEl.click();
                }
                if (dcDialogEvent.code === 'Enter') {
                    setTimeout(() => promptOkEl.click(), 100);
                }
            };

            if (!dcDialogEl.open) {
                dcDialogEl.showModal();
                setTimeout(() => type !== 'prompt' ? dcDialogEl.focus() : (() => {
                    promptInputEl.select();
                    promptInputEl.focus();
                })(), 50);
            }
        });
    }

    if (window.__TAURI__) {
        return await window.__TAURI__.dialog[type](messageString, config);
    }
    return await window[msgTypes[type]](messageString);
}

export function flattenFile(f, cloneProperties) {
    return {
        file: cloneProperties ? structuredClone(f.file) : f.file,
        meta: cloneProperties ? structuredClone(f.meta) : f.meta,
        buffer: {
            duration: f.buffer.duration,
            length: f.buffer.length,
            numberOfChannels: f.buffer.numberOfChannels,
            sampleRate: f.buffer.sampleRate,
            channel0: new Float32Array(f.buffer.getChannelData(0)),
            channel1: f.buffer.numberOfChannels > 1 ? new Float32Array(f.buffer.getChannelData(1)) : false
        }
    };
}

export function bufferToFloat32Array(
  buffer, channel, getAudioBuffer = false, audioCtx, masterChannels, masterSR) {
    let result = getAudioBuffer ?
      audioCtx.createBuffer(
        masterChannels,
        buffer.length,
        masterSR
      ) : new Float32Array(buffer.length);

    if (channel === 'S' && buffer.numberOfChannels > 1) {
        for (let i = 0; i < buffer.length; i++) {
            (getAudioBuffer
              ? result.getChannelData(0)
              : result)[i] = (buffer.getChannelData(0)[i] +
              buffer.getChannelData(1)[i]) / 2;
        }
    } else if (channel === 'D' && buffer.numberOfChannels > 1) {
        for (let i = 0; i < buffer.length; i++) {
            (getAudioBuffer
              ? result.getChannelData(0)
              : result)[i] = (buffer.getChannelData(0)[i] -
              buffer.getChannelData(1)[i]) / 2;
        }
    } else {
        const _channel = channel === 'R' && buffer.numberOfChannels > 1 ? 1 : 0;
        for (let i = 0; i < buffer.length; i++) {
            (getAudioBuffer
              ? result.getChannelData(0)
              : result)[i] = buffer.getChannelData(_channel)[i];
        }
    }
    return result;
}

export function joinToMono(audioArrayBuffer, _files, largest, pad, reverseEvenSamplesInChains) {
    let totalWrite = 0;
    _files.forEach((file, idx) => {
        const bufferLength = pad ? largest : file.buffer.length;

        let result = bufferToFloat32Array(file.buffer,
          file?.meta?.channel);

        if (reverseEvenSamplesInChains && (idx + 1) % 2 === 0) {
            for (let i = 0; i < bufferLength; i++) {
                audioArrayBuffer.getChannelData(0)[totalWrite] = result[bufferLength - i] || 0;
                totalWrite++;
            }
        } else {
            for (let i = 0; i < bufferLength; i++) {
                audioArrayBuffer.getChannelData(0)[totalWrite] = result[i] || 0;
                totalWrite++;
            }
        }
    });
}

export function joinToStereo(audioArrayBuffer, _files, largest, pad, reverseEvenSamplesInChains) {
    let totalWrite = 0;
    _files.forEach((file, idx) => {
        const bufferLength = pad ? largest : file.buffer.length;
        let result = [
            new Float32Array(file.buffer.length),
            new Float32Array(file.buffer.length)];

        for (let i = 0; i < file.buffer.length; i++) {
            result[0][i] = file.buffer.getChannelData(0)[i];
            result[1][i] = file.buffer.getChannelData(
              file.buffer.numberOfChannels === 2 ? 1 : 0)[i];
        }

        if (reverseEvenSamplesInChains && (idx + 1) % 2 === 0) {
            for (let i = 0; i < bufferLength; i++) {
                audioArrayBuffer.getChannelData(0)[totalWrite] = result[0][bufferLength - i] || 0;
                audioArrayBuffer.getChannelData(1)[totalWrite] = result[1][bufferLength - i] || 0;
                totalWrite++;
            }
        } else {
            for (let i = 0; i < bufferLength; i++) {
                audioArrayBuffer.getChannelData(0)[totalWrite] = result[0][i] || 0;
                audioArrayBuffer.getChannelData(1)[totalWrite] = result[1][i] || 0;
                totalWrite++;
            }
        }
    });
}

export function encodeOt(slices, bufferLength, tempo = 120, optional = {}) {
    const dv = new DataView(new ArrayBuffer(0x340));
    const header = [
          0x46,
          0x4F,
          0x52,
          0x4D,
          0x00,
          0x00,
          0x00,
          0x00,
          0x44,
          0x50,
          0x53,
          0x31,
          0x53,
          0x4D,
          0x50,
          0x41,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x02,
          0x00
    ];
    const bpm = tempo * 6 * 4;
    const samplesLength = bufferLength;

    const bars = +((samplesLength / 44100) / ((60 / tempo) * 4)).toFixed(2);
    const loopBars = +(((samplesLength - (optional.loopStart??0)) / 44100) / ((60 / tempo) * 4)).toFixed(2);

    header.forEach((x, i) => dv.setUint8(i, x));
    dv.setUint32(0x17, bpm);
    dv.setUint32(0x1B, bars * 100); // trim length
    dv.setUint32(0x1F, loopBars * 100); // loop length
    dv.setUint32(0x23, optional.stretch??0); // time stretch off/on/beat 0/2/3
    dv.setUint32(0x27, optional.loop??0); // loop off/on/ping-pong 0/1/2
    dv.setUint16(0x2B, 0x30); // gain
    dv.setUint8(0x2D, 0xFF); // quantize
    dv.setUint32(0x2E, 0); // trim start
    dv.setUint32(0x32, samplesLength); // trim end
    dv.setUint32(0x36, optional.loopStart??0); // loop start

    let offset = 0x3A;
    for (let i = 0; i < 64; i++) {
        dv.setUint32(offset, slices[i]?.s ?? 0);
        dv.setUint32(offset + 4, slices[i]?.e ?? 0);
        dv.setUint32(offset + 8, slices[i]?.l ?? -1);
        offset += 12;
    }

    dv.setUint32(0x33A, slices.length); // slice count
    let checksum = 0;
    for (let i = 0x10; i < dv.byteLength; i++) {
        checksum += dv.getUint8(i);
    }

    dv.setUint16(0x33E, checksum);

    return dv;
}

export function deClick(audioArray, threshold) {
    const bufferLength = audioArray.length;
    if (!threshold || threshold === 0) {
        return audioArray;
    }
    const _threshold = +threshold;
    for (let i = 1; i < bufferLength - 1; i++) {
        const average = (audioArray[i - 1] + audioArray[i + 1]) / 2;
        if (Math.abs(audioArray[i] - average) > _threshold) {
            audioArray[i] = average;
        }
    }
    return audioArray;
}

export function getResampleIfNeeded(meta, buffer, sampleRate) {
    const targetSR = meta.renderAt || sampleRate;
    const targetAudioCtx = new AudioContext(
      {sampleRate: targetSR, latencyHint: 'interactive'});
    return digichain.bufferRateResampler({
        file: {sampleRate: targetSR},
        meta,
        buffer
    }, targetSR, targetAudioCtx);
}

export function audioBufferToWav(
  buffer, meta, sampleRate, bitDepth, masterNumChannels,
  deClickThreshold = false, renderAsAif = false, pitchModifier = 1,
  embedSliceData = false, embedCuePoints = true, embedOrslData = false) {
    const treatDualMonoStereoAsMono = settings.treatDualMonoStereoAsMono &&
      !meta.editing && !meta.bypassStereoAsDualMono;

    let resample;
    if (!meta.editing && meta.renderAt) {
        resample = getResampleIfNeeded(meta, buffer, sampleRate);
        sampleRate = resample.buffer.sampleRate;
        meta = resample.meta;
        buffer = resample.buffer;
    }

    let numChannels = buffer.numberOfChannels;
    let format = (meta?.float32 || bitDepth === 32) ? 3 : 1;
    sampleRate = sampleRate * pitchModifier;

    let result;
    if (meta.channel && masterNumChannels === 1) {
        numChannels = 1;
        if (meta.channel === 'L') { result = buffer.getChannelData(0); }
        if (meta.channel === 'R') { result = buffer.getChannelData(1); }
        if (meta.channel === 'S') {
            result = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                result[i] = (buffer.getChannelData(0)[i] +
                  buffer.getChannelData(1)[i]) / 2;
            }
        }
        if (meta.channel === 'D') {
            result = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                result[i] = (buffer.getChannelData(0)[i] -
                  buffer.getChannelData(1)[i]) / 2;
            }
        }
        result = deClick(result, deClickThreshold);
    } else {
        if (numChannels === 2 &&
          !(meta.dualMono && treatDualMonoStereoAsMono)) {
            //result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
            result = interleave(
              deClick(buffer.getChannelData(0), deClickThreshold),
              deClick(buffer.getChannelData(1), deClickThreshold));
        } else {
            numChannels = 1;
            result = deClick(buffer.getChannelData(0), deClickThreshold);
        }
    }

    return renderAsAif ?
      encodeAif(
        result, sampleRate, numChannels,
        buildOpData(meta?.slices, numChannels, buffer)
      ) :
      encodeWAV(
        result, format, sampleRate, numChannels, bitDepth, buffer.length,
        meta?.slices, pitchModifier, embedSliceData, embedCuePoints, embedOrslData
      );
}

DataView.prototype.setInt24 = function(pos, val, littleEndian) {
    this.setInt8(pos, val & ~4294967040, littleEndian);
    this.setInt16(pos + 1, val >> 8, littleEndian);
};

export function encodeWAV(
  samples, format, sampleRate, numChannels, bitDepth, inputBufferLength, slices, pitchModifier = 1,
  embedSliceData = false, embedCuePoints = true, embedOrslData = false) {

    const hasSlices = slices &&
      Array.isArray(slices) &&
      slices.length !== 0 &&
      (
        slices.length > 1 ||
        (slices.length === 1 && (slices[0].s !== 0 || slices[0].e < inputBufferLength))
      );

    let bytesPerSample = bitDepth / 8;
    let blockAlign = numChannels * bytesPerSample;
    let sliceData = [];
    let buffer;
    let riffSize = 36 + samples.length * bytesPerSample;
    let bufferLength = 44 + samples.length * bytesPerSample;
    let sliceCueLength = 0;
    let sliceOrslLength = 0;

    let _slices = hasSlices ? (pitchModifier === 1 ? slices : slices.map(
      slice => ({
          n: slice.n, s: Math.round(slice.s / pitchModifier),
          e: Math.round(slice.e / pitchModifier),
          l: (!slice.l || slice.l === -1) ? -1 : Math.round(
            slice.l / pitchModifier)
      }))) : [];

    if (hasSlices) {
        if (embedSliceData) {
            sliceData = `{"sr": ${sampleRate}, "dcs":` +
              JSON.stringify(_slices) + '}';
            sliceData = btoa(sliceData);
            sliceData = sliceData.padEnd(
              sliceData.length + sliceData.length % 4, ' ');
            bufferLength += (sliceData.length + 12);
            riffSize += (sliceData.length + 12);
        }
        if (embedCuePoints) {
            sliceCueLength = (12 + (24 * slices.length));
            bufferLength += sliceCueLength;
            riffSize += sliceCueLength;
        }
        /*if (embedOrslData && (sampleRate === 12000 || sampleRate === 24000)) {
            sliceOrslLength = (12 + (32 * slices.length));
            bufferLength += sliceOrslLength;
            riffSize += sliceOrslLength;
        }*/
    }

    buffer = new ArrayBuffer(bufferLength);
    let view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, riffSize, true);
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
    } else if (bitDepth === 8) {
        floatTo8BitPCM(view, 44, samples);
    } else {
        writeFloat32(view, 44, samples);
    }
    if (hasSlices) {
        if (embedSliceData) {
            /*Store DCSD as LIST chunk header to keep wav format valid*/
            writeString(view,
              view.byteLength - (sliceData.length + 12) - sliceCueLength,
              'LIST');
            /*LIST DCSD custom chunk size*/
            view.setUint32(
              view.byteLength - (sliceData.length + 8) - sliceCueLength,
              sliceData.length + 4,
              true);
            /*Using ISBJ as the LIST type ID : Description of the contents of the file (subject)*/
            writeString(view,
              view.byteLength - (sliceData.length + 4) - sliceCueLength,
              'ISBJ');
            /*DCSD custom chunk data*/
            writeString(view,
              view.byteLength - sliceData.length - sliceCueLength,
              sliceData);
        }
        if (embedCuePoints) {
            writeString(view, view.byteLength - sliceCueLength, 'cue ');
            view.setUint32(view.byteLength - sliceCueLength + 4,
              sliceCueLength - 8,
              true);
            view.setUint32(view.byteLength - sliceCueLength + 8, slices.length,
              true);

            for (let sIdx = 0; sIdx < slices.length; sIdx++) {
                const increment = 12 + (sIdx * 24);
                /*Cue id*/
                view.setUint32(view.byteLength - sliceCueLength + increment,
                  sIdx,
                  true);
                /*Cue position*/
                view.setUint32(view.byteLength - sliceCueLength + increment + 4,
                  0,
                  true);
                /*Cue data chunk sig*/
                writeString(view,
                  view.byteLength - sliceCueLength + increment + 8,
                  'data');
                /*Cue chunk start zero value*/
                view.setUint32(
                  view.byteLength - sliceCueLength + increment + 12, 0,
                  true);
                /*Cue block start zero value*/
                view.setUint32(
                  view.byteLength - sliceCueLength + increment + 16, 0,
                  true);
                /*Cue point sample start position*/
                view.setUint32(
                  view.byteLength - sliceCueLength + increment + 20,
                  _slices[sIdx].s, true);
            }
        }
        /*if (embedOrslData && (sampleRate === 12000 || sampleRate === 24000)) {
            writeString(view, view.byteLength - sliceOrslLength, 'ORSL');
            // Chunk size
            view.setUint32(view.byteLength - sliceOrslLength + 4, (slices.length * 32) + 4, true);
            // Slice count
            view.setUint32(view.byteLength - sliceOrslLength + 8, slices.length, true);

            for (let sIdx = 0; sIdx < slices.length; sIdx++) {
                const increment = 12 + (sIdx * 32);
                // Slice number
                view.setUint32(view.byteLength - sliceOrslLength + increment,
                  sIdx,
                  true);
                // Start point
                view.setUint32(view.byteLength - sliceOrslLength + increment + 4,
                  _slices[sIdx].s,
                  true);
                // End point
                view.setUint32(view.byteLength - sliceOrslLength + increment + 8,
                  _slices[sIdx].e,
                  true);
                // Level default of 100
                view.setUint32(view.byteLength - sliceOrslLength + increment + 12,
                  100,
                  true);
            }
        }*/
    }

    return {
        buffer,
        sampleRate,
        slices: slices && _slices ? slices.map((s, sIdx) => ({
            ...s,
            ...(_slices[sIdx] || {})
        })) : []
    };
}

export function getAifSampleRate(input) {
    const sampleRateTable = {
        8000: [64, 11, 250, 0, 0, 0, 0, 0, 0, 0],
        11025: [64, 12, 172, 68, 0, 0, 0, 0, 0, 0],
        16000: [64, 12, 250, 0, 0, 0, 0, 0, 0, 0],
        22050: [64, 13, 172, 68, 0, 0, 0, 0, 0, 0],
        32000: [64, 13, 250, 0, 0, 0, 0, 0, 0, 0],
        37800: [64, 14, 147, 168, 0, 0, 0, 0, 0, 0],
        44056: [64, 14, 172, 24, 0, 0, 0, 0, 0, 0],
        44100: [64, 14, 172, 68, 0, 0, 0, 0, 0, 0],
        47250: [64, 14, 184, 146, 0, 0, 0, 0, 0, 0],
        48000: [64, 14, 187, 128, 0, 0, 0, 0, 0, 0],
        50000: [64, 14, 195, 80, 0, 0, 0, 0, 0, 0],
        50400: [64, 14, 196, 224, 0, 0, 0, 0, 0, 0],
        88200: [64, 15, 172, 68, 0, 0, 0, 0, 0, 0],
        96000: [64, 15, 187, 128, 0, 0, 0, 0, 0, 0],
        176400: [64, 16, 172, 68, 0, 0, 0, 0, 0, 0],
        192000: [64, 16, 187, 128, 0, 0, 0, 0, 0, 0],
        352800: [64, 17, 172, 68, 0, 0, 0, 0, 0, 0],
        2822400: [64, 20, 172, 68, 0, 0, 0, 0, 0, 0],
        5644800: [64, 21, 172, 68, 0, 0, 0, 0, 0, 0]
    };
    if (typeof input === 'number') {
        return sampleRateTable[input] ?? false;
    }
    if (Array.isArray(input) && input.length === 10) {
        for (let sr in sampleRateTable) {
            if (sampleRateTable[sr].every((v, i) => v === input[i])) {
                return +sr;
            }
        }
    }
}

function addSampleRateToAiffData(view, offset, sr = 44100) {
    const sampleRate = getAifSampleRate(sr);
    for (let i = 0; i < 10; i++) {
        view.setUint8(offset + i, sampleRate[i]);
    }
}

export function encodeAif(audioData, sampleRate, numberOfChannels, opJsonData) {
    let jsonData = JSON.parse(JSON.stringify(opJsonData));
    jsonData.stereo = numberOfChannels === 2;

    function audioBufferToAiff(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;

        let result;
        if (numChannels === 2) {
            result = interleave(buffer.getChannelData(0),
              buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }

        return encodeAIFF(result, sampleRate, numChannels);
    }

    function encodeAIFF(samples, sampleRate, numChannels) {
        let numBytesPerSample = 2;
        let totalNumAudioSampleBytes = samples.length * numBytesPerSample;
        let soundDataChunkSize = totalNumAudioSampleBytes + 8;
        let fileSizeInBytes = 0x1042 + totalNumAudioSampleBytes - 8;

        let buffer = new ArrayBuffer(
          0x1042 + samples.length * numBytesPerSample);
        let view = new DataView(buffer);

        // HEADER
        writeString(view, 0, 'FORM');

        view.setInt32(4, fileSizeInBytes);

        writeString(view, 8, 'AIFF');

        // COMM
        writeString(view, 12, 'COMM');
        view.setInt32(16, 18);
        view.setInt16(20, numChannels);
        view.setInt32(22, samples.length / numChannels); // num samples per channel
        view.setInt16(26, 16); // bit depth
        addSampleRateToAiffData(view, 28, sampleRate);

        // APPL
        writeString(view, 38, 'APPL');
        view.setInt32(42, 0x1004);
        writeString(view, 46, 'op-1');
        writeApplData(view, jsonData, 50);

        let offset = 0x1032;

        // SSND
        writeString(view, offset, 'SSND');
        view.setInt32(offset + 4, soundDataChunkSize);
        view.setInt32(offset + 8, 0); // offset
        view.setInt32(offset + 12, 0); // block size

        offset = offset + 16; //0x1042

        const noise = () =>  settings.ditherExports ? (Math.random() - Math.random()) / 65536 : 0;
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i] + noise()));
            view.setInt16(offset, Math.round(sample * 32767));
            offset += 2;
        }

        return {buffer, sampleRate};
    }

    function writeApplData(dataView, data, offset) {
        const encDataRaw = JSON.stringify(data) + '\n';
        const encData = encDataRaw.length % 2 === 0 ? encDataRaw : (encDataRaw +
          '\n');
        let pad = 0x1004 - encData.length - 4;
        writeString(dataView, offset, encData);
        offset += encData.length;
        if (pad > 0) {
            new Array(pad).fill(0x20).forEach(p => {
                dataView.setUint8(offset, p);
                offset++;
            });
        }
    }

    return audioData.numberOfChannels ?
      new DataView(audioBufferToAiff(audioData).buffer) :
      encodeAIFF(audioData, sampleRate, numberOfChannels);
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
    for (let i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}

function floatTo8BitPCM(output, offset, input) {
    const noise = () => settings.ditherExports ? (Math.random() - Math.random()) / 255 : 0;
    for (let i = 0; i < input.length; i++, offset++) {
        //const s = Math.max(-1, Math.min(1, input[i]));
        const s = Math.floor(Math.max(-1, Math.min(1, input[i] + noise())) * 127 + 128);
        output.setInt8(offset, s);
    }
}

function floatTo16BitPCM(output, offset, input) {
    const noise = () =>  settings.ditherExports ? (Math.random() - Math.random()) / 65536 : 0;
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i] + noise()));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function floatTo24BitPCM(output, offset, input) {
    const noise = () => settings.ditherExports ? (Math.random() - Math.random()) / (1 << 24) : 0;
    for (let i = 0; i < input.length; i++, offset += 3) {
        const s = Math.floor((input[i] + noise()) * 8388608 + 0.5);
        output.setInt24(offset, s, true);
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
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
    if (typeof inputBuffer != 'object') {
        throw (new Error('inputBuffer is not an object.'));
    }
    if (!(inputBuffer instanceof Array) &&
      !(inputBuffer instanceof Float32Array) &&
      !(inputBuffer instanceof Float64Array)) {
        throw (new Error(
          'inputBuffer is not an array or a float32 or a float64 array.'));
    }
    this.inputBuffer = inputBuffer;
    //Initialize the resampler:
    this.initialize();
}

Resampler.prototype.initialize = function() {
    //Perform some checks:
    if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
        if (this.fromSampleRate == this.toSampleRate) {
            //Setup a resampler bypass:
            this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
            this.ratioWeight = 1;
            this.outputBuffer = this.inputBuffer;
        } else {
            this.ratioWeight = this.fromSampleRate / this.toSampleRate;
            if (this.fromSampleRate < this.toSampleRate) {
                /*
                  Use generic linear interpolation if upsampling,
                  as linear interpolation produces a gradient that we want
                  and works fine with two input sample points per output in this case.
                */
                this.compileLinearInterpolationFunction();
                this.lastWeight = 1;
            } else {
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
    } else {
        throw (new Error('Invalid settings specified for the resampler.'));
    }
};
Resampler.prototype.compileLinearInterpolationFunction = function() {
    var toCompile = 'var outputOffset = 0;\
    if (bufferLength > 0) {\
        var buffer = this.inputBuffer;\
        var weight = this.lastWeight;\
        var firstWeight = 0;\
        var secondWeight = 0;\
        var sourceOffset = 0;\
        var outputOffset = 0;\
        var outputBuffer = this.outputBuffer;\
        for (; weight < 1; weight += ' + this.ratioWeight + ') {\
            secondWeight = weight % 1;\
            firstWeight = 1 - secondWeight;';
    for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += 'outputBuffer[outputOffset++] = (this.lastOutput[' +
          channel + '] * firstWeight) + (buffer[' + channel +
          '] * secondWeight);';
    }
    toCompile += '}\
        weight -= 1;\
        for (bufferLength -= ' + this.channels +
      ', sourceOffset = Math.floor(weight) * ' + this.channels + '; sourceOffset < bufferLength;) {\
            secondWeight = weight % 1;\
            firstWeight = 1 - secondWeight;';
    for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += 'outputBuffer[outputOffset++] = (buffer[sourceOffset' +
          ((channel > 0) ? (' + ' + channel) : '') +
          '] * firstWeight) + (buffer[sourceOffset + ' +
          (this.channels + channel) + '] * secondWeight);';
    }
    toCompile += 'weight += ' + this.ratioWeight + ';\
            sourceOffset = Math.floor(weight) * ' + this.channels + ';\
        }';
    for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += 'this.lastOutput[' + channel +
          '] = buffer[sourceOffset++];';
    }
    toCompile += 'this.lastWeight = weight % 1;\
    }\
    return outputOffset;';
    this.resampler = Function('bufferLength', toCompile);
};
Resampler.prototype.compileMultiTapFunction = function() {
    var toCompile = 'var outputOffset = 0;\
    if (bufferLength > 0) {\
        var buffer = this.inputBuffer;\
        var weight = 0;';
    for (var channel = 0; channel < this.channels; ++channel) {
        toCompile += 'var output' + channel + ' = 0;';
    }
    toCompile += 'var actualPosition = 0;\
        var amountToNext = 0;\
        var alreadyProcessedTail = !this.tailExists;\
        this.tailExists = false;\
        var outputBuffer = this.outputBuffer;\
        var currentPosition = 0;\
        do {\
            if (alreadyProcessedTail) {\
                weight = ' + this.ratioWeight + ';';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'output' + channel + ' = 0;';
    }
    toCompile += '}\
            else {\
                weight = this.lastWeight;';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'output' + channel + ' = this.lastOutput[' + channel + '];';
    }
    toCompile += 'alreadyProcessedTail = true;\
            }\
            while (weight > 0 && actualPosition < bufferLength) {\
                amountToNext = 1 + actualPosition - currentPosition;\
                if (weight >= amountToNext) {';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'output' + channel +
          ' += buffer[actualPosition++] * amountToNext;';
    }
    toCompile += 'currentPosition = actualPosition;\
                    weight -= amountToNext;\
                }\
                else {';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'output' + channel + ' += buffer[actualPosition' +
          ((channel > 0) ? (' + ' + channel) : '') + '] * weight;';
    }
    toCompile += 'currentPosition += weight;\
                    weight = 0;\
                    break;\
                }\
            }\
            if (weight <= 0) {';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'outputBuffer[outputOffset++] = output' + channel + ' / ' +
          this.ratioWeight + ';';
    }
    toCompile += '}\
            else {\
                this.lastWeight = weight;';
    for (channel = 0; channel < this.channels; ++channel) {
        toCompile += 'this.lastOutput[' + channel + '] = output' + channel + ';';
    }
    toCompile += 'this.tailExists = true;\
                break;\
            }\
        } while (actualPosition < bufferLength);\
    }\
    return outputOffset;';
    this.resampler = Function('bufferLength', toCompile);
};
Resampler.prototype.bypassResampler = function(upTo) {
    return upTo;
};
Resampler.prototype.initializeBuffers = function() {
    //Initialize the internal buffer:
    var outputBufferSize = (Math.ceil(
      this.inputBuffer.length * this.toSampleRate / this.fromSampleRate /
      this.channels * 1.000000476837158203125) * this.channels) + this.channels;
    try {
        this.outputBuffer = new Float32Array(outputBufferSize);
        this.lastOutput = new Float32Array(this.channels);
    } catch (error) {
        this.outputBuffer = [];
        this.lastOutput = [];
    }
};

export function detectTempo(audioBuffer, fileName = '') {
    return new Promise((resolve, reject) => {
        function getPeaks(data) {
            let partSize = 22050,
                parts = data[0].length / partSize,
                peaks = [];

            for (let i = 0; i < parts; i++) {
                let max = 0;
                for (let j = i * partSize; j < (i + 1) * partSize; j++) {
                    let volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
                    if (!max || (volume > max.volume)) {
                        max = {
                            position: j,
                            volume: volume
                        };
                    }
                }
                peaks.push(max);
            }

            peaks.sort((a, b) => b.volume - a.volume);
            peaks = peaks.splice(0, peaks.length * 0.5);
            peaks.sort((a, b) => a.position - b.position);

            return peaks;
        }

        function getIntervals(peaks) {
            const groups = [];
            peaks.forEach((peak, index) => {
                for (let i = 1; (index + i) < peaks.length && i < 10; i++) {
                    const group = {
                        tempo: (60 * 44100) / (peaks[index + i].position - peak.position),
                        count: 1
                    };
                    while (group.tempo < 90) {
                        group.tempo *= 2;
                    }
                    while (group.tempo > 180) {
                        group.tempo /= 2;
                    }
                    group.tempo = Math.round(group.tempo);

                    if (
                        !(groups.some(
                            interval => (interval.tempo === group.tempo ? interval.count++ : 0)
                        ))) {
                        groups.push(group);
                    }
                }
            });
            return groups;
        }

        const offlineContext = new window.OfflineAudioContext(2, 30 * 44100, 44100);

        function findTempo(buffer) {
            // Try to find from file name first
            const fileNameMatch = fileName.match(/(?:^|[\s-_])(\d+)(?![0-9])/g);
            if (fileNameMatch && fileNameMatch[0]) {
                const bpm = parseInt(fileNameMatch[0].replace(/[^0-9]/g, ''));
                if (bpm && bpm > 0) {
                    resolve({
                        match: bpm,
                        alternatives: []
                    });
                    return;
                }
            }
            // If not found, try to find from audio data
            const source = offlineContext.createBufferSource();
            source.buffer = buffer;
            const lowpass = offlineContext.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 150;
            lowpass.Q.value = 1;
            source.connect(lowpass);
            const highpass = offlineContext.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 100;
            highpass.Q.value = 1;
            lowpass.connect(highpass);
            highpass.connect(offlineContext.destination);
            source.start(0);
            offlineContext.startRendering();
        }

        offlineContext.oncomplete = function(e) {
            const buffer = e.renderedBuffer;
            const peaks = getPeaks([buffer.getChannelData(0), buffer.getChannelData(1)]);
            const top = getIntervals(peaks).sort(function(intA, intB) {
                return intB.count - intA.count;
            }).splice(0, 5);

            resolve({
                match: Math.round(top[1].tempo > top[0].tempo ? top[1].tempo : top[0].tempo),
                alternatives: top
            });
        };

        findTempo(audioBuffer);
    });

}

export function Paula() {
    const pChannel = () => ({
        en: false,
        lch: 0,
        lcl: 0,
        len: 0,
        per: 0,
        vol: 0,
        ciata: 0,
        offset: 0,
        ex: false,
        start: 0,
        length: 0
    });

    return (monoAudioArrayBuffer, sampleRate = 44100, callbacks = {}, ciaTimerInterval = 0, regionNTSC = false) => {
        const numChannels = 4;
        const fps = 50;

        const callback = {
            vBlank: () => {},
            audioInterrupt: () => {},
            ciaTimer: () => {},

            ...callbacks
        };

        let ciata = ciaTimerInterval;
        let clock = regionNTSC ? 3579545 : 3579545;
        let clockAdvance = clock / sampleRate;
        let ciaClockAdvance = clockAdvance / 5;

        let frameCount = 0;
        let ciaClock = 0;

        let frameAdvance = fps / sampleRate;

        let channel = [];

        let ram = new DataView(monoAudioArrayBuffer);

        for (let i = 0; i < numChannels; i++) {
            channel.push(pChannel());
        }

        const channelLatch = ch => {
            ch.start = ch.lch << 16 | ch.lcl;
            ch.length = ch.len * 2;
            ch.offset = 0;
            callback.audioInterrupt(ch);
        };

        // Get Next Sample Value;
        return (output = 0) => {
            if (Math.floor(frameCount + frameAdvance) > frameCount) {
                frameCount--;
                callback.vBlank();
            }

            frameCount = frameCount + frameAdvance;

            if (Math.floor(ciaClock + ciaClockAdvance) > ciaTimerInterval) {
                ciaClock = ciaClock - ciaTimerInterval;
                ciaTimerInterval = ciata;
                callback.ciaTimer();
            }

            ciaClock = ciaClock + ciaClockAdvance;

            channel.forEach(ch => {
                if (ch.en) {
                    if (ch.ex === false) {
                        channelLatch(ch);
                        ch.ex = true;
                    }

                    ch.offset = ch.offset + (clockAdvance / ch.per);

                    let offset = Math.floor(ch.offset);

                    if (offset >= ch.length) {
                        channelLatch(ch);
                        offset = 0;
                    }

                    let delta = ch.offset = offset;

                    let current = ram.getInt8(ch.start + offset);
                    let next = ((offset + 1) < ch.length) ?
                      ram.getInt8(ch.start + offset + 1) :
                      ram.getInt8(ch.start);
                    output = output + (ch.vol * (current + delta * (next - current)));
                } else {
                    ch.ex = false;
                }
            });
            return output / 32768;
        };
    };
}

export function setLoadingText(text = 'Loading', dismissTimeout) {
    const loadingEl = document.getElementById('loadingText');
    if (!text) {
        loadingEl.textContent = 'Loading';
        document.body.classList.remove('loading');
        return;
    }

    loadingEl.textContent = text;
    document.body.classList.add('loading');

    if (dismissTimeout) {
        setTimeout(() => document.body.classList.remove('loading'), parseInt(dismissTimeout));
    }
}

CanvasRenderingContext2D.prototype.clear =
  CanvasRenderingContext2D.prototype.clear || function(preserveTransform) {
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

/*scrollIntoViewIfNeeded shim*/
if (!Element.prototype.scrollIntoViewIfNeeded) {
    Element.prototype.scrollIntoViewIfNeeded = function(centerIfNeeded) {
        centerIfNeeded = arguments.length === 0 ? true : !!centerIfNeeded;

        const parent = this.parentElement;
        const parentComputedStyle = window.getComputedStyle(parent, null);
        const parentBorderTopWidth = parseInt(
          parentComputedStyle.getPropertyValue('border-top-width'));
        const parentBorderLeftWidth = parseInt(
          parentComputedStyle.getPropertyValue('border-left-width'));
        const overTop = this.offsetTop - parent.offsetTop < parent.scrollTop;
        const overBottom = (this.offsetTop - parent.offsetTop +
            this.clientHeight - parentBorderTopWidth) >
          (parent.scrollTop + parent.clientHeight);
        const overLeft = this.offsetLeft - parent.offsetLeft <
          parent.scrollLeft;
        const overRight = (this.offsetLeft - parent.offsetLeft +
            this.clientWidth - parentBorderLeftWidth) >
          (parent.scrollLeft + parent.clientWidth);
        const alignWithTop = overTop && !overBottom;

        if ((overTop || overBottom) && centerIfNeeded) {
            parent.scrollTop = this.offsetTop - parent.offsetTop -
              parent.clientHeight / 2 - parentBorderTopWidth +
              this.clientHeight / 2;
        }

        if ((overLeft || overRight) && centerIfNeeded) {
            parent.scrollLeft = this.offsetLeft - parent.offsetLeft -
              parent.clientWidth / 2 - parentBorderLeftWidth +
              this.clientWidth / 2;
        }

        if ((overTop || overBottom || overLeft || overRight) &&
          !centerIfNeeded) {
            this.scrollIntoView(alignWithTop);
        }
    };
}

// noinspection
export const ptiDefaultHeaderJson = '{"0":84,"1":73,"2":1,"3":0,"4":1,"5":5,"6":0,"7":1,"8":9,"9":9,"10":9,"11":9,"12":116,"13":1,"14":0,"15":0,"16":1,"17":0,"18":0,"19":0,"20":0,"21":98,"22":108,"23":97,"24":110,"25":107,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"44":0,"45":0,"46":0,"47":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"56":0,"57":0,"58":0,"59":0,"60":16,"61":0,"62":0,"63":0,"64":0,"65":8,"66":0,"67":0,"68":0,"69":0,"70":0,"71":0,"72":0,"73":0,"74":0,"75":0,"76":5,"77":0,"78":0,"79":0,"80":1,"81":0,"82":254,"83":255,"84":255,"85":255,"86":0,"87":0,"88":0,"89":0,"90":0,"91":0,"92":0,"93":0,"94":128,"95":63,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"103":0,"104":0,"105":0,"106":128,"107":63,"108":232,"109":3,"110":0,"111":1,"112":0,"113":0,"114":128,"115":63,"116":0,"117":0,"118":0,"119":0,"120":0,"121":0,"122":0,"123":0,"124":0,"125":0,"126":128,"127":63,"128":232,"129":3,"130":0,"131":0,"132":0,"133":0,"134":128,"135":63,"136":0,"137":0,"138":0,"139":0,"140":0,"141":0,"142":0,"143":0,"144":0,"145":0,"146":128,"147":63,"148":232,"149":3,"150":0,"151":0,"152":0,"153":0,"154":128,"155":63,"156":0,"157":0,"158":0,"159":0,"160":0,"161":0,"162":0,"163":0,"164":0,"165":0,"166":128,"167":63,"168":232,"169":3,"170":0,"171":0,"172":0,"173":0,"174":128,"175":63,"176":0,"177":0,"178":0,"179":0,"180":0,"181":0,"182":0,"183":0,"184":0,"185":0,"186":128,"187":63,"188":232,"189":3,"190":0,"191":0,"192":0,"193":0,"194":128,"195":63,"196":0,"197":0,"198":0,"199":0,"200":0,"201":0,"202":0,"203":0,"204":0,"205":0,"206":128,"207":63,"208":232,"209":3,"210":0,"211":0,"212":2,"213":0,"214":0,"215":0,"216":0,"217":0,"218":0,"219":63,"220":2,"221":0,"222":0,"223":0,"224":0,"225":0,"226":0,"227":63,"228":2,"229":0,"230":0,"231":0,"232":0,"233":0,"234":0,"235":63,"236":2,"237":0,"238":0,"239":0,"240":0,"241":0,"242":0,"243":63,"244":2,"245":0,"246":0,"247":0,"248":0,"249":0,"250":0,"251":63,"252":2,"253":0,"254":0,"255":0,"256":0,"257":0,"258":0,"259":63,"260":0,"261":0,"262":128,"263":63,"264":0,"265":0,"266":0,"267":0,"268":0,"269":0,"270":0,"271":0,"272":50,"273":0,"274":0,"275":0,"276":50,"277":0,"278":0,"279":0,"280":0,"281":0,"282":0,"283":0,"284":0,"285":0,"286":0,"287":0,"288":0,"289":0,"290":0,"291":0,"292":0,"293":0,"294":0,"295":0,"296":0,"297":0,"298":0,"299":0,"300":0,"301":0,"302":0,"303":0,"304":0,"305":0,"306":0,"307":0,"308":0,"309":0,"310":0,"311":0,"312":0,"313":0,"314":0,"315":0,"316":0,"317":0,"318":0,"319":0,"320":0,"321":0,"322":0,"323":0,"324":0,"325":0,"326":0,"327":0,"328":0,"329":0,"330":0,"331":0,"332":0,"333":0,"334":0,"335":0,"336":0,"337":0,"338":0,"339":0,"340":0,"341":0,"342":0,"343":0,"344":0,"345":0,"346":0,"347":0,"348":0,"349":0,"350":0,"351":0,"352":0,"353":0,"354":0,"355":0,"356":0,"357":0,"358":0,"359":0,"360":0,"361":0,"362":0,"363":0,"364":0,"365":0,"366":0,"367":0,"368":0,"369":0,"370":0,"371":0,"372":0,"373":0,"374":0,"375":0,"376":1,"377":0,"378":185,"379":1,"380":0,"381":0,"382":0,"383":0,"384":0,"385":0,"386":16,"387":0,"388":0,"389":0,"390":0,"391":0}';

/*! pako 2.1.0 https://github.com/nodeca/pako @license (MIT AND Zlib) */
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).pako={})}(this,(function(e){"use strict";var t=(e,t,i,n)=>{let a=65535&e|0,r=e>>>16&65535|0,o=0;for(;0!==i;){o=i>2e3?2e3:i,i-=o;do{a=a+t[n++]|0,r=r+a|0}while(--o);a%=65521,r%=65521}return a|r<<16|0};const i=new Uint32Array((()=>{let e,t=[];for(var i=0;i<256;i++){e=i;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[i]=e}return t})());var n=(e,t,n,a)=>{const r=i,o=a+n;e^=-1;for(let i=a;i<o;i++)e=e>>>8^r[255&(e^t[i])];return-1^e};const a=16209;var r=function(e,t){let i,n,r,o,s,l,d,f,c,h,u,w,b,m,k,_,g,p,v,x,y,E,R,A;const Z=e.state;i=e.next_in,R=e.input,n=i+(e.avail_in-5),r=e.next_out,A=e.output,o=r-(t-e.avail_out),s=r+(e.avail_out-257),l=Z.dmax,d=Z.wsize,f=Z.whave,c=Z.wnext,h=Z.window,u=Z.hold,w=Z.bits,b=Z.lencode,m=Z.distcode,k=(1<<Z.lenbits)-1,_=(1<<Z.distbits)-1;e:do{w<15&&(u+=R[i++]<<w,w+=8,u+=R[i++]<<w,w+=8),g=b[u&k];t:for(;;){if(p=g>>>24,u>>>=p,w-=p,p=g>>>16&255,0===p)A[r++]=65535&g;else{if(!(16&p)){if(0==(64&p)){g=b[(65535&g)+(u&(1<<p)-1)];continue t}if(32&p){Z.mode=16191;break e}e.msg="invalid literal/length code",Z.mode=a;break e}v=65535&g,p&=15,p&&(w<p&&(u+=R[i++]<<w,w+=8),v+=u&(1<<p)-1,u>>>=p,w-=p),w<15&&(u+=R[i++]<<w,w+=8,u+=R[i++]<<w,w+=8),g=m[u&_];i:for(;;){if(p=g>>>24,u>>>=p,w-=p,p=g>>>16&255,!(16&p)){if(0==(64&p)){g=m[(65535&g)+(u&(1<<p)-1)];continue i}e.msg="invalid distance code",Z.mode=a;break e}if(x=65535&g,p&=15,w<p&&(u+=R[i++]<<w,w+=8,w<p&&(u+=R[i++]<<w,w+=8)),x+=u&(1<<p)-1,x>l){e.msg="invalid distance too far back",Z.mode=a;break e}if(u>>>=p,w-=p,p=r-o,x>p){if(p=x-p,p>f&&Z.sane){e.msg="invalid distance too far back",Z.mode=a;break e}if(y=0,E=h,0===c){if(y+=d-p,p<v){v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}}else if(c<p){if(y+=d+c-p,p-=c,p<v){v-=p;do{A[r++]=h[y++]}while(--p);if(y=0,c<v){p=c,v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}}}else if(y+=c-p,p<v){v-=p;do{A[r++]=h[y++]}while(--p);y=r-x,E=A}for(;v>2;)A[r++]=E[y++],A[r++]=E[y++],A[r++]=E[y++],v-=3;v&&(A[r++]=E[y++],v>1&&(A[r++]=E[y++]))}else{y=r-x;do{A[r++]=A[y++],A[r++]=A[y++],A[r++]=A[y++],v-=3}while(v>2);v&&(A[r++]=A[y++],v>1&&(A[r++]=A[y++]))}break}}break}}while(i<n&&r<s);v=w>>3,i-=v,w-=v<<3,u&=(1<<w)-1,e.next_in=i,e.next_out=r,e.avail_in=i<n?n-i+5:5-(i-n),e.avail_out=r<s?s-r+257:257-(r-s),Z.hold=u,Z.bits=w};const o=15,s=new Uint16Array([3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0]),l=new Uint8Array([16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78]),d=new Uint16Array([1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0]),f=new Uint8Array([16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64]);var c=(e,t,i,n,a,r,c,h)=>{const u=h.bits;let w,b,m,k,_,g,p=0,v=0,x=0,y=0,E=0,R=0,A=0,Z=0,S=0,T=0,O=null;const U=new Uint16Array(16),D=new Uint16Array(16);let I,B,N,C=null;for(p=0;p<=o;p++)U[p]=0;for(v=0;v<n;v++)U[t[i+v]]++;for(E=u,y=o;y>=1&&0===U[y];y--);if(E>y&&(E=y),0===y)return a[r++]=20971520,a[r++]=20971520,h.bits=1,0;for(x=1;x<y&&0===U[x];x++);for(E<x&&(E=x),Z=1,p=1;p<=o;p++)if(Z<<=1,Z-=U[p],Z<0)return-1;if(Z>0&&(0===e||1!==y))return-1;for(D[1]=0,p=1;p<o;p++)D[p+1]=D[p]+U[p];for(v=0;v<n;v++)0!==t[i+v]&&(c[D[t[i+v]]++]=v);if(0===e?(O=C=c,g=20):1===e?(O=s,C=l,g=257):(O=d,C=f,g=0),T=0,v=0,p=x,_=r,R=E,A=0,m=-1,S=1<<E,k=S-1,1===e&&S>852||2===e&&S>592)return 1;for(;;){I=p-A,c[v]+1<g?(B=0,N=c[v]):c[v]>=g?(B=C[c[v]-g],N=O[c[v]-g]):(B=96,N=0),w=1<<p-A,b=1<<R,x=b;do{b-=w,a[_+(T>>A)+b]=I<<24|B<<16|N|0}while(0!==b);for(w=1<<p-1;T&w;)w>>=1;if(0!==w?(T&=w-1,T+=w):T=0,v++,0==--U[p]){if(p===y)break;p=t[i+c[v]]}if(p>E&&(T&k)!==m){for(0===A&&(A=E),_+=x,R=p-A,Z=1<<R;R+A<y&&(Z-=U[R+A],!(Z<=0));)R++,Z<<=1;if(S+=1<<R,1===e&&S>852||2===e&&S>592)return 1;m=T&k,a[m]=E<<24|R<<16|_-r|0}}return 0!==T&&(a[_+T]=p-A<<24|64<<16|0),h.bits=E,0},h={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_MEM_ERROR:-4,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8};const{Z_FINISH:u,Z_BLOCK:w,Z_TREES:b,Z_OK:m,Z_STREAM_END:k,Z_NEED_DICT:_,Z_STREAM_ERROR:g,Z_DATA_ERROR:p,Z_MEM_ERROR:v,Z_BUF_ERROR:x,Z_DEFLATED:y}=h,E=16180,R=16190,A=16191,Z=16192,S=16194,T=16199,O=16200,U=16206,D=16209,I=e=>(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24);function B(){this.strm=null,this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new Uint16Array(320),this.work=new Uint16Array(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}const N=e=>{if(!e)return 1;const t=e.state;return!t||t.strm!==e||t.mode<E||t.mode>16211?1:0},C=e=>{if(N(e))return g;const t=e.state;return e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=E,t.last=0,t.havedict=0,t.flags=-1,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new Int32Array(852),t.distcode=t.distdyn=new Int32Array(592),t.sane=1,t.back=-1,m},z=e=>{if(N(e))return g;const t=e.state;return t.wsize=0,t.whave=0,t.wnext=0,C(e)},F=(e,t)=>{let i;if(N(e))return g;const n=e.state;return t<0?(i=0,t=-t):(i=5+(t>>4),t<48&&(t&=15)),t&&(t<8||t>15)?g:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=i,n.wbits=t,z(e))},L=(e,t)=>{if(!e)return g;const i=new B;e.state=i,i.strm=e,i.window=null,i.mode=E;const n=F(e,t);return n!==m&&(e.state=null),n};let M,H,j=!0;const K=e=>{if(j){M=new Int32Array(512),H=new Int32Array(32);let t=0;for(;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(c(1,e.lens,0,288,M,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;c(2,e.lens,0,32,H,0,e.work,{bits:5}),j=!1}e.lencode=M,e.lenbits=9,e.distcode=H,e.distbits=5},P=(e,t,i,n)=>{let a;const r=e.state;return null===r.window&&(r.wsize=1<<r.wbits,r.wnext=0,r.whave=0,r.window=new Uint8Array(r.wsize)),n>=r.wsize?(r.window.set(t.subarray(i-r.wsize,i),0),r.wnext=0,r.whave=r.wsize):(a=r.wsize-r.wnext,a>n&&(a=n),r.window.set(t.subarray(i-n,i-n+a),r.wnext),(n-=a)?(r.window.set(t.subarray(i-n,i),0),r.wnext=n,r.whave=r.wsize):(r.wnext+=a,r.wnext===r.wsize&&(r.wnext=0),r.whave<r.wsize&&(r.whave+=a))),0};var Y={inflateReset:z,inflateReset2:F,inflateResetKeep:C,inflateInit:e=>L(e,15),inflateInit2:L,inflate:(e,i)=>{let a,o,s,l,d,f,h,B,C,z,F,L,M,H,j,Y,G,X,W,q,J,Q,V=0;const $=new Uint8Array(4);let ee,te;const ie=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);if(N(e)||!e.output||!e.input&&0!==e.avail_in)return g;a=e.state,a.mode===A&&(a.mode=Z),d=e.next_out,s=e.output,h=e.avail_out,l=e.next_in,o=e.input,f=e.avail_in,B=a.hold,C=a.bits,z=f,F=h,Q=m;e:for(;;)switch(a.mode){case E:if(0===a.wrap){a.mode=Z;break}for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(2&a.wrap&&35615===B){0===a.wbits&&(a.wbits=15),a.check=0,$[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0),B=0,C=0,a.mode=16181;break}if(a.head&&(a.head.done=!1),!(1&a.wrap)||(((255&B)<<8)+(B>>8))%31){e.msg="incorrect header check",a.mode=D;break}if((15&B)!==y){e.msg="unknown compression method",a.mode=D;break}if(B>>>=4,C-=4,J=8+(15&B),0===a.wbits&&(a.wbits=J),J>15||J>a.wbits){e.msg="invalid window size",a.mode=D;break}a.dmax=1<<a.wbits,a.flags=0,e.adler=a.check=1,a.mode=512&B?16189:A,B=0,C=0;break;case 16181:for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(a.flags=B,(255&a.flags)!==y){e.msg="unknown compression method",a.mode=D;break}if(57344&a.flags){e.msg="unknown header flags set",a.mode=D;break}a.head&&(a.head.text=B>>8&1),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0,a.mode=16182;case 16182:for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.head&&(a.head.time=B),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,$[2]=B>>>16&255,$[3]=B>>>24&255,a.check=n(a.check,$,4,0)),B=0,C=0,a.mode=16183;case 16183:for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.head&&(a.head.xflags=255&B,a.head.os=B>>8),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0,a.mode=16184;case 16184:if(1024&a.flags){for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.length=B,a.head&&(a.head.extra_len=B),512&a.flags&&4&a.wrap&&($[0]=255&B,$[1]=B>>>8&255,a.check=n(a.check,$,2,0)),B=0,C=0}else a.head&&(a.head.extra=null);a.mode=16185;case 16185:if(1024&a.flags&&(L=a.length,L>f&&(L=f),L&&(a.head&&(J=a.head.extra_len-a.length,a.head.extra||(a.head.extra=new Uint8Array(a.head.extra_len)),a.head.extra.set(o.subarray(l,l+L),J)),512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,a.length-=L),a.length))break e;a.length=0,a.mode=16186;case 16186:if(2048&a.flags){if(0===f)break e;L=0;do{J=o[l+L++],a.head&&J&&a.length<65536&&(a.head.name+=String.fromCharCode(J))}while(J&&L<f);if(512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,J)break e}else a.head&&(a.head.name=null);a.length=0,a.mode=16187;case 16187:if(4096&a.flags){if(0===f)break e;L=0;do{J=o[l+L++],a.head&&J&&a.length<65536&&(a.head.comment+=String.fromCharCode(J))}while(J&&L<f);if(512&a.flags&&4&a.wrap&&(a.check=n(a.check,o,L,l)),f-=L,l+=L,J)break e}else a.head&&(a.head.comment=null);a.mode=16188;case 16188:if(512&a.flags){for(;C<16;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(4&a.wrap&&B!==(65535&a.check)){e.msg="header crc mismatch",a.mode=D;break}B=0,C=0}a.head&&(a.head.hcrc=a.flags>>9&1,a.head.done=!0),e.adler=a.check=0,a.mode=A;break;case 16189:for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}e.adler=a.check=I(B),B=0,C=0,a.mode=R;case R:if(0===a.havedict)return e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,_;e.adler=a.check=1,a.mode=A;case A:if(i===w||i===b)break e;case Z:if(a.last){B>>>=7&C,C-=7&C,a.mode=U;break}for(;C<3;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}switch(a.last=1&B,B>>>=1,C-=1,3&B){case 0:a.mode=16193;break;case 1:if(K(a),a.mode=T,i===b){B>>>=2,C-=2;break e}break;case 2:a.mode=16196;break;case 3:e.msg="invalid block type",a.mode=D}B>>>=2,C-=2;break;case 16193:for(B>>>=7&C,C-=7&C;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if((65535&B)!=(B>>>16^65535)){e.msg="invalid stored block lengths",a.mode=D;break}if(a.length=65535&B,B=0,C=0,a.mode=S,i===b)break e;case S:a.mode=16195;case 16195:if(L=a.length,L){if(L>f&&(L=f),L>h&&(L=h),0===L)break e;s.set(o.subarray(l,l+L),d),f-=L,l+=L,h-=L,d+=L,a.length-=L;break}a.mode=A;break;case 16196:for(;C<14;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(a.nlen=257+(31&B),B>>>=5,C-=5,a.ndist=1+(31&B),B>>>=5,C-=5,a.ncode=4+(15&B),B>>>=4,C-=4,a.nlen>286||a.ndist>30){e.msg="too many length or distance symbols",a.mode=D;break}a.have=0,a.mode=16197;case 16197:for(;a.have<a.ncode;){for(;C<3;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.lens[ie[a.have++]]=7&B,B>>>=3,C-=3}for(;a.have<19;)a.lens[ie[a.have++]]=0;if(a.lencode=a.lendyn,a.lenbits=7,ee={bits:a.lenbits},Q=c(0,a.lens,0,19,a.lencode,0,a.work,ee),a.lenbits=ee.bits,Q){e.msg="invalid code lengths set",a.mode=D;break}a.have=0,a.mode=16198;case 16198:for(;a.have<a.nlen+a.ndist;){for(;V=a.lencode[B&(1<<a.lenbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(G<16)B>>>=j,C-=j,a.lens[a.have++]=G;else{if(16===G){for(te=j+2;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(B>>>=j,C-=j,0===a.have){e.msg="invalid bit length repeat",a.mode=D;break}J=a.lens[a.have-1],L=3+(3&B),B>>>=2,C-=2}else if(17===G){for(te=j+3;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=j,C-=j,J=0,L=3+(7&B),B>>>=3,C-=3}else{for(te=j+7;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=j,C-=j,J=0,L=11+(127&B),B>>>=7,C-=7}if(a.have+L>a.nlen+a.ndist){e.msg="invalid bit length repeat",a.mode=D;break}for(;L--;)a.lens[a.have++]=J}}if(a.mode===D)break;if(0===a.lens[256]){e.msg="invalid code -- missing end-of-block",a.mode=D;break}if(a.lenbits=9,ee={bits:a.lenbits},Q=c(1,a.lens,0,a.nlen,a.lencode,0,a.work,ee),a.lenbits=ee.bits,Q){e.msg="invalid literal/lengths set",a.mode=D;break}if(a.distbits=6,a.distcode=a.distdyn,ee={bits:a.distbits},Q=c(2,a.lens,a.nlen,a.ndist,a.distcode,0,a.work,ee),a.distbits=ee.bits,Q){e.msg="invalid distances set",a.mode=D;break}if(a.mode=T,i===b)break e;case T:a.mode=O;case O:if(f>=6&&h>=258){e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,r(e,F),d=e.next_out,s=e.output,h=e.avail_out,l=e.next_in,o=e.input,f=e.avail_in,B=a.hold,C=a.bits,a.mode===A&&(a.back=-1);break}for(a.back=0;V=a.lencode[B&(1<<a.lenbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(Y&&0==(240&Y)){for(X=j,W=Y,q=G;V=a.lencode[q+((B&(1<<X+W)-1)>>X)],j=V>>>24,Y=V>>>16&255,G=65535&V,!(X+j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=X,C-=X,a.back+=X}if(B>>>=j,C-=j,a.back+=j,a.length=G,0===Y){a.mode=16205;break}if(32&Y){a.back=-1,a.mode=A;break}if(64&Y){e.msg="invalid literal/length code",a.mode=D;break}a.extra=15&Y,a.mode=16201;case 16201:if(a.extra){for(te=a.extra;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.length+=B&(1<<a.extra)-1,B>>>=a.extra,C-=a.extra,a.back+=a.extra}a.was=a.length,a.mode=16202;case 16202:for(;V=a.distcode[B&(1<<a.distbits)-1],j=V>>>24,Y=V>>>16&255,G=65535&V,!(j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(0==(240&Y)){for(X=j,W=Y,q=G;V=a.distcode[q+((B&(1<<X+W)-1)>>X)],j=V>>>24,Y=V>>>16&255,G=65535&V,!(X+j<=C);){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}B>>>=X,C-=X,a.back+=X}if(B>>>=j,C-=j,a.back+=j,64&Y){e.msg="invalid distance code",a.mode=D;break}a.offset=G,a.extra=15&Y,a.mode=16203;case 16203:if(a.extra){for(te=a.extra;C<te;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}a.offset+=B&(1<<a.extra)-1,B>>>=a.extra,C-=a.extra,a.back+=a.extra}if(a.offset>a.dmax){e.msg="invalid distance too far back",a.mode=D;break}a.mode=16204;case 16204:if(0===h)break e;if(L=F-h,a.offset>L){if(L=a.offset-L,L>a.whave&&a.sane){e.msg="invalid distance too far back",a.mode=D;break}L>a.wnext?(L-=a.wnext,M=a.wsize-L):M=a.wnext-L,L>a.length&&(L=a.length),H=a.window}else H=s,M=d-a.offset,L=a.length;L>h&&(L=h),h-=L,a.length-=L;do{s[d++]=H[M++]}while(--L);0===a.length&&(a.mode=O);break;case 16205:if(0===h)break e;s[d++]=a.length,h--,a.mode=O;break;case U:if(a.wrap){for(;C<32;){if(0===f)break e;f--,B|=o[l++]<<C,C+=8}if(F-=h,e.total_out+=F,a.total+=F,4&a.wrap&&F&&(e.adler=a.check=a.flags?n(a.check,s,F,d-F):t(a.check,s,F,d-F)),F=h,4&a.wrap&&(a.flags?B:I(B))!==a.check){e.msg="incorrect data check",a.mode=D;break}B=0,C=0}a.mode=16207;case 16207:if(a.wrap&&a.flags){for(;C<32;){if(0===f)break e;f--,B+=o[l++]<<C,C+=8}if(4&a.wrap&&B!==(4294967295&a.total)){e.msg="incorrect length check",a.mode=D;break}B=0,C=0}a.mode=16208;case 16208:Q=k;break e;case D:Q=p;break e;case 16210:return v;default:return g}return e.next_out=d,e.avail_out=h,e.next_in=l,e.avail_in=f,a.hold=B,a.bits=C,(a.wsize||F!==e.avail_out&&a.mode<D&&(a.mode<U||i!==u))&&P(e,e.output,e.next_out,F-e.avail_out),z-=e.avail_in,F-=e.avail_out,e.total_in+=z,e.total_out+=F,a.total+=F,4&a.wrap&&F&&(e.adler=a.check=a.flags?n(a.check,s,F,e.next_out-F):t(a.check,s,F,e.next_out-F)),e.data_type=a.bits+(a.last?64:0)+(a.mode===A?128:0)+(a.mode===T||a.mode===S?256:0),(0===z&&0===F||i===u)&&Q===m&&(Q=x),Q},inflateEnd:e=>{if(N(e))return g;let t=e.state;return t.window&&(t.window=null),e.state=null,m},inflateGetHeader:(e,t)=>{if(N(e))return g;const i=e.state;return 0==(2&i.wrap)?g:(i.head=t,t.done=!1,m)},inflateSetDictionary:(e,i)=>{const n=i.length;let a,r,o;return N(e)?g:(a=e.state,0!==a.wrap&&a.mode!==R?g:a.mode===R&&(r=1,r=t(r,i,n,0),r!==a.check)?p:(o=P(e,i,n,n),o?(a.mode=16210,v):(a.havedict=1,m)))},inflateInfo:"pako inflate (from Nodeca project)"};const G=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);var X=function(e){const t=Array.prototype.slice.call(arguments,1);for(;t.length;){const i=t.shift();if(i){if("object"!=typeof i)throw new TypeError(i+"must be non-object");for(const t in i)G(i,t)&&(e[t]=i[t])}}return e},W=e=>{let t=0;for(let i=0,n=e.length;i<n;i++)t+=e[i].length;const i=new Uint8Array(t);for(let t=0,n=0,a=e.length;t<a;t++){let a=e[t];i.set(a,n),n+=a.length}return i};let q=!0;try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){q=!1}const J=new Uint8Array(256);for(let e=0;e<256;e++)J[e]=e>=252?6:e>=248?5:e>=240?4:e>=224?3:e>=192?2:1;J[254]=J[254]=1;var Q=e=>{if("function"==typeof TextEncoder&&TextEncoder.prototype.encode)return(new TextEncoder).encode(e);let t,i,n,a,r,o=e.length,s=0;for(a=0;a<o;a++)i=e.charCodeAt(a),55296==(64512&i)&&a+1<o&&(n=e.charCodeAt(a+1),56320==(64512&n)&&(i=65536+(i-55296<<10)+(n-56320),a++)),s+=i<128?1:i<2048?2:i<65536?3:4;for(t=new Uint8Array(s),r=0,a=0;r<s;a++)i=e.charCodeAt(a),55296==(64512&i)&&a+1<o&&(n=e.charCodeAt(a+1),56320==(64512&n)&&(i=65536+(i-55296<<10)+(n-56320),a++)),i<128?t[r++]=i:i<2048?(t[r++]=192|i>>>6,t[r++]=128|63&i):i<65536?(t[r++]=224|i>>>12,t[r++]=128|i>>>6&63,t[r++]=128|63&i):(t[r++]=240|i>>>18,t[r++]=128|i>>>12&63,t[r++]=128|i>>>6&63,t[r++]=128|63&i);return t},V=(e,t)=>{const i=t||e.length;if("function"==typeof TextDecoder&&TextDecoder.prototype.decode)return(new TextDecoder).decode(e.subarray(0,t));let n,a;const r=new Array(2*i);for(a=0,n=0;n<i;){let t=e[n++];if(t<128){r[a++]=t;continue}let o=J[t];if(o>4)r[a++]=65533,n+=o-1;else{for(t&=2===o?31:3===o?15:7;o>1&&n<i;)t=t<<6|63&e[n++],o--;o>1?r[a++]=65533:t<65536?r[a++]=t:(t-=65536,r[a++]=55296|t>>10&1023,r[a++]=56320|1023&t)}}return((e,t)=>{if(t<65534&&e.subarray&&q)return String.fromCharCode.apply(null,e.length===t?e:e.subarray(0,t));let i="";for(let n=0;n<t;n++)i+=String.fromCharCode(e[n]);return i})(r,a)},$=(e,t)=>{(t=t||e.length)>e.length&&(t=e.length);let i=t-1;for(;i>=0&&128==(192&e[i]);)i--;return i<0||0===i?t:i+J[e[i]]>t?i:t},ee={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"};var te=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0};var ie=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1};const ne=Object.prototype.toString,{Z_NO_FLUSH:ae,Z_FINISH:re,Z_OK:oe,Z_STREAM_END:se,Z_NEED_DICT:le,Z_STREAM_ERROR:de,Z_DATA_ERROR:fe,Z_MEM_ERROR:ce}=h;function he(e){this.options=X({chunkSize:65536,windowBits:15,to:""},e||{});const t=this.options;t.raw&&t.windowBits>=0&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(t.windowBits>=0&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),t.windowBits>15&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new te,this.strm.avail_out=0;let i=Y.inflateInit2(this.strm,t.windowBits);if(i!==oe)throw new Error(ee[i]);if(this.header=new ie,Y.inflateGetHeader(this.strm,this.header),t.dictionary&&("string"==typeof t.dictionary?t.dictionary=Q(t.dictionary):"[object ArrayBuffer]"===ne.call(t.dictionary)&&(t.dictionary=new Uint8Array(t.dictionary)),t.raw&&(i=Y.inflateSetDictionary(this.strm,t.dictionary),i!==oe)))throw new Error(ee[i])}function ue(e,t){const i=new he(t);if(i.push(e),i.err)throw i.msg||ee[i.err];return i.result}he.prototype.push=function(e,t){const i=this.strm,n=this.options.chunkSize,a=this.options.dictionary;let r,o,s;if(this.ended)return!1;for(o=t===~~t?t:!0===t?re:ae,"[object ArrayBuffer]"===ne.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;;){for(0===i.avail_out&&(i.output=new Uint8Array(n),i.next_out=0,i.avail_out=n),r=Y.inflate(i,o),r===le&&a&&(r=Y.inflateSetDictionary(i,a),r===oe?r=Y.inflate(i,o):r===fe&&(r=le));i.avail_in>0&&r===se&&i.state.wrap>0&&0!==e[i.next_in];)Y.inflateReset(i),r=Y.inflate(i,o);switch(r){case de:case fe:case le:case ce:return this.onEnd(r),this.ended=!0,!1}if(s=i.avail_out,i.next_out&&(0===i.avail_out||r===se))if("string"===this.options.to){let e=$(i.output,i.next_out),t=i.next_out-e,a=V(i.output,e);i.next_out=t,i.avail_out=n-t,t&&i.output.set(i.output.subarray(e,e+t),0),this.onData(a)}else this.onData(i.output.length===i.next_out?i.output:i.output.subarray(0,i.next_out));if(r!==oe||0!==s){if(r===se)return r=Y.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,!0;if(0===i.avail_in)break}}return!0},he.prototype.onData=function(e){this.chunks.push(e)},he.prototype.onEnd=function(e){e===oe&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=W(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg};var we=he,be=ue,me=function(e,t){return(t=t||{}).raw=!0,ue(e,t)},ke=ue,_e=h,ge={Inflate:we,inflate:be,inflateRaw:me,ungzip:ke,constants:_e};e.Inflate=we,e.constants=_e,e.default=ge,e.inflate=be,e.inflateRaw=me,e.ungzip=ke,Object.defineProperty(e,"__esModule",{value:!0})}));
