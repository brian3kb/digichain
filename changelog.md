1.4.0 latest
 - Audio editor panel overhaul.
 - Affect selection with click for start, right-click or shift+click for end point.
 - Fixed bug where file path changes were not persisted.
 - Added 1x, 2x, 4x zoom levels for edit panel waveform.
 - Shift+Click Column Header : Sorts the list, but will keep the selected items grouped to the top of the list.
 - Shift+Click Reset Button : Randomizes the order of the list.
 - Added 'Difference (Side)' stereo -> mono processing option.
 - Trim All Selected action.
 - Reverse All Selected action.
 - Merge All Selected action - mixes down all the selected items into one sample.
 - Enabled 32bit float wav exports.
 - Prevent pitch-up crashing when doubling a very small audio buffer.
 - Added support for loading 16bit 44.1k aif files (only those produced to the customized TE aif file formats).
 - Slice from OP-1/OP-Z/OP-1 Field drum-kit aif files.
 - Options to export as aif 44.1k/16bit mono or stereo files.
 - OP-1 Field and OP-Z exports with the Aif 44.1/16 mono/stereo option.
 - L/R A/B toggle and value setting from the list when in 44.1/16 Stereo Aif context. (double-click to toggle).
 - DC slice format embedded in output chain wav file so user can restore the chains to slices retaining the input filename.
 - Allow disabling slice embed in settings, as some devices do not like custom riff chunks in wav files.
 - Settings on the settings panel are saved to local-storage and will persist when the app re-opens.
 - Option to play pop-markers at the start and end of the sample for direct sampling to the Digitakt audio inputs. Two options, 0db markers (which prevents the DT's auto normalization from changing the recorded sample volume), and peak, which sets the pop-marker volumes to match the loudest peak in the sample.
 - Slice from tape.json (OP-1 Field tape file slice markers).
 - Show/hide touch modifier buttons in options panel.
 - Restore last used sample rate/bit depth/channel selection in options.
 - Added loop playback button to editor panel.
 - Checking for suspended audio-context and resuming if suspended before playback.
 - Split chained files at 12s (mono) or 20s (stereo) lengths mode. Sample order will loosely follow the list order, but it will try to fit smaller samples into the chain up to the max limit from further down the selected items in the list, so some samples may be out of order depending on their length and where they could be slotted into each chain to use up the time in the best way possible.
 - Ctrl+Click on the max length per chain in seconds to set a custom limit.
 - Fixed bug where joining chains together with single additional sample between caused the slice offsets to be incorrect.
 - Added playback indicator icon and play-head marker to waveforms in the list view.
 - Rough implementations of fade in/out/silence - can be a little odd on shorter selection.
 - Removing multiple and sorts will stop sample playback (audioCtx caused pops when in these situations previously).
 - Numeric keys 1 - 0 play the first 10 selected samples from the list.
 - Alt + numeric key / P key stops the playback and looping of that single sample.
 - Fixed bug where a non-standard wav file PAD chunk caused a page crash.

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
- Shift-click the slice-grid numbers to change the grid size, but retain the selected samples.
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
- Shift-click on waveform will loop the files playback (de-select will stop loop, click will go back to one-shot, Off in slice grid will stop all sample playback).
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
