**DigiChain**

DigiChain is a web app made to make the creation of sample chains as easy as possible for use on the Digitakt (and any other sampler that can slice up samples).

While originally created as a tool to help make evenly spaced sample chains to use on the Elektron Digitakt’s slice grid machine introduced in the 1.5 firmware update, DigiChain has grown to incorporate other features, many of which were suggested by the good folks over on the Elektronauts forum.

The primary function is being able to drop samples into the list, these can be folders containing samples (as all dropped folders are recursively parsed for sample data) – PCM wav files are what will be looked for, with the addition of support for .syx SysEx SDS audio midi dumps which are used in MachineDrum sample packs – these can be consumed and converted to standard wav files.

Once the files are in the list, they are ready to be ordered into chains, choose the chain length on the slice grid in the top left buttons group (shift+click to keep the selections already in the list) – the list will show a green line to indicate when a chain ends and a new one begins below.

Each sample can also be sliced into new samples, or edited with a selection of basic destructive sample edits – if you want to keep the original around, duplicate a sample before making edits.

Shift+clicking on either of the join buttons will resample back into the list rather than out to a file.

By default, the app will open in the 48k/16bit mono context – great for the Digitakt! – but if you want to create chains for other samplers, switch up the context, the 44.1k/24bit stereo is perfect for the Octatrack, if you have a bunch of samples and want to just convert them to what the OT expects, set the context, drop them in the list, hit the download button – you will get out a zip file containing all the processed files with their folder structure intact ready to drop on the OT’s CF card.

If you want to move a sample around before exporting, change its folder path value in the sample edit panel.

While it is a web app, once loaded, there is no connection required, and can be installed as an app on most OSs.

There is a full complement of keyboard shortcuts to help navigate through things quickly.

**Keyboard Shortcuts**
 
 - Up / Down Arrow Keys: when a sample row is highlighted, this changes the highlighted sample.
 - P : plays the currently highlighted sample in the list.
 - I : inverts the selected items in the list.
 - Escape : closes any open dialog windows and stops all sample playback.
 - Enter / Return : toggles the selection of the currently highlighted sample in the list.
 - L / S / R : changes the channel for stereo files being processed to mono.

**Shift + Click / Shift + Key**
 - Up / Down Keys : moves the highlighted sample up or down in the list.
 - P : plays the currently highlighted sample looped. 
 - Waveform View : plays the sample looped, click again to go back to one-shot.
 - Slice Grid Number & Off Buttons : changes the slice grid size, but keeps the selected samples in the list.
 - Duplicate Icon : puts the duplicated file at the end of the sample list.
 - Move Up Icon : moves directly to the top of the sample list.
 - Move Down Icon : moved directly to the end of the sample list.
 - L S R Options : sets all stereo samples method for mono conversion (take left, right, or sum to mono).
 - Download All : processed files will be have the imported folder structure flattened into their file names (all files will be at the root level of the zip file).
 - Joined / Joined Spaced : audio will be resampled internally back to the list instead of prompting to save as a file (clicking the filename in the list will still allow the wav download).
 - H : Toggles showing/hiding the top buttons panel, to give more space for the grid.
 - Slice Sample Options: Will put the slices in the list directly below the source sample. 
 - G : Toggles grid-view/list-view (grid-view is now the default for narrow screen width devices like phones).

**Ctrl + Click**
 - Slice Grid Number Buttons : prompts to enter a custom value for the slice grid.
 - Slice Grid Off Button : restores the default slice grid options.
