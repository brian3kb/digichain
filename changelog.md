1.3.0
- Importing of folders - recursive search for wav/syx files (be careful with filesize/depth of folders with this!).
- OT slices import from accompanying .ot file.
- Show source folder path on list, filenames will now include this path in their name if present - joined files with have the path of the first item in the chain in its name.
- Moved the UI around again, added ability to hide the top buttons panel.
- Grid-view mode for those who dislike tables.
- Swapped Shift/Ctrl coloring, added css transition on toggle.
- Added slice-count to end of chain filenames.
- Changed 'sort by selected icon' to a text value.
- Fixed bug where a benign error would result when trying to select a grid-size larger than the number of samples loaded.
- Added sort by slice# to make building mega-break chains easier.
- Indicator on row/grid of end of joined chain based on slice-grid selection.
- Waveform and slice marker visual preview before slicing a file from the list into new samples.
- Edit panel with file name/path editing.

2023-03-27 1.2.0 
- Added support for slicing files in the list into new items.
- Added ability to resample joined files back into the list instead of downloading.
- Sample import times are about a third faster than previously.
- Support for drag drop reordering of the list.
- Show selected/total length times in the length header.
- Added a bunch more keyboard shortcuts.
- Allow changes to stereo/mono and bit depth, as it's only the sample-rate that makes things wonky. [Only sample rate changes will trigger the list to clear.]
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
