/**
 * WebMIDI API Polyfill for Tauri on iOS
 * Bridges W3C Web MIDI API to a custom Swift Tauri WebMIDI plugin.
 */

function getTauriInvoke() {
    if (typeof window !== 'undefined' && window.__TAURI__) {
        if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
            return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
        }
        if (typeof window.__TAURI__.invoke === 'function') {
            return window.__TAURI__.invoke.bind(window.__TAURI__);
        }
    }
    return null;
}

function getTauriListen() {
    if (typeof window !== 'undefined' && window.__TAURI__) {
        if (window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
            return window.__TAURI__.event.listen.bind(window.__TAURI__.event);
        }
    }
    return null;
}

export class TauriMIDIMessageEvent extends Event {
    constructor(type, eventInitDict) {
        super(type);
        this.data = eventInitDict.data;
        this.receivedTime = eventInitDict.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
    }
}

export class TauriMIDIConnectionEvent extends Event {
    constructor(type, eventInitDict) {
        super(type);
        this.port = eventInitDict.port;
    }
}

export class TauriMIDIPort extends EventTarget {
    constructor(info) {
        super();
        this.id = String(info.id);
        this.name = info.name || 'MIDI Port';
        this.manufacturer = info.manufacturer || '';
        this.version = info.version || '';
        this.state = info.state || 'connected';
        this.connection = 'closed';
        this.onstatechange = null;
    }

    _emitStateChange() {
        const event = new TauriMIDIConnectionEvent('statechange', { port: this });
        if (typeof this.onstatechange === 'function') {
            this.onstatechange(event);
        }
        this.dispatchEvent(event);
    }
}

export class TauriMIDIInput extends TauriMIDIPort {
    constructor(info) {
        super(info);
        this.type = 'input';
        this.onmidimessage = null;
    }

    async open() {
        const invoke = getTauriInvoke();
        if (!invoke) return this;
        this.connection = 'pending';
        try {
            await invoke('plugin:webmidi|open_input', {
                payload: { portId: this.id }
            });
            this.connection = 'open';
            this._emitStateChange();
            return this;
        } catch (err) {
            this.connection = 'closed';
            this._emitStateChange();
            throw err;
        }
    }

    async close() {
        const invoke = getTauriInvoke();
        if (invoke) {
            try {
                await invoke('plugin:webmidi|close_input', {
                    payload: { portId: this.id }
                });
            } catch (_) {}
        }
        this.connection = 'closed';
        this._emitStateChange();
        return this;
    }

    _dispatchMessage(bytes, timeStamp) {
        const event = new TauriMIDIMessageEvent('midimessage', { data: bytes, timeStamp });
        if (typeof this.onmidimessage === 'function') {
            this.onmidimessage(event);
        }
        this.dispatchEvent(event);
    }
}

export class TauriMIDIOutput extends TauriMIDIPort {
    constructor(info) {
        super(info);
        this.type = 'output';
    }

    async open() {
        const invoke = getTauriInvoke();
        if (!invoke) return this;
        this.connection = 'pending';
        try {
            await invoke('plugin:webmidi|open_output', {
                payload: { portId: this.id }
            });
            this.connection = 'open';
            this._emitStateChange();
            return this;
        } catch (err) {
            this.connection = 'closed';
            this._emitStateChange();
            throw err;
        }
    }

    async close() {
        const invoke = getTauriInvoke();
        if (invoke) {
            try {
                await invoke('plugin:webmidi|close_output', {
                    payload: { portId: this.id }
                });
            } catch (_) {}
        }
        this.connection = 'closed';
        this._emitStateChange();
        return this;
    }

    send(data, timestamp) {
        const invoke = getTauriInvoke();
        if (!invoke) return;
        const bytes = data instanceof Uint8Array ? Array.from(data) : Array.from(data || []);
        invoke('plugin:webmidi|send', {
            payload: {
                portId: this.id,
                data: bytes,
                timestamp
            }
        }).catch((err) => {
            console.error(`[WebMIDI] Failed to send MIDI data to output ${this.id}:`, err);
        });
    }

    clear() {}
}

export class TauriMIDIAccess extends EventTarget {
    constructor(initialData) {
        super();
        this.inputs = new Map();
        this.outputs = new Map();
        this.sysexEnabled = initialData ? initialData.sysex : true;
        this.onstatechange = null;
        this.unlistenMessage = null;
        this.unlistenState = null;

        if (initialData) {
            this.updatePorts(initialData.inputs || [], initialData.outputs || []);
        }
        this.setupListeners();
    }

    updatePorts(inputs, outputs) {
        const currentInIds = new Set(inputs.map(p => String(p.id)));
        for (const [id, port] of this.inputs.entries()) {
            if (!currentInIds.has(id)) {
                port.state = 'disconnected';
                this._dispatchStateChange(port);
            }
        }
        for (const info of inputs) {
            const id = String(info.id);
            let port = this.inputs.get(id);
            if (!port) {
                port = new TauriMIDIInput(info);
                this.inputs.set(id, port);
                port.open().catch(() => {});
                this._dispatchStateChange(port);
            } else {
                port.state = 'connected';
            }
        }

        const currentOutIds = new Set(outputs.map(p => String(p.id)));
        for (const [id, port] of this.outputs.entries()) {
            if (!currentOutIds.has(id)) {
                port.state = 'disconnected';
                this._dispatchStateChange(port);
            }
        }
        for (const info of outputs) {
            const id = String(info.id);
            let port = this.outputs.get(id);
            if (!port) {
                port = new TauriMIDIOutput(info);
                this.outputs.set(id, port);
                this._dispatchStateChange(port);
            } else {
                port.state = 'connected';
            }
        }
    }

    async setupListeners() {
        const listen = getTauriListen();
        if (!listen) return;

        try {
            this.unlistenMessage = await listen('webmidi:message', (event) => {
                const payload = event.payload || {};
                const portId = String(payload.portId || '');
                const data = payload.data || [];
                const timestamp = payload.timestamp || performance.now();

                const inputPort = this.inputs.get(portId) || this.inputs.values().next().value;
                if (inputPort) {
                    inputPort._dispatchMessage(new Uint8Array(data), timestamp);
                }
            });

            this.unlistenState = await listen('webmidi:statechange', (event) => {
                const payload = event.payload || {};
                this.updatePorts(payload.inputs || [], payload.outputs || []);
            });
        } catch (err) {
            console.error('[WebMIDI] Failed to setup event listeners:', err);
        }
    }

    _dispatchStateChange(port) {
        const event = new TauriMIDIConnectionEvent('statechange', { port });
        if (typeof this.onstatechange === 'function') {
            this.onstatechange(event);
        }
        this.dispatchEvent(event);
    }
}

export async function requestMIDIAccess(options = {}) {
    const invoke = getTauriInvoke();
    if (!invoke) {
        throw new Error('Tauri API is not available.');
    }
    const sysex = options.sysex ?? true;
    const accessData = await invoke('plugin:webmidi|request_access', {
        payload: { sysex }
    });
    return new TauriMIDIAccess(accessData);
}

export function installPolyfillIfNeeded() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    if (!navigator.requestMIDIAccess && window.__TAURI__) {
        navigator.requestMIDIAccess = requestMIDIAccess;
        console.log('[WebMIDI] Installed Tauri WebMIDI polyfill on navigator.requestMIDIAccess');
    }
}

// Auto-install when loaded in Tauri environment
if (typeof window !== 'undefined') {
    if (window.__TAURI__) {
        installPolyfillIfNeeded();
    } else {
        window.addEventListener('DOMContentLoaded', installPolyfillIfNeeded);
    }
}
