import {dcDialog, setLoadingText, showToastMessage} from './resources.js';

const ELEKTRON_SYSEX_HEADER = [0xF0, 0x00, 0x20, 0x3C, 0x10, 0x00];
const SYSEX_END = 0xF7;
const CHUNK_SIZE = 0x2000; // 8KB chunks for file read/write

// Opcodes
const OP_DEVICE_REQ = 0x01;
const OP_DEVICE_RESP = 0x81;
const OP_VERSION_REQ = 0x02;
const OP_VERSION_RESP = 0x82;
const OP_DIR_LIST_REQ = 0x10;
const OP_DIR_LIST_RESP = 0x90;
const OP_DIR_CREATE_REQ = 0x11;
const OP_DIR_CREATE_RESP = 0x91;
const OP_DIR_DELETE_REQ = 0x12;
const OP_DIR_DELETE_RESP = 0x92;
const OP_FILE_DELETE_REQ = 0x20;
const OP_FILE_DELETE_RESP = 0xA0;
const OP_ITEM_RENAME_REQ = 0x21;
const OP_ITEM_RENAME_RESP = 0xA1;
const OP_FILE_READ_OPEN_REQ = 0x30;
const OP_FILE_READ_OPEN_RESP = 0xB0;
const OP_FILE_READ_CLOSE_REQ = 0x31;
const OP_FILE_READ_CLOSE_RESP = 0xB1;
const OP_FILE_READ_REQ = 0x32;
const OP_FILE_READ_RESP = 0xB2;
const OP_FILE_WRITE_OPEN_REQ = 0x40;
const OP_FILE_WRITE_OPEN_RESP = 0xC0;
const OP_FILE_WRITE_CLOSE_REQ = 0x41;
const OP_FILE_WRITE_CLOSE_RESP = 0xC1;
const OP_FILE_WRITE_REQ = 0x42;
const OP_FILE_WRITE_RESP = 0xC2;

let midiAccess = null;
let selectedInPort = null;
let selectedOutPort = null;
let inPortId = localStorage.getItem('__dt_midi_in__') || '';
let outPortId = localStorage.getItem('__dt_midi_out__') || '';
let connectedDevice = null; // { productId, device, deviceName, version, build, supportsStereo }
let currentPath = '/';
let navHistory = ['/'];
let navHistoryIndex = 0;
let dirEntries = [];
let selectedEntries = new Set();
let msgCounter = 1;
let pendingRequests = new Map(); // msgId -> { resolve, reject, timer, opcode }
let transferProgress = { active: false, title: '', progress: 0, cancel: false };
let consumeFileInputFn = null;
let getFilesFn = null;

const dtBrowserPanelEl = document.getElementById('dtBrowserPanel');
const dtBrowserContentEl = document.getElementById('dtBrowserPanelContent');
const rightButtonsEl = document.querySelector('.right-buttons');

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function isSupported() {
    return typeof navigator !== 'undefined' && (!!navigator.requestMIDIAccess || !!navigator.usb);
}

export function normalizePath(path) {
    if (!path) return '/';
    path = path.trim();
    if (!path.startsWith('/')) path = '/' + path;
    path = path.replace(/\/+/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    return path;
}

// 7-Bit Encoding / Decoding for Elektron SysEx API
function encode7Bit(data8) {
    const len8 = data8.length;
    const len7 = len8 + Math.ceil(len8 / 7);
    const buf = new Uint8Array(len7);
    let w = 0;
    for (let r = 0; r < len8; r += 7) {
        const s = data8.slice(r, r + 7);
        buf[w++] = s.reduce((acc, b, i) => acc | ((b & 0x80) >> (i + 1)), 0);
        for (let j = 0; j < s.length; j++) {
            buf[w++] = s[j] & 0x7F;
        }
    }
    return buf.subarray(0, w);
}

function decode7Bit(data7) {
    const inLen = data7.length;
    const outLen = Math.floor(inLen / 8) * 7 + Math.max(0, (inLen % 8) - 1);
    const out = new Uint8Array(outLen);
    let outIdx = 0;
    for (let i = 0; i < inLen; i += 8) {
        const hi = data7[i];
        const count = Math.min(7, inLen - (i + 1));
        for (let j = 0; j < count; j++) {
            const lo = data7[i + 1 + j] & 0x7F;
            const bit = (hi << (j + 1)) & 0x80;
            out[outIdx++] = lo | bit;
        }
    }
    return out.subarray(0, outIdx);
}

function encodeString(str) {
    const enc = new TextEncoder();
    const bytes = enc.encode(str);
    const result = new Uint8Array(bytes.length + 1);
    result.set(bytes, 0);
    result[bytes.length] = 0; // null termination
    return result;
}

function decodeString(bytes, offset = 0) {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 0) {
        end++;
    }
    const dec = new TextDecoder('windows-1252');
    const str = dec.decode(bytes.subarray(offset, end));
    return { str, nextOffset: end + 1 };
}

function handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 7 || data[0] !== 0xF0) return;

    // Verify header: [0xF0, 0x00, 0x20, 0x3C, 0x10, 0x00]
    if (data[0] === 0xF0 && data[1] === 0x00 && data[2] === 0x20 &&
        data[3] === 0x3C && data[4] === 0x10 && data[5] === 0x00) {
        const endIdx = data.indexOf(SYSEX_END);
        const payload7 = data.subarray(6, endIdx !== -1 ? endIdx : data.length);
        const data8 = decode7Bit(payload7);
        if (data8.length < 5) return;

        const msgId = (data8[0] << 8) | data8[1];
        const respId = (data8[2] << 8) | data8[3];
        const opcode = data8[4];
        const payload = data8.subarray(5);

        // Match pending request by respId
        if (respId > 0 && pendingRequests.has(respId)) {
            const req = pendingRequests.get(respId);
            clearTimeout(req.timer);
            pendingRequests.delete(respId);
            req.resolve({ opcode, payload, msgId, respId });
        }
    }
}

function sendRequest(opcode, payloadBytes = new Uint8Array(0), timeoutMs = 8000) {
    if (!selectedOutPort) {
        return Promise.reject(new Error('No MIDI Output port selected.'));
    }

    const msgId = msgCounter++;
    if (msgCounter > 0xFFFF) msgCounter = 1;
    const respId = 0;

    const data8 = new Uint8Array(5 + payloadBytes.length);
    data8[0] = (msgId >> 8) & 0xFF;
    data8[1] = msgId & 0xFF;
    data8[2] = (respId >> 8) & 0xFF;
    data8[3] = respId & 0xFF;
    data8[4] = opcode;
    data8.set(payloadBytes, 5);

    const enc7 = encode7Bit(data8);
    const sysex = new Uint8Array(ELEKTRON_SYSEX_HEADER.length + enc7.length + 1);
    sysex.set(ELEKTRON_SYSEX_HEADER, 0);
    sysex.set(enc7, ELEKTRON_SYSEX_HEADER.length);
    sysex[sysex.length - 1] = SYSEX_END;

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingRequests.delete(msgId);
            reject(new Error(`Timeout waiting for response to opcode 0x${opcode.toString(16)} (msgId: ${msgId})`));
        }, timeoutMs);

        pendingRequests.set(msgId, { resolve, reject, timer, opcode });

        try {
            selectedOutPort.send(sysex);
        } catch (err) {
            clearTimeout(timer);
            pendingRequests.delete(msgId);
            reject(err);
        }
    });
}

// MIDI Stuff
export function getInputs() {
    if (!midiAccess) return [];
    return Array.from(midiAccess.inputs.values()).map(p => ({
        id: p.id,
        name: p.name || p.manufacturer || 'MIDI Input',
        manufacturer: p.manufacturer,
        state: p.state
    }));
}

export function getOutputs() {
    if (!midiAccess) return [];
    return Array.from(midiAccess.outputs.values()).map(p => ({
        id: p.id,
        name: p.name || p.manufacturer || 'MIDI Output',
        manufacturer: p.manufacturer,
        state: p.state
    }));
}

function autoSelectPorts() {
    const inputs = getInputs();
    const outputs = getOutputs();

    const inPort = inputs.find(p => p.id === inPortId) || inputs.find(p => /digitakt|elektron/i.test(p.name));
    const outPort = outputs.find(p => p.id === outPortId) || outputs.find(p => /digitakt|elektron/i.test(p.name));

    if (inPort) selectInPort(inPort.id);
    if (outPort) selectOutPort(outPort.id);
}

export function selectInPort(id) {
    if (selectedInPort) {
        selectedInPort.onmidimessage = null;
    }
    inPortId = id;
    localStorage.setItem('__dt_midi_in__', id);
    if (midiAccess && id) {
        selectedInPort = midiAccess.inputs.get(id);
        if (selectedInPort) {
            selectedInPort.onmidimessage = (e) => handleMidiMessage(e);
        }
    } else {
        selectedInPort = null;
    }
    renderDtBrowser();
}

export function selectOutPort(id) {
    outPortId = id;
    localStorage.setItem('__dt_midi_out__', id);
    if (midiAccess && id) {
        selectedOutPort = midiAccess.outputs.get(id);
    } else {
        selectedOutPort = null;
    }
    renderDtBrowser();
}

export async function requestMidi() {
    if (!navigator.requestMIDIAccess) {
        throw new Error('WebMIDI is not supported in this browser environment.');
    }
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        midiAccess.onstatechange = () => renderDtBrowser();
        autoSelectPorts();
        return true;
    } catch (err) {
        console.error('Failed to get MIDI access', err);
        throw err;
    }
}

export async function scanPorts() {
    try {
        await requestMidi();
        renderDtBrowser();
        showToastMessage('MIDI ports scanned.');
    } catch (err) {
        showToastMessage(err.message || 'Error scanning MIDI ports.');
    }
}

export async function connect() {
    if (!midiAccess) {
        await requestMidi();
    }
    if (!selectedInPort || !selectedOutPort) {
        showToastMessage('Please select both MIDI Input and Output ports.');
        return;
    }

    setLoadingText('Connecting to Digitakt');
    try {
        const devResp = await sendRequest(OP_DEVICE_REQ);
        if (devResp.opcode !== OP_DEVICE_RESP) {
            showToastMessage( `Unexpected device response opcode: 0x${devResp.opcode.toString(16)}`);
            return;
        }

        const p = devResp.payload;
        const productId = p[0];
        const numMsgs = p[1];
        const off = 2 + numMsgs;
        const { str: deviceName } = decodeString(p, off);

        const inName = selectedInPort?.name || '';
        const outName = selectedOutPort?.name || '';

        const isDigitakt2 = (productId === 42 || productId === 0x2A) ||
            /digitakt\s*(ii|2)/i.test(deviceName) ||
            /digitakt\s*(ii|2)/i.test(inName) ||
            /digitakt\s*(ii|2)/i.test(outName);

        const isDigitakt1 = !isDigitakt2 && (
            productId === 12 || productId === 0x0C ||
            /digitakt/i.test(deviceName) ||
            /digitakt/i.test(inName) ||
            /digitakt/i.test(outName)
        );

        const device = isDigitakt2 ? 'Digitakt II' : (isDigitakt1 ? 'Digitakt' : (deviceName || 'Elektron Device'));
        const supportsStereo = isDigitakt2;
        
        let version = '';
        let build = '';
        try {
            const verResp = await sendRequest(OP_VERSION_REQ);
            if (verResp.opcode === OP_VERSION_RESP) {
                const buildRes = decodeString(verResp.payload, 0);
                build = buildRes.str;
                const verRes = decodeString(verResp.payload, buildRes.nextOffset);
                version = verRes.str;
            }
        } catch (e) {
            console.warn('Could not read version response', e);
        }

        connectedDevice = {
            productId,
            device,
            deviceName: deviceName || device,
            version: version || '1.0',
            build,
            supportsStereo
        };

        navHistory = ['/'];
        navHistoryIndex = 0;

        showToastMessage(`Connected to ${connectedDevice.deviceName} (${connectedDevice.version})`);
        await changeDirectory('/', false);
    } catch (err) {
        console.error(err);
        showToastMessage(`Connection failed: ${err.message}`);
    } finally {
        setLoadingText('');
        renderDtBrowser();
    }
}

export function disconnect() {
    connectedDevice = null;
    dirEntries = [];
    selectedEntries.clear();
    navHistory = ['/'];
    navHistoryIndex = 0;
    for (const req of pendingRequests.values()) {
        clearTimeout(req.timer);
        req.reject(new Error('Disconnected'));
    }
    pendingRequests.clear();
    showToastMessage('Disconnected from Digitakt.');
    renderDtBrowser();
}

// Directory Operations
export async function changeDirectory(path, pushHistory = true) {
    path = normalizePath(path);

    // factory directory at root level is protected / read-only and cannot be modified or read from so disable access in UI.
    if (path.toLowerCase() === '/factory' || path.toLowerCase().startsWith('/factory/')) {
        showToastMessage('Factory folder is protected and cannot be opened.');
        return;
    }

    if (pushHistory && path !== currentPath) {
        navHistory = navHistory.slice(0, navHistoryIndex + 1);
        navHistory.push(path);
        navHistoryIndex = navHistory.length - 1;
    }

    currentPath = path;
    selectedEntries.clear();
    return await refreshDirectory();
}

export async function refreshDirectory() {
    if (!connectedDevice) return [];
    const pathBytes = encodeString(currentPath);
    const resp = await sendRequest(OP_DIR_LIST_REQ, pathBytes);
    if (resp.opcode !== OP_DIR_LIST_RESP) {
        throw new Error(`DirList failed, opcode: 0x${resp.opcode.toString(16)}`);
    }

    const entries = [];
    const p = resp.payload;
    let offset = 0;
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength);

    while (offset + 10 <= p.length) {
        const hash = view.getUint32(offset, false);
        const size = view.getUint32(offset + 4, false);
        const lockedRaw = p[offset + 8] !== 0;
        const rawType = String.fromCharCode(p[offset + 9]);
        offset += 10;
        const { str: name, nextOffset } = decodeString(p, offset);
        offset = nextOffset;

        const fullPath = normalizePath(currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);
        const isDir = rawType === 'D' || rawType === 'd' || (size === 0 && hash === 0 && !name.toLowerCase().endsWith('.wav'));
        const type = isDir ? 'd' : 'f';

        // Special Folder Rules at Root Level
        const isRoot = currentPath === '/';
        const isFactory = isRoot && isDir && name.toLowerCase() === 'factory';
        const isIncoming = isRoot && isDir && name.toLowerCase() === 'incoming'; // incoming folder can't be removed.
        const isRecorded = isRoot && isDir && name.toLowerCase() === 'recorded'; // recorded folder can't be removed.
        const locked = lockedRaw || isFactory;

        entries.push({
            hash,
            size,
            locked,
            type,
            name,
            fullPath,
            isFactory,
            isIncoming,
            isRecorded,
        });
    }

    // Sort: folders first, then files, natural alphabetical order
    entries.sort((a, b) => {
        if (a.type === 'd' && b.type !== 'd') return -1;
        if (a.type !== 'd' && b.type === 'd') return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    dirEntries = entries;
    renderDtBrowser();
    return entries;
}

export async function createDirectory(folderName) {
    if (!folderName || !folderName.trim()) return false;

    // Prevent creating/modifying inside factory
    if (currentPath.toLowerCase().startsWith('/factory')) {
        showToastMessage('Cannot create folders inside the Factory directory.');
        return false;
    }

    folderName = folderName.trim().replace(/[\/\\:*?"<>|]/g, '-');
    const targetPath = normalizePath(currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`);
    const pathBytes = encodeString(targetPath);
    const resp = await sendRequest(OP_DIR_CREATE_REQ, pathBytes);
    if (resp.opcode === OP_DIR_CREATE_RESP && resp.payload[0] === 1) {
        await refreshDirectory();
        return true;
    }
    throw new Error('Failed to create directory on +Drive.');
}

export async function deleteEntry(entry) {
    if (entry.isIncoming || (currentPath === '/' && entry.name.toLowerCase() === 'incoming')) {
        showToastMessage(`The 'incoming' folder is a system folder and cannot be deleted.`);
        return false;
    }

    if (entry.isRecorded || (currentPath === '/' && entry.name.toLowerCase() === 'recorded')) {
        showToastMessage(`The 'recorded' folder is a system folder and cannot be deleted.`);
        return false;
    }
    
    if (entry.isFactory || (currentPath === '/' && entry.name.toLowerCase() === 'factory')) {
        showToastMessage('The Factory folder is write-protected and cannot be deleted.');
        return false;
    }

    const pathBytes = encodeString(entry.fullPath);
    if (entry.type === 'd') {
        const resp = await sendRequest(OP_DIR_DELETE_REQ, pathBytes);
        if (resp.opcode === OP_DIR_DELETE_RESP && resp.payload[0] === 1) {
            await refreshDirectory();
            return true;
        }
    } else {
        const resp = await sendRequest(OP_FILE_DELETE_REQ, pathBytes);
        if (resp.opcode === OP_FILE_DELETE_RESP && resp.payload[0] === 1) {
            await refreshDirectory();
            return true;
        }
    }
    throw new Error(`Failed to delete ${entry.name}`);
}

export async function renameEntry(entry, newName) {
    if (!newName || !newName.trim()) return false;
    if (entry.isFactory || entry.isIncoming || entry.isRecorded) {
        showToastMessage('System folders cannot be renamed.');
        return false;
    }

    newName = newName.trim().replace(/[\/\\:*?"<>|]/g, '-');
    const newPath = normalizePath(currentPath === '/' ? `/${newName}` : `${currentPath}/${newName}`);
    const fromBytes = encodeString(entry.fullPath);
    const toBytes = encodeString(newPath);
    const payload = new Uint8Array(fromBytes.length + toBytes.length);
    payload.set(fromBytes, 0);
    payload.set(toBytes, fromBytes.length);

    const resp = await sendRequest(OP_ITEM_RENAME_REQ, payload);
    if (resp.opcode === OP_ITEM_RENAME_RESP && resp.payload[0] === 1) {
        await refreshDirectory();
        return true;
    }
    throw new Error(`Failed to rename ${entry.name}`);
}

// Read / Download File from Digitakt
export async function downloadFile(entry, onProgress) {
    const pathBytes = encodeString(entry.fullPath);
    const openResp = await sendRequest(OP_FILE_READ_OPEN_REQ, pathBytes);
    if (openResp.opcode !== OP_FILE_READ_OPEN_RESP || openResp.payload[0] !== 1) {
        throw new Error(`Failed to open file '${entry.name}' on Digitakt.`);
    }

    const view = new DataView(openResp.payload.buffer, openResp.payload.byteOffset);
    const fd = view.getUint32(1, false);
    const totalLen = view.getUint32(5, false);

    const chunks = [];
    let readOffset = 0;

    try {
        while (readOffset < totalLen) {
            if (transferProgress.cancel) {
                throw new Error('Transfer cancelled by user.');
            }
            const chunkLen = Math.min(CHUNK_SIZE, totalLen - readOffset);
            const reqPayload = new Uint8Array(12);
            const reqView = new DataView(reqPayload.buffer);
            reqView.setUint32(0, fd, false);
            reqView.setUint32(4, chunkLen, false);
            reqView.setUint32(8, readOffset, false);

            const chunkResp = await sendRequest(OP_FILE_READ_REQ, reqPayload, 12000);
            if (chunkResp.opcode !== OP_FILE_READ_RESP || chunkResp.payload[0] !== 1) {
                throw new Error(`Failed reading chunk at offset ${readOffset}`);
            }

            const dataChunk = chunkResp.payload.subarray(17);
            chunks.push(dataChunk);
            readOffset += chunkLen;

            if (onProgress) {
                onProgress(readOffset / totalLen, readOffset, totalLen);
            }
        }
    } finally {
        const closePayload = new Uint8Array(4);
        new DataView(closePayload.buffer).setUint32(0, fd, false);
        try {
            await sendRequest(OP_FILE_READ_CLOSE_REQ, closePayload);
        } catch (e) {
            console.warn('Error closing read file', e);
        }
    }

    // Assemble full file buffer
    const fileBuffer = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        fileBuffer.set(chunk, offset);
        offset += chunk.length;
    }

    // Parse 64-byte Elektron sample header
    const headerView = new DataView(fileBuffer.buffer, fileBuffer.byteOffset, Math.min(64, totalLen));
    const isStereo = headerView.getUint8(1) === 1;
    const sampleBytes = headerView.getUint32(4, false);
    const sampleRate = headerView.getUint32(8, false) || 48000;
    const nChannels = isStereo ? 2 : 1;

    // Convert big-endian 16-bit PCM to RIFF WAV file format
    const wavDataLen = sampleBytes;
    const fmtChunkLen = 16;
    const riffChunkLen = 4 + (8 + fmtChunkLen) + (8 + wavDataLen);
    const wavBuffer = new ArrayBuffer(8 + riffChunkLen);
    const wavView = new DataView(wavBuffer);

    const setAscii = (o, str) => {
        for (let i = 0; i < str.length; i++) wavView.setUint8(o + i, str.charCodeAt(i));
    };

    setAscii(0, 'RIFF');
    wavView.setUint32(4, riffChunkLen, true);
    setAscii(8, 'WAVE');
    setAscii(12, 'fmt ');
    wavView.setUint32(16, fmtChunkLen, true);
    wavView.setUint16(20, 1, true); // PCM
    wavView.setUint16(22, nChannels, true);
    wavView.setUint32(24, sampleRate, true);
    wavView.setUint32(28, 2 * sampleRate * nChannels, true); // Byte rate
    wavView.setUint16(32, 2 * nChannels, true); // Block align
    wavView.setUint16(34, 16, true); // Bits per sample
    setAscii(36, 'data');
    wavView.setUint32(40, wavDataLen, true);

    // Convert big-endian samples to little-endian
    const rawSamples = new DataView(fileBuffer.buffer, fileBuffer.byteOffset + 64, sampleBytes);
    for (let i = 0; i < sampleBytes; i += 2) {
        const sample = rawSamples.getInt16(i, false);
        wavView.setInt16(44 + i, sample, true);
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const fileName = entry.name.toLowerCase().endsWith('.wav') ? entry.name : `${entry.name}.wav`;
    const file = new File([blob], fileName, { type: 'audio/wav', lastModified: Date.now() });

    return { blob, file, fileName, sampleRate, nChannels };
}

// Write / Upload File to Digitakt
export async function uploadAudio(audioData, sampleName, onProgress) {
    if (currentPath.toLowerCase().startsWith('/factory')) {
        throw new Error('Cannot upload to the Factory directory.');
    }

    let buffer = audioData.buffer;
    const targetSR = 48000;
    const isDeviceStereo = connectedDevice ? connectedDevice.supportsStereo : true;
    const srcStereo = buffer.numberOfChannels >= 2;
    const dstStereo = srcStereo && isDeviceStereo;
    const nChannels = dstStereo ? 2 : 1;

    // Render audio in OfflineAudioContext at 48kHz
    const lengthIn48k = Math.max(1, Math.round(buffer.duration * targetSR));
    const offlineCtx = new OfflineAudioContext(nChannels, lengthIn48k, targetSR);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();

    const nSamples = rendered.length;
    const frameSize = dstStereo ? 4 : 2;
    const sampleBytes = nSamples * frameSize;
    const totalLen = 64 + sampleBytes;

    const fileBuffer = new ArrayBuffer(totalLen);
    const header = new DataView(fileBuffer, 0, 64);
    header.setUint8(0, 0); // type (0 = sample)
    header.setUint8(1, dstStereo ? 1 : 0); // stereo (1 = stereo, 0 = mono)
    header.setUint32(4, sampleBytes, false);
    header.setUint32(8, targetSR, false);
    header.setUint32(12, 0, false);
    header.setUint32(16, nSamples - 1, false);
    header.setUint8(20, 0x7F); // no loop

    const samplesView = new DataView(fileBuffer, 64, sampleBytes);
    const ch0 = rendered.getChannelData(0);
    const ch1 = dstStereo ? rendered.getChannelData(1) : null;

    for (let i = 0; i < nSamples; i++) {
        const v0 = Math.max(-32768, Math.min(32767, Math.floor(ch0[i] * 32767.5)));
        samplesView.setInt16(i * frameSize, v0, false);
        if (dstStereo && ch1) {
            const v1 = Math.max(-32768, Math.min(32767, Math.floor(ch1[i] * 32767.5)));
            samplesView.setInt16(i * frameSize + 2, v1, false);
        }
    }

    // Sanitize name for Digitakt
    let cleanName = sampleName.replace(/\.(wav|aif|aiff|flac|mp3|ogg)$/i, '')
        .replace(/[^a-zA-Z0-9\s#\-_()]/g, '_')
        .trim();
    if (!cleanName) cleanName = 'sample';
    if (cleanName.length > 28) cleanName = cleanName.substring(0, 28);

    const targetPath = normalizePath(currentPath === '/' ? `/${cleanName}` : `${currentPath}/${cleanName}`);
    
    const pathBytes = encodeString(targetPath);
    const openPayload = new Uint8Array(4 + pathBytes.length);
    new DataView(openPayload.buffer).setUint32(0, totalLen, false);
    openPayload.set(pathBytes, 4);

    const openResp = await sendRequest(OP_FILE_WRITE_OPEN_REQ, openPayload);
    if (openResp.opcode !== OP_FILE_WRITE_OPEN_RESP || openResp.payload[0] !== 1) {
        throw new Error(`Failed to open write stream for '${cleanName}' on Digitakt.`);
    }

    const fd = new DataView(openResp.payload.buffer, openResp.payload.byteOffset).getUint32(1, false);
    
    const fileBytes = new Uint8Array(fileBuffer);
    let writeOffset = 0;

    try {
        while (writeOffset < totalLen) {
            if (transferProgress.cancel) {
                throw new Error('Upload cancelled by user.');
            }
            const chunkLen = Math.min(CHUNK_SIZE, totalLen - writeOffset);
            const chunk = fileBytes.subarray(writeOffset, writeOffset + chunkLen);

            const chunkPayload = new Uint8Array(12 + chunk.length);
            const reqView = new DataView(chunkPayload.buffer);
            reqView.setUint32(0, fd, false);
            reqView.setUint32(4, chunkLen, false);
            reqView.setUint32(8, writeOffset, false);
            chunkPayload.set(chunk, 12);

            const writeResp = await sendRequest(OP_FILE_WRITE_REQ, chunkPayload, 12000);
            if (writeResp.opcode !== OP_FILE_WRITE_RESP || writeResp.payload[0] !== 1) {
                throw new Error(`Write failed at offset ${writeOffset}`);
            }

            writeOffset += chunkLen;
            if (onProgress) {
                onProgress(writeOffset / totalLen, writeOffset, totalLen);
            }
        }
    } finally {
        const closePayload = new Uint8Array(8);
        const closeView = new DataView(closePayload.buffer);
        closeView.setUint32(0, fd, false);
        closeView.setUint32(4, totalLen, false);
        try {
            await sendRequest(OP_FILE_WRITE_CLOSE_REQ, closePayload);
        } catch (e) {
            console.warn('Error closing write file', e);
        }
    }

    return true;
}

// Controller Actions
export function navBack() {
    if (navHistoryIndex > 0) {
        navHistoryIndex--;
        const path = navHistory[navHistoryIndex];
        setLoadingText('Reading directory');
        changeDirectory(path, false).catch(err => {
            showToastMessage(`Navigation failed: ${err.message}`);
        }).finally(() => {
            setLoadingText('');
            renderDtBrowser();
        });
    }
}

export function navForward() {
    if (navHistoryIndex < navHistory.length - 1) {
        navHistoryIndex++;
        const path = navHistory[navHistoryIndex];
        setLoadingText('Reading directory');
        changeDirectory(path, false).catch(err => {
            showToastMessage(`Navigation failed: ${err.message}`);
        }).finally(() => {
            setLoadingText('');
            renderDtBrowser();
        });
    }
}

export function navUp() {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 0) {
        parts.pop();
        const parentPath = '/' + parts.join('/');
        changeDir(parentPath);
    }
}

export function changeDir(path) {
    setLoadingText('Reading directory');
    changeDirectory(path, true).catch(err => {
        showToastMessage(`Failed reading folder: ${err.message}`);
    }).finally(() => {
        setLoadingText('');
        renderDtBrowser();
    });
}

export function openEntryByIndex(idx) {
    const entry = dirEntries[idx];
    if (!entry) return;
    if (entry.isFactory) {
        showToastMessage('Factory folder is protected and cannot be opened.');
        return;
    }
    if (entry.type === 'd') {
        changeDir(entry.fullPath);
    } else {
        downloadSingleFileByIndex(idx);
    }
}

export async function refreshDir() {
    setLoadingText('Refreshing directory');
    try {
        await refreshDirectory();
    } catch (err) {
        showToastMessage(`Refresh failed: ${err.message}`);
    } finally {
        setLoadingText('');
        renderDtBrowser();
    }
}

export async function promptNewFolder() {
    if (currentPath.toLowerCase().startsWith('/factory')) {
        showToastMessage('Cannot create folders in the Factory directory.');
        return;
    }

    const name = await dcDialog('prompt', `Create folder in ${currentPath}:`);
    if (name && name.trim()) {
        setLoadingText('Creating folder');
        try {
            await createDirectory(name.trim());
            showToastMessage(`Folder '${name.trim()}' created.`);
        } catch (err) {
            showToastMessage(`Error: ${err.message}`);
        } finally {
            setLoadingText('');
            renderDtBrowser();
        }
    }
}

export function toggleSelectEntryByIndex(idx, isChecked) {
    const entry = dirEntries[idx];
    if (!entry || entry.isFactory || entry.isIncoming || entry.isRecorded) return;
    if (isChecked) {
        selectedEntries.add(entry.fullPath);
    } else {
        selectedEntries.delete(entry.fullPath);
    }
    renderDtBrowser();
}

export function toggleSelectAll(isChecked) {
    if (isChecked) {
        dirEntries.forEach(e => {
            if (!e.locked && !e.isFactory) selectedEntries.add(e.fullPath);
        });
    } else {
        selectedEntries.clear();
    }
    renderDtBrowser();
}

export async function promptRenameByIndex(idx) {
    const entry = dirEntries[idx];
    if (!entry || entry.locked || entry.isFactory || entry.isIncoming || entry.isRecorded) return;
    const newName = await dcDialog('prompt', `Rename '${entry.name}' to:`, entry.name);
    if (newName && newName.trim() && newName.trim() !== entry.name) {
        setLoadingText('Renaming item');
        try {
            await renameEntry(entry, newName.trim());
            showToastMessage(`Renamed to '${newName.trim()}'.`);
        } catch (err) {
            showToastMessage(`Rename failed: ${err.message}`);
        } finally {
            setLoadingText('');
            renderDtBrowser();
        }
    }
}

export async function promptDeleteByIndex(idx) {
    const entry = dirEntries[idx];
    if (!entry || entry.isFactory || entry.isIncoming || entry.isRecorded) return;
    const isDir = entry.type === 'd';
    const confirm = await dcDialog('confirm', `Delete ${isDir ? 'folder' : 'file'} '${entry.name}' from Digitakt +Drive?`);
    if (confirm) {
        setLoadingText('Deleting item');
        try {
            await deleteEntry(entry);
            showToastMessage(`Deleted '${entry.name}'`);
        } catch (err) {
            showToastMessage(`Delete failed: ${err.message}`);
        } finally {
            setLoadingText('');
            renderDtBrowser();
        }
    }
}

export async function deleteSelected() {
    const paths = Array.from(selectedEntries);
    if (paths.length === 0) return;
    const confirm = await dcDialog('confirm', `Delete ${paths.length} selected item(s) from Digitakt?`);
    if (!confirm) return;

    setLoadingText(`Deleting ${paths.length} items`);
    try {
        for (const p of paths) {
            const entry = dirEntries.find(e => e.fullPath === p);
            if (entry && !entry.locked && !entry.isFactory && !entry.isIncoming && !entry.isRecorded) {
                await deleteEntry(entry);
            }
        }
        selectedEntries.clear();
        showToastMessage('Selected items deleted.');
    } catch (err) {
        showToastMessage(`Error deleting: ${err.message}`);
    } finally {
        setLoadingText('');
        await refreshDirectory();
        renderDtBrowser();
    }
}

export function cancelTransfer() {
    transferProgress.cancel = true;
}

export async function downloadSingleFileByIndex(idx) {
    const entry = dirEntries[idx];
    if (!entry || entry.type === 'd') return;

    transferProgress = {
        active: true,
        title: `Downloading '${entry.name}'`,
        progress: 0,
        cancel: false
    };
    renderDtBrowser();

    try {
        const { file } = await downloadFile(entry, (pct) => {
            transferProgress.progress = pct;
            renderDtBrowser();
        });

        if (consumeFileInputFn) {
            await consumeFileInputFn({}, [file]);
            showToastMessage(`Imported '${entry.name}' into DigiChain.`);
        }
    } catch (err) {
        console.error(err);
        showToastMessage(`Download failed: ${err.message}`);
    } finally {
        transferProgress.active = false;
        renderDtBrowser();
    }
}

export async function downloadSelectedToDigichain() {
    const paths = Array.from(selectedEntries);
    const entries = dirEntries.filter(e => paths.includes(e.fullPath) && e.type !== 'd');
    if (entries.length === 0) return;

    transferProgress = {
        active: true,
        title: `Downloading 0 / ${entries.length}`,
        progress: 0,
        cancel: false
    };
    renderDtBrowser();

    const downloadedFiles = [];
    try {
        for (let i = 0; i < entries.length; i++) {
            if (transferProgress.cancel) break;
            const entry = entries[i];
            transferProgress.title = `Downloading (${i + 1}/${entries.length}): ${entry.name}`;
            transferProgress.progress = i / entries.length;
            renderDtBrowser();

            const { file } = await downloadFile(entry, (pct) => {
                transferProgress.progress = (i + pct) / entries.length;
                renderDtBrowser();
            });
            downloadedFiles.push(file);
        }

        if (downloadedFiles.length > 0 && consumeFileInputFn) {
            await consumeFileInputFn({}, downloadedFiles);
            showToastMessage(`Imported ${downloadedFiles.length} samples into DigiChain.`);
        }
    } catch (err) {
        showToastMessage(`Download error: ${err.message}`);
    } finally {
        transferProgress.active = false;
        renderDtBrowser();
    }
}

export async function uploadSelectedFromDigichain() {
    if (!getFilesFn) return;
    if (currentPath.toLowerCase().startsWith('/factory')) {
        showToastMessage('Cannot upload to the Factory directory.');
        return;
    }

    const allFiles = getFilesFn();
    const selected = allFiles.filter(f => f.meta.checked);
    const filesToUpload = selected.length > 0 ? selected : (allFiles.length > 0 ? allFiles : []);

    if (filesToUpload.length === 0) {
        showToastMessage('No samples selected in DigiChain.');
        return;
    }

    transferProgress = {
        active: true,
        title: `Uploading 0 / ${filesToUpload.length}`,
        progress: 0,
        cancel: false
    };
    renderDtBrowser();

    try {
        for (let i = 0; i < filesToUpload.length; i++) {
            if (transferProgress.cancel) break;
            const item = filesToUpload[i];
            const sampleName = item.meta.name || item.file?.name || `sample_${i + 1}`;

            transferProgress.title = `Uploading (${i + 1}/${filesToUpload.length}): ${sampleName}`;
            transferProgress.progress = i / filesToUpload.length;
            renderDtBrowser();

            await uploadAudio(item, sampleName, (pct) => {
                transferProgress.progress = (i + pct) / filesToUpload.length;
                renderDtBrowser();
            });
        }
        showToastMessage(`Uploaded ${filesToUpload.length} sample(s) to ${currentPath}.`);
    } catch (err) {
        showToastMessage(`Upload error: ${err.message}`);
    } finally {
        transferProgress.active = false;
        await refreshDirectory();
        renderDtBrowser();
    }
}

export function updateSendCount(count) {
    const sendBtn = document.getElementById('dtSendBtn');
    if (!sendBtn) return;
    const n = count !== undefined ? count : (getFilesFn ? getFilesFn().filter(f => f.meta.checked).length : 0);
    sendBtn.textContent = `Send to DT (${n || 0})`;
    if (n > 0) {
        sendBtn.classList.remove('disabled');
    } else {
        sendBtn.classList.add('disabled');
    }
}

export async function handleDrop(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!connectedDevice) {
        showToastMessage('Digitakt is not connected. Please connect first.');
        return;
    }

    if (currentPath.toLowerCase().startsWith('/factory')) {
        showToastMessage('Cannot upload files to the Factory directory.');
        return;
    }

    // Capture files synchronously from dataTransfer
    const dt = event?.dataTransfer;
    const rawFiles = dt?.files ? Array.from(dt.files) : [];
    if (!rawFiles || rawFiles.length === 0) {
        return;
    }

    const audioFiles = rawFiles.filter(f => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        return ['wav', 'aif', 'aiff', 'flac', 'mp3', 'ogg'].includes(ext);
    });

    if (audioFiles.length === 0) {
        showToastMessage('No supported audio files dropped.');
        return;
    }

    transferProgress = {
        active: true,
        title: `Uploading 0 / ${audioFiles.length}`,
        progress: 0,
        cancel: false
    };
    renderDtBrowser();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        for (let i = 0; i < audioFiles.length; i++) {
            if (transferProgress.cancel) break;
            const file = audioFiles[i];
            transferProgress.title = `Uploading (${i + 1}/${audioFiles.length}): ${file.name}`;
            transferProgress.progress = i / audioFiles.length;
            renderDtBrowser();

            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

            await uploadAudio({ buffer: audioBuffer, meta: { name: file.name } }, file.name, (pct) => {
                transferProgress.progress = (i + pct) / audioFiles.length;
                renderDtBrowser();
            });
        }
        showToastMessage(`Uploaded ${audioFiles.length} file(s) to ${currentPath}.`);
    } catch (err) {
        console.error('Drop upload error:', err);
        showToastMessage(`Upload error: ${err.message}`);
    } finally {
        try {
            await audioCtx.close();
        } catch (e) {}
        transferProgress.active = false;
        await refreshDirectory();
        renderDtBrowser();
    }
}

// UI Rendering
export function initDigitaktUI(consumeFileInput, getFiles) {
    consumeFileInputFn = consumeFileInput;
    getFilesFn = getFiles;

    const toggleBtn = document.getElementById('toggleDtBrowserBtn');
    if (toggleBtn) {
        if (!isSupported()) {
            toggleBtn.classList.add('no-display');
            toggleBtn.title = 'WebMIDI is not supported by your browser.';
        } else {
            toggleBtn.classList.remove('no-display');
        }
    }
}

export async function toggleDtBrowser(forceState) {
    if (!dtBrowserPanelEl) return;
    const isShown = dtBrowserPanelEl.classList.contains('show');
    const shouldShow = forceState !== undefined ? forceState : !isShown;

    if (shouldShow) {
        dtBrowserPanelEl.classList.add('show');
        if (rightButtonsEl) rightButtonsEl.classList.add('fade');
        renderDtBrowser();

        if (!midiAccess) {
            try {
                await requestMidi();
                renderDtBrowser();
                if (selectedInPort && selectedOutPort && !connectedDevice) {
                    await connect();
                }
            } catch (e) {
                renderDtBrowser();
            }
        }
    } else {
        dtBrowserPanelEl.classList.remove('show');
        if (rightButtonsEl && !document.querySelector('#opExportPanel.show')) {
            rightButtonsEl.classList.remove('fade');
        }
    }
}

export function renderDtBrowser() {
    if (!dtBrowserContentEl) return;

    if (!isSupported()) {
        dtBrowserContentEl.innerHTML = `
            <div class="dt-browser-container">
                <div class="dt-browser-header">
                    <h4>Digitakt Transfer</h4>
                </div>
                <div class="dt-browser-empty">
                    <p>WebMIDI / WebUSB is not supported in this browser environment.</p>
                    <p style="opacity: 0.7;">Please use Google Chrome, Edge, Brave, Opera, or the desktop app.</p>
                </div>
            </div>
        `;
        return;
    }

    const inputs = getInputs();
    const outputs = getOutputs();
    const isConnected = !!connectedDevice;
    const dev = connectedDevice;

    let html = `
        <div class="dt-browser-container">
            <div class="dt-browser-header">
                <h4>
                    <span class="dt-badge ${isConnected ? 'connected' : 'disconnected'}">
                    </span>
                    <span>Digitakt Transfer</span>
                </h4>
            </div>

            <div class="dt-connection-section">
                <div class="dt-port-selectors">
                    <div class="dt-port-field">
                        <label for="dtMidiIn">MIDI In</label>
                        <select id="dtMidiIn" onchange="digichain.digitakt.selectInPort(this.value)">
                            <option value="">-- Select Input --</option>
                            ${inputs.map(p => `<option value="${p.id}" ${p.id === inPortId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="dt-port-field">
                        <label for="dtMidiOut">MIDI Out</label>
                        <select id="dtMidiOut" onchange="digichain.digitakt.selectOutPort(this.value)">
                            <option value="">-- Select Output --</option>
                            ${outputs.map(p => `<option value="${p.id}" ${p.id === outPortId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="dt-connection-actions">
                    ${!isConnected ? `
                        <button class="button" onclick="digichain.digitakt.connect()">Connect</button>
                        <button class="button button-outline" onclick="digichain.digitakt.scanPorts()"><i class="gg-sync"></i> Scan</button>
                    ` : `
                        <button class="button button-outline" onclick="digichain.digitakt.disconnect()">Disconnect</button>
                        <button class="button button-outline" onclick="digichain.digitakt.refreshDir()"><i class="gg-sync"></i> Refresh</button>
                    `}
                    ${isConnected ? `
                    <div class="dt-device-info">
                        <strong>${escapeHtml(dev.deviceName)}</strong> • OS ${escapeHtml(dev.version)} (build ${escapeHtml(dev.build)})
                    </div>
                ` : ''}
                </div>
            </div>
    `;

    if (transferProgress.active) {
        const pct = Math.round(transferProgress.progress * 100);
        html += `
            <div class="dt-progress-overlay">
                <div class="dt-progress-title">${escapeHtml(transferProgress.title)}</div>
                <div class="dt-progress-bar-container">
                    <div class="dt-progress-bar-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="dt-progress-status">
                    <span>${pct}%</span>
                    <a onclick="digichain.digitakt.cancelTransfer()" class="dt-cancel-link">Cancel</a>
                </div>
            </div>
        `;
    }

    if (isConnected) {
        const parts = currentPath.split('/').filter(Boolean);
        let pathHtml = `<span class="dt-crumb ${parts.length === 0 ? 'active' : ''}" onclick="digichain.digitakt.changeDir('/')">Root</span>`;
        let acc = '';
        for (let i = 0; i < parts.length; i++) {
            acc += '/' + parts[i];
            const pTarget = acc;
            const isLast = i === parts.length - 1;
            pathHtml += ` <span class="dt-crumb-sep">/</span> <span class="dt-crumb ${isLast ? 'active' : ''}" onclick="digichain.digitakt.changeDir('${escapeJs(pTarget)}')">${escapeHtml(parts[i])}</span>`;
        }

        const selectedCount = selectedEntries.size;
        const digichainSelectedCount = getFilesFn ? getFilesFn().filter(f => f.meta.checked).length : 0;
        const canGoBack = navHistoryIndex > 0;
        const canGoForward = navHistoryIndex < navHistory.length - 1;
        const isNotRoot = currentPath !== '/';

        html += `

            <div class="dt-action-strip">
                <div class="dt-btn-grp">               
                    <button id="dtSendBtn" class="button ${digichainSelectedCount > 0 ? '' : 'disabled'}" onclick="digichain.digitakt.uploadSelectedFromDigichain()" title="Upload selected samples from DigiChain list to ${escapeHtml(currentPath)}">
                        Transfer ${digichainSelectedCount || 0}
                    </button>
                    <button class="button button-outline ${selectedCount > 0 ? '' : 'disabled'}" onclick="digichain.digitakt.downloadSelectedToDigichain()" title="Download checked files from DT into DigiChain list">
                        Copy to List ${selectedCount}
                    </button>
                </div> 
                <div class="dt-btn-grp">
                    <button class="button button-outline dt-btn-sm" onclick="digichain.digitakt.promptNewFolder()" title="Create New Folder in ${escapeHtml(currentPath)}">
                            + Folder
                    </button>
                    <button ${selectedCount > 0 ? '' : 'disabled="disabled"'} class="button button-clear remove ${selectedCount > 0 ? '' : 'disabled'}" onclick="digichain.digitakt.deleteSelected()" title="Delete checked items from +Drive">
                        <i class="gg-trash"></i>
                    </button>
                </div>   
            </div>

            <div class="dt-drop-zone"
                 ondragenter="event.preventDefault(); event.stopPropagation(); this.classList.add('drag-over');"
                 ondragover="event.preventDefault(); event.stopPropagation(); this.classList.add('drag-over'); event.dataTransfer.dropEffect = 'copy';"
                 ondragleave="event.preventDefault(); event.stopPropagation(); this.classList.remove('drag-over');"
                 ondrop="event.preventDefault(); event.stopPropagation(); this.classList.remove('drag-over'); digichain.digitakt.handleDrop(event)">
                <span>Drop audio files here to copy directly to <strong>${escapeHtml(currentPath)}</strong></span>
            </div>

            <div class="dt-breadcrumb-bar">
                <span class="dt-breadcrumb-label">Path:</span>
                <div class="dt-breadcrumb">${pathHtml}</div>
            </div>

            <div class="dt-file-list-container">
                <table class="dt-file-table">
                    <thead>
                        <tr>
                            <th style="width: 4.5rem;">
                                <button title="Toggle Select All" onpointerdown="event.stopPropagation(); digichain.digitakt.toggleSelectAll(this.classList.contains('button-outline'))" class="${selectedCount > 0 && selectedCount === dirEntries.length ? '' : 'button-outline'} check toggle-check">&nbsp;</button>
                            </th>
                            <th><a>Filename</a></th>
                            <th style="text-align: right;"><a>Actions</a></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${isNotRoot ? `
                            <tr class="dt-row is-parent-dir" onclick="digichain.digitakt.navUp()" title="Go to parent directory">
                                <td colspan="3" class="dt-name-td">
                                    <span class="dt-entry-name is-parent">
                                        <span><strong>..</strong> <span style="opacity: 0.6; font-size: 1.1rem; margin-left: 0.4rem;">(Parent Folder)</span></span>
                                    </span>
                                </td>
                            </tr>
                        ` : ''}
                        ${dirEntries.length === 0 ? `
                            <tr><td colspan="4" style="text-align: center; opacity: 0.5; padding: 2.5rem 1rem;">This folder is empty.<br><small style="opacity: 0.8;">Drop audio files or create subfolders above.</small></td></tr>
                        ` : dirEntries.map((entry, idx) => {
                            const isChecked = selectedEntries.has(entry.fullPath);
                            const isDir = entry.type === 'd';
                            const sizeStr = isDir ? '' : formatBytes(entry.size);
                            const isFactory = entry.isFactory;
                            const isIncoming = entry.isIncoming;
                            const isRecorded = entry.isRecorded;

                            return `
                                <tr class="dt-row ${isDir ? 'is-dir' : 'is-file'} ${isChecked ? 'selected checked' : ''} ${isFactory ? 'is-factory-dir' : ''}"
                                    data-index="${idx}"
                                    onclick="${!isFactory && isDir ? `digichain.digitakt.openEntryByIndex(${idx})` : ''}">
                                    <td onclick="event.stopPropagation()">
                                        <button onpointerdown="event.stopPropagation(); digichain.digitakt.toggleSelectEntryByIndex(${idx}, this.classList.contains('button-outline'))"
                                                class="${isChecked ? '' : 'button-outline'} check toggle-check"
                                                ${(entry.locked || isFactory || isIncoming || isRecorded) ? 'disabled="disabled"' : ''}>&nbsp;</button>
                                    </td>
                                    <td class="dt-name-td">
                                        <span class="dt-entry-name ${isFactory ? 'is-factory' : ''}"
                                              title="${isFactory ? 'Factory folder (Protected)' : escapeHtml(entry.name)}"
                                              onclick="${!isDir ? `event.stopPropagation(); digichain.digitakt.downloadSingleFileByIndex(${idx})` : ''}">
                                            <span class="dt-name-text">${escapeHtml(entry.name)}</span>
                                            ${isFactory ? '<small class="dt-system-tag">Locked</small>' : '<small style="text-align: right; opacity: 0.7; font-size: 0.9rem;">' + sizeStr + '</small>'}
                                        </span>
                                    </td>
                                 
                                    <td style="text-align: right;" onclick="event.stopPropagation()">
                                        ${!isDir ? `
                                            <a title="Import to DigiChain" class="dt-action-icon" onclick="digichain.digitakt.downloadSingleFileByIndex(${idx})"><i class="gg-file-add"></i></a>
                                        ` : ''}
                                        ${(!entry.locked && !isFactory && !isIncoming && !isRecorded) ? `
                                            <a title="Rename" class="dt-action-icon" onclick="digichain.digitakt.promptRenameByIndex(${idx})"><i class="gg-pen"></i></a>
                                            <a title="Delete" class="dt-action-icon remove" onclick="digichain.digitakt.promptDeleteByIndex(${idx})"><i class="gg-trash"></i></a>
                                        ` : ''}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    dtBrowserContentEl.innerHTML = html;
}

// Controller Object Exported for Window.digichain.digitakt
export const dtController = {
    scanPorts,
    selectInPort,
    selectOutPort,
    connect,
    disconnect,
    changeDir,
    navBack,
    navForward,
    navUp,
    openEntryByIndex,
    refreshDir,
    promptNewFolder,
    toggleSelectEntryByIndex,
    toggleSelectAll,
    promptRenameByIndex,
    promptDeleteByIndex,
    deleteSelected,
    cancelTransfer,
    downloadSingleFileByIndex,
    downloadSelectedToDigichain,
    uploadSelectedFromDigichain,
    handleDrop,
    updateSendCount
};
