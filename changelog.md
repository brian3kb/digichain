 - Convert chains between evenly spaced and unspaced chains from the slice panel. Works with DC, Octatrack, and OP-x slice data. When converted to a spaced chain, if the grid-size is set to a value, the new chain will be padded to this number.
 - Ctrl+Click to preview slices before slicing a sample.

2023-07-27 1.4.5
 - Improved the note from filename detection and sorting.
 - 44.1/48K 8bit mono/stereo file exports.
 - Crush selected actions action to add some crush/distortion to the sample.
 - Pitch up/down in cents in sample editor panel. (click the 'Pitch (semi-tones)' link to toggle between semi-tones and cents.)

2023-07-16 1.4.4
 - Minimizes reported click/pops on exported chains when importing wav files of differing sample rate to the target sample rate, or when using audio interfaces configured with small sample buffers. On by default at a 40% threshold, user configurable thresholds and can be disabled via settings panel.
 - Resolves issue where running in the Brave browser caused an unexpected error modifying an existing audio array buffer.
 - Added fuzz selected actions action to add fuzz/noise into the selected samples.
 - Added fade-in fade-out selected actions to fade in/out the first/last 256 samples of each selected sample.
 - Blend panel to blend/interpolate between the selected samples (works best when the samples are similar in duration).

2023-07-02 1.4.3
 - Added a ping-pong selected actions action to add a reversed copy of the sample to the end of the sample.
 - Fixed issue where generated AIF files did not load slice data accurately into the new TE drum utility tool.

2023-06-01 1.4.2
 - Hold shift key while dragging in samples to import randomly up to the currently chosen grid-size.
 - Default to limit the number of imported samples to 750, to reduce risk of timeouts - can be disabled in the settings panel.
 - Limiting the max chain length to 64 slices when using the timed chain length in non-aif audio context, Aif context stays at max 24 slices.
 - Setting the default Shift import random drop value to 256 if no slice grid value is selected (this prevents accidental import of large numbers of files, Ctrl+click a slice-grid number and set a custom value to import more than 256 samples randomly).
 - Ctrl + Click on the Selected header text will toggle all the samples selection to all selected / all de-selected.
 - Changed load files to an icon.
 - Expanded width of the audio config selection.
 - Updated the drop-zone style when list is empty.
 - Added content-visibility to list body.

2023-05-22 1.4.1
- Added truncate selected action (shift+click to set a custom length), and crop to selection in the editor panel.
- Fixed bug playing back sample after editing in the edit panel if the sample was currently playing from the list.
- Changed start/end point editor selection.
- Changed zoom levels to +/- buttons to zoom in further than 4x.
- Fixed bug where grid keyboard shortcuts were still active on edit panel.

2023-05-15 1.4.0
- Workflow to support reading slices from and creating chains for the Teenage Engineering OP-1 Field / OP-Z
    - OP-1 / OP-1 Field / OP-Z aif file imports, mono and stereo.
    - Slice from OP-1 / OP-1 Field / OP-Z drum-kit aif files.
    - OP-1 Field and OP-Z drum kit and single file exports with the aif 44.1/16 mono/stereo options.
    - OP-1 Field L/R A/B toggle and value setting from the list when in 44.1/16 Stereo Aif context. (double-click to toggle).
    - Slice from tape.json (OP-1 Field tape file slice markers) in the slice panel.
    - Merge All Selected action - mixes down all the selected items into one sample (enables creating files with different samples on the L/R for use with OP-1 Field's A/B drum kit option.

- Automatic creation of Octatrack .ot meta files in 44.1 16/24 stereo non-aif audio contexts. (toggle in settings).

- Audio editor panel overhaul.
    - Added 1x, 2x, 4x zoom levels for the waveform.
    - Added loop playback button to editor panel.
    - Fade in/out/silence tools.

- UI Improvements
    - Added playback indicator icon and play-head marker to waveforms in the list view.
    - Shift+Click on the row sample select box will select all the samples in-between (inclusive of the highlighted and the clicked sample). Ctrl+Shift+Click will de-select.
    - Shift+Click Column Header : Sorts the list, but will keep the selected items grouped to the top of the list.
    - Shift+Click Reset Button : Randomizes the order of the list.
    - Numeric keys 1 - 0 play the first 10 selected samples from the list.
    - Alt + numeric key / P key stops the playback and looping of that single sample.
    - Showing the sample name from DC slice data in title of slices on slice panel.
    - Double-click to remove a slice before processing slices on the slice panel.
    - Ctrl+Click the slice sample row icon to clear any related sample slice data.
    - E key opens the edit panel for the currently highlighted sample. Shift+E opens the editor panel for the currently highlighted sample, with the file name and path inputs editable, and the filename input keyboard focused.
    - Basic note detection from filename for sorting the list.
    - Reworked layout for better rendering on smaller screen devices.
    - Added a light theme for users who don't like dark themes, toggled in the settings panel (first launch will set from the devices system color preference).
    - Custom filenames panel, add a list of custom filenames to use - once all names have been used, DigiChain will fall back to the default naming convention.

- Settings on the settings panel are saved to local-storage and will persist when the app re-opens.
    - Allow disabling slice embed in settings.
    - Option to play pop-markers at the start and end of the sample for direct sampling to the Digitakt audio inputs. Two options, 0db markers (which prevents the DT's auto normalization from changing the recorded sample volume), and peak, which sets the pop-marker volumes to match the loudest peak in the sample.
    - Show/hide touch modifier buttons in options panel.
    - Restore last used sample rate/bit depth/channel selection in options.
    - Option to normalize text/waveform color contrast in the settings panel.

- DC slice format embedded in output chain wav file so user can restore the chains to slices retaining the input filename.
- Support for importing webm and m4a audio files.
- Added 'Difference (Side)' stereo -> mono processing option.
- Trim All Selected action.
- Reverse All Selected action.
- Normalize All Selected action.
- Pitch Up by an Octave All Selected action.
- Enabled 32bit float wav exports.
- Allow importing of 16bit aif files (parser written to accomodate importing from TE devices, but should be ok on other exported aif files, testing with Ableton Live exports and worked as expected, ymmv).
- Split chained files at 12s (mono) or 20s (stereo) lengths mode. Sample order will loosely follow the list order, but it will try to fit smaller samples into the chain up to the max limit from further down the selected items in the list, so some samples may be out of order depending on their length and where they could be slotted into each chain to use up the time in the best way possible.
- Removing arraybuffers before removal of files to help free memory usage sooner.
- Ctrl+Click on the max length per chain in seconds to set a custom limit.

- Bugfixes
    - Fixed bug where file path changes were not persisted.
    - Prevent pitch-up crashing when doubling a very small audio buffer.
    - Checking for suspended audio-context and resuming if suspended before playback.
    - Checking audio context state before importing files, resuming if possible.
    - Fixed bug where joining chains together with single additional sample between caused the slice offsets to be incorrect.
    - Removing multiple and sorts will stop sample playback (audioCtx caused pops when in these situations previously).
    - Fixed bug where a non-standard wav file PAD chunk caused a page crash.
    - Adding a _n char/number to the end of duplicated files name (as exporting to zip overwrites same filename files).
      Importing the same file will also increment the filename.
    - Fixed bug where resampling a new chain with a global pitch modifier and embed slices disabled would cause the new pitched audio buffer to fail rendering.
    - Fixed bug in the reading of AIFC aif files.
    - Don't mute samples when toggling selection.

2023-04-07 1.3.1
 - Fixed bug where a duplicate sample shared the sources audio-buffer in specific situations (e.g. when reversing the sample.)
 - Simplified the transient detection method, enabled it for longer sample lengths as this approach is better suited to longer samples.
 - Trim right is more aggressive with what it trims (to 0.003 amplitude).

2023-04-05 1.3.0
- Importing of folders - recursive search for wav/syx files (be careful with filesize/depth of folders with this!).
- OT slices import from accompanying .ot file.
- Show source folder path on list, filenames will now include this path in their name if present - joined files with have the path of the first item in the chain in its name.
- Moved the UI around again, added ability to hide the top buttons panel.
- Multi-file/joined downloads will now be downloaded as a single zip file (can be put back to multi-single file prompts in the settings panel).
- Grid-view mode for those who dislike tables. (Shift+G)
- Swapped Shift/Ctrl coloring, added css transition on toggle.
- Added slice-count to end of chain filenames.
- Changed 'sort by selected icon' to a text value.
- Added sort by slice# to make building mega-break chains easier.
- Indicator on row/grid of end of joined chain based on slice-grid selection.
- Waveform and slice marker visual preview before slicing a file from the list into new samples.
- Basic transient detection on the slice grid panel (for samples less than ~128 seconds).
- Edit panel with file name/path editing, waveform view, play/stop controls.
- Normalize, trim right, reverse, half-speed, and double-speed (destructive) sample edit operations.
- Allow dropping of wav url links to be fetched (works with domains that allow CORS).
- Export settings panel with pitch up export setting (1, 2, or 3 octaves), and the zip file on/off toggle.
- Added offline support and install as app from the browser.

2023-03-27 1.2.0 
- Added support for slicing files in the list into new items.
- Added ability to resample joined files back into the list instead of downloading.
- Sample import times are about a third faster than previously.
- Support for drag drop reordering of the list.
- Show selected/total length times in the length header.
- Added a bunch more keyboard shortcuts.
- Allow changes to stereo/mono and bit-depth, as it's only the sample-rate that makes things wonky. [Only sample rate changes will trigger the list to clear.]
- Show selected/total length times in the length header.
- Fixed waveform double first render bug.
- Tweaked height of waveform views.
- Fixed bug in sorting selected by items.
- Keyboard commands for managing the list (see keyboard-shortcuts.md).
- Shift / Ctrl lock buttons so mobile/tablet users can access the secondary (keyboard shortcut) functions.

2023-03-25 1.1.0
- Support for outputting stereo files.
- Support for 24 bit file exports.
- Now supports drag-drop sample importing.
- Add Shift+click function to set the stereo->mono method for all selected stereo samples in the list.
- Fixed an issue where setting a custom slice grid value did not persist.
- Allows custom slice values to be set with the Ctrl+Click keyboard shortcut.
- Export options beyond 48k/16bit - this setting is per session, changing will remove all entries from the list.

2023-03-24 1.0.2
- When a slice grid length is selected, samples will now be auto-generated, (e.g. if you have 13 samples selected and a grid of 4, you will get 4 files downloaded instead of one chain of 13 samples [which isn't ideal for the Digitakt!]).
- Shift+click the slice-grid numbers to change the grid size, but retain the selected samples.
- Added loading message while loading in files.
- Added sort-by selected.
- Changed button text, added joined file counts that will be produced, and a number of files that will be downloaded if downloading all.
- More tweaks for mobile device use.
- Fixed an issue where a looping sample would keep playing after removal.

2023-03-23 1.0.1
- Sorting error on length sort.
- Re-order button glitching.
- Shift+Up/Down, Shift+Duplicate error.
- Waveform display on Android.
- Show version number on bottom of screen.
- Shift+click on waveform will loop the files playback (de-select will stop loop, click will go back to one-shot, Off in slice grid will stop all sample playback).
- Added support for 128 slices (e.g. for wavetables or Model:Samples use on start point).
- Cleaned up UI for mobile, moved around buttons to make use of the space better.

2023-03-22 1.0.0
-  Load .wav files (stereo or mono).
-  Load .syx sds dumps (e.g. from the MD, or MD Elektron sample packs), support only for 44.1khz/16bit dumps.
- Samples can be previewed by clicking the mini-waveform.
- Processed file to 48khz/16bit download via clicking the sample name.
- Stereo input files are processed to mono, choice of the Left, Right, or sum of both channels via 'L S R' options.
- Individual files can be downloaded, or all the selected with the Download button, this will prompt to save each file individually.
- Download Joined will process all the selected files into one wav file.
- Download Joined (Spaced) will process all the selected files, and pad all shorter duration samples with silence to match the duration of the longest file in the selection.
- When the slice grid has an option other than Off selected, the last selected sample will repeat to fill to the chosen grid size (known bug, choosing more than the slice-grid number will result in a join with too many samples, this will be resolved shortly).
- Samples can be moved up or down in the list.
- Preview the sample by clicking on the mini-waveform.
- Duplicate the sample in the list to repeat it (or have versions from the LSR channel selection).
- Remove the sample from the list by double-clicking the trash icon.
- Use the Remove Selected button to remove all selected from the list.
- Sort by filename or duration.
- Reset Sort Order button resets the list to the order in which the files were loaded.
