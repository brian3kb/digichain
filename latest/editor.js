import{audioBufferToWav,buildOpData,encodeAif}from"./resources.js";const editPanelEl=document.getElementById("editPanel"),editableItemsEl=document.getElementById("editableItems"),editEl=document.getElementById("editorPanelContent"),opExportPanelEl=document.getElementById("opExportPanel"),opExportEl=document.getElementById("opExportPanelContent"),rightButtonsEl=document.querySelector(".right-buttons"),views=["sample","slice","opExport"];let editing,conf,multiplier=1,selection={start:0,end:0,step:0},samples=[],folders=[];export function setEditorConf(options){conf=options}export function showEditor(data,options,view="sample",folderOptions=[]){if(conf=options,folders=folderOptions,"sample"===view)return editing=data,multiplier=1,selection.end=editing.buffer.length,selection.start=0,selection.step=Math.round(editing.buffer.length/(1024*multiplier)),renderEditableItems(),renderEditor(editing),updateSelectionEl(),editPanelEl.classList.add("show"),void renderEditPanelWaveform();"opExport"===view&&(samples=data,createOpData(),renderOpExport(),opExportPanelEl.classList.add("show"),rightButtonsEl.classList.add("fade"))}function createOpData(){samples.json=samples.json||buildOpData([],!0)}function renderKey(color,index){return`\n    <div class="op-key ${color} key-${index}"\n         ondragenter="this.classList.add('drag-over')"\n         ondragleave="this.classList.remove('drag-over')"\n         ondrop="this.classList.remove('drag-over')"\n         >\n        <div class="left-a"\n           ondragenter="this.classList.add('drag-over')"\n           ondragleave="this.classList.remove('drag-over')"\n           ondrop="this.classList.remove('drag-over')"\n        >L</div>     \n        <div class="right-b"\n           ondragenter="this.classList.add('drag-over')"\n           ondragleave="this.classList.remove('drag-over')"\n           ondrop="this.classList.remove('drag-over')"\n        >R</div>     \n    </div>   \n  `}function renderOpExport(){const keys={black:[1,3,5,8,10,13,15,17,20,22],white:[0,2,4,6,7,9,11,12,14,16,18,19,21,23]};opExportEl.innerHTML=`\n    <div>\n    <div class="op-keys row">\n            <div class="white-keys float-right">${keys.white.reduce(((a,i)=>a+renderKey("white",i)),"")}</div>\n        <div class="black-keys float-right">${keys.black.reduce(((a,i)=>a+renderKey("black",i)),"")}</div>\n    </div><br>\n      <div class="op-buttons row">\n        <button class="button float-right" onclick="digichain.editor.buildOpKit()">Build Kit</button>\n      </div>\n    </div>\n  `}function buildOpKit(){const linkEl=document.querySelector(".aif-link-hidden"),dataView=encodeAif(samples[0].buffer,samples.json);let blob=new window.Blob([dataView],{type:"audio/aiff"});linkEl.href=URL.createObjectURL(blob),linkEl.setAttribute("download","test-kit.aif"),linkEl.click()}export function renderEditor(item){editing=item===editing?editing:item,editEl.innerHTML='\n  <button onclick="digichain.playFile(event);" class="button-outline check">Play</button>\n  <button onclick="digichain.playFile({ editor: true }, false, true);" class="button-outline check">Loop</button>\n  <button onclick="digichain.stopPlayFile(event);" class="button-outline check">Stop</button>\n  <div class="zoom-level float-right">\n    <button class="zoom-1x button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', 1)">1x</button>\n    <button class="zoom-2x button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', 2)">2x</button>\n    <button class="zoom-4x button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', 4)">4x</button>\n  </div>\n  <div class="waveform-container">\n    <div>\n      <canvas class="edit-panel-waveform"\n        oncontextmenu="return false;"\n        onclick="digichain.editor.changeSelectionPoint(event)"\n        onauxclick="digichain.editor.changeSelectionPoint(event, true)"></canvas>\n      <div id="editLines">\n        <div class="edit-line"></div>\n      </div>\n    </div>\n  </div>\n  <div class="sample-op-buttons">\n  <button title="Normalize the volume of the sample." class="normalize button button-outline" onclick="digichain.editor.normalize(event)">Normalize</button>\n  \n  <button title="Silence the selected audio." class="silence button button-outline" onclick="digichain.editor.fade()">Silence</button>\n  <button title="Fade in the selected audio." class="fade-in button button-outline" onclick="digichain.editor.fade(\'in\')">Fade In</button>\n  <button title="Fade out the selected audio." class="fade-out button button-outline" onclick="digichain.editor.fade(\'out\')">Fade Out</button>\n  \n  <button title="Reverses the sample playback" class="reverse button button-outline" onclick="digichain.editor.reverse(event)">Reverse</button>&nbsp;&nbsp;-&nbsp;\n  <button title="Trims any zero valued audio from the end of the sample." class="trim-right button button-outline" onclick="digichain.editor.trimRight(event)">Trim Right</button>\n  &nbsp;&nbsp;&nbsp;\n  <button title="Lower pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, .5, 12)">-12</button>\n  <button title="Lower pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(-1/12), 1)">-1</button>\n  &nbsp;<span> Pitch (semitones) </span>&nbsp;\n  <button title="Increase pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(1/12), -1)">+1</button>\n  <button title="Increase pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2, -12)">+12</button>\n  </div>\n  <span class="edit-info">\n    Normalize, Silence, Fade In, Fade Out, and Reverse affect the selected part of the sample; Trim Right and Pitch Adjustments affect the whole sample.<br>\n    Note: sample operations are destructive, applied immediately, no undo.\n  </span>\n  '}function renderEditableItems(){editableItemsEl.innerHTML=`\n      <div class="input-set">\n      <label for="editFileName" class="before-input">File Name</label>\n      <input type="text" onblur="digichain.editor.updateFile(event)" placeholder="Sample file name" id="editFileName" value="${getNiceFileName("",editing,!0)}" readonly>\n      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFileName')"><i class="gg-pen"></i></button>\n    </div><br>\n    <div class="input-set">\n    <label for="editFilePath" class="before-input">File Path</label>\n      <input type="text" onblur="digichain.editor.updateFile(event)" placeholder="File path of the sample (if known)" id="editFilePath" value="${editing.file.path}" id="editFilePath" list="folderOptions" readonly>\n      <datalist id="folderOptions">\n        ${folders.map((f=>'<option value="'+f+'">')).join("")}\n      </datalist>\n      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFilePath')"><i class="gg-pen"></i></button>\n    </div>\n  `}function renderEditPanelWaveform(multiplier=1){const waveformWidth=1024*multiplier,editPanelWaveformEl=document.querySelector(".edit-panel-waveform");drawWaveform(editing,editPanelWaveformEl,editing.meta.channel,{width:waveformWidth,height:128,multiplier:multiplier})}export function drawWaveform(file,el,channel,dimensions){let drawData=[],drawResolution=Math.floor(file.buffer.length/32);2===conf.masterChannels&&file.buffer.numberOfChannels,drawResolution=file.buffer.length>512?(drawResolution>4096?4096:drawResolution)*(2*(dimensions?.multiplier||0)||1):file.buffer.length;for(let y=0;y<file.buffer.length;y+=Math.floor(file.buffer.length/drawResolution))drawData.push((file.buffer.getChannelData(0)[y]+file.buffer.getChannelData(file.buffer.numberOfChannels-1)[y])/2);draw(drawData,file.meta.id,el,dimensions)}export function getNiceFileName(name,file,excludeExtension,includePath){let fname=file?`${file.file.name.replace(/\.[^.]*$/,"")}${file.meta?.dupeOf?"-d":""}${file.meta?.sliceNumber?"-s"+file.meta.sliceNumber:""}.wav`:name.replace(/\.syx$|\.wav$|\.aif$|\.flac$/,"");return fname=includePath&&file.file.path?`${file.file.path.replace(/\//gi,"-")}`+fname:fname,excludeExtension?fname.replace(/\.[^.]*$/,""):fname}function draw(normalizedData,id,canvas,dimensions){const drawLineSegment=(ctx,x,height,width,isEven)=>{ctx.lineWidth=1,ctx.strokeStyle="#a8a8a8",ctx.beginPath(),height=isEven?height:-height,ctx.moveTo(x,0),ctx.lineTo(x,height),ctx.arc(x+width/2,height,width/2,Math.PI,0,isEven),ctx.lineTo(x+width,0),ctx.stroke()};window.devicePixelRatio;canvas.width=dimensions?.width||150,canvas.height=dimensions?.height||60;const ctx=canvas.getContext("2d");ctx.translate(0,canvas.offsetHeight/2+0);const width=canvas.offsetWidth/normalizedData.length;for(let i=0;i<normalizedData.length;i++){const x=width*i;let height=normalizedData[i]/2*canvas.offsetHeight-0;height<0?height=0:height>canvas.offsetHeight/2&&(height=height>canvas.offsetHeight/2),drawLineSegment(ctx,x,height,width,(i+1)%2)}}function updateFile(event){const target=event.target;target&&("editFileName"===target.id&&(editing.file.name=target.value),"editFilePath"===target.id&&(editing.file.path=target.value))}function toggleReadOnlyInput(inputId){const input=document.getElementById(inputId);input.readOnly?input.removeAttribute("readonly"):input.setAttribute("readonly",!0)}function getSelectionStartPoint(){return Math.round(selection.start/selection.step)}function getSelectionEndPoint(){const end=Math.floor((selection.end-selection.start)/selection.step),max=1024*multiplier-getSelectionStartPoint();return end>max?max:end}function updateSelectionEl(){const selection=document.querySelector("#editLines .edit-line"),width=getSelectionEndPoint()>=1024*multiplier?1024*multiplier:getSelectionEndPoint();selection.style.marginLeft=`${getSelectionStartPoint()}px`,selection.style.width=`${width}px`}function zoomLevel(view,level){if("editor"===view){renderEditPanelWaveform(level),selection.step=Math.round(editing.buffer.length/(1024*level)),multiplier=level,updateSelectionEl();document.querySelector(".waveform-container")}}function changeSelectionPoint(event,shiftKey=!1){event.preventDefault();const max=1024*multiplier;if(event.shiftKey||shiftKey){let end=0;event.offsetX<=max&&event.offsetX>-1?end=Math.round(event.offsetX*selection.step):event.offsetX>max&&(end=editing.buffer.length),selection.end=end,selection.start=selection.start>=selection.end?selection.end-1:selection.start}else{let start=0;event.offsetX<=max&&event.offsetX>-1?start=Math.round(event.offsetX*selection.step):event.offsetX>max&&(start=editing.buffer.length),selection.start=start,selection.end=selection.end<=selection.start?selection.start+1:selection.end}selection.end=selection.end>editing.buffer.length?editing.buffer.length:selection.end,updateSelectionEl()}function perSamplePitch(event,pitchValue,pitchSteps,id){const item=editing;if(item.buffer.length<1024&&pitchValue>1)return alert("Sample too small to be pitched up further.");const pitchedWav=audioBufferToWav(item.buffer,item.meta,conf.masterSR*pitchValue,conf.masterBitDepth,item.buffer.numberOfChannels),pitchedBlob=new window.Blob([new DataView(pitchedWav)],{type:"audio/wav"});(async()=>{let linkedFile=await fetch(URL.createObjectURL(pitchedBlob)),arrBuffer=await linkedFile.arrayBuffer();await conf.audioCtx.decodeAudioData(arrBuffer,(buffer=>{item.buffer=buffer,item.meta={...item.meta,opPitch:(item.meta.opPitch??0)+512*pitchSteps,length:buffer.length,duration:Number(buffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:buffer.length,note:!1,slices:!!item.meta.slices&&item.meta.slices.map((slice=>({...slice,n:slice.n,s:Math.round(slice.s/pitchValue),e:Math.round(slice.e/pitchValue)})))},renderEditPanelWaveform(multiplier),selection.end=Math.round(selection.end/pitchValue),selection.start=Math.round(selection.start/pitchValue),selection.step=Math.round(item.buffer.length/(1024*multiplier)),updateSelectionEl(),item.waveform=!1}))})()}function normalize(event,item,renderEditPanel=!0,findPeakOnly=!1){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;let maxSample=0;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel);for(let i=selection.start;i<selection.end;i++)maxSample=Math.max(Math.abs(data[i]),maxSample)}if(maxSample=maxSample||1,item.meta.peak=maxSample,findPeakOnly)return maxSample;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){item.buffer.getChannelData(channel);for(let i=selection.start;i<selection.end;i++)item.buffer.getChannelData(channel)[i]&&item.buffer.getChannelData(channel)[i]/maxSample!=0&&(item.buffer.getChannelData(channel)[i]=item.buffer.getChannelData(channel)[i]/maxSample)}renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function fade(type,item,renderEditPanel=!0){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length);(item=item||editing).buffer.numberOfChannels,item.buffer.sampleRate;const fadeDuration=selection.end-selection.start;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel);for(let i=selection.start;i<selection.end;i++)"out"===type?data[i]=data[i]*((fadeDuration-i)/fadeDuration):"in"===type?(data[i]=data[i]*(i/fadeDuration),data[i]>data[selection.end]&&(data[i]=data[selection.end])):data[i]="curse"===type?(fadeDuration-i)/fadeDuration/data[i]:0}renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function reverse(event,item,renderEditPanel=!0){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel).slice(selection.start,selection.end).reverse(),dataCount=0;for(let i=selection.start;i<selection.end;i++)item.buffer.getChannelData(channel)[i]=data[dataCount],dataCount++}item.meta={...item.meta},0===selection.start&&selection.end===item.buffer.length&&(item.meta.slices=!!item.meta.slices&&item.meta.slices.map((slice=>({...slice,n:slice.n,s:selection.end-slice.e,e:selection.end-slice.s})))),renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function trimRight(event,item,renderEditPanel=!0,ampFloor=.003){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;let trimIndex=[];for(let channel=0;channel<item.buffer.numberOfChannels;channel++){trimIndex.push(item.buffer.length);let data=item.buffer.getChannelData(channel);for(let i=item.buffer.length;i>0;i--)if(Math.abs(data[i])>ampFloor&&void 0!==data[i]&&null!==data[i]){trimIndex[channel]=i+1;break}}const audioArrayBuffer=conf.audioCtx.createBuffer(item.buffer.numberOfChannels,+Math.max(...trimIndex),conf.masterSR);for(let channel=0;channel<item.buffer.numberOfChannels;channel++)for(let i=0;i<audioArrayBuffer.length;i++)audioArrayBuffer.getChannelData(channel)[i]=item.buffer.getChannelData(channel)[i];item.buffer=audioArrayBuffer,item.meta={...item.meta,length:audioArrayBuffer.length,duration:Number(audioArrayBuffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:audioArrayBuffer.length},item.meta.slices&&(item.meta.slices[item.meta.slices.length-1].e=item.buffer.length),renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}export const editor={updateFile:updateFile,toggleReadOnlyInput:toggleReadOnlyInput,zoomLevel:zoomLevel,changeSelectionPoint:changeSelectionPoint,normalize:normalize,fade:fade,trimRight:trimRight,perSamplePitch:perSamplePitch,buildOpKit:buildOpKit,getLastItem:()=>editing?.meta?.id,reverse:reverse};