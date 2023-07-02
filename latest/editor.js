import{audioBufferToWav,buildOpData,encodeAif}from"./resources.js";const editPanelEl=document.getElementById("editPanel"),editableItemsEl=document.getElementById("editableItems"),editEl=document.getElementById("editorPanelContent"),opExportPanelEl=document.getElementById("opExportPanel"),opExportEl=document.getElementById("opExportPanelContent"),rightButtonsEl=document.querySelector(".right-buttons"),views=["sample","slice","opExport"];let editing,conf,multiplier=1,selection={start:0,end:0,step:0,selStart:!0},samples=[],folders=[];export function setEditorConf(options){conf=options}export function showEditor(data,options,view="sample",folderOptions=[]){if(conf=options,folders=folderOptions,"sample"===view)return editing=data,multiplier=1,selection.end=editing.buffer.length,selection.start=0,selection.step=editing.buffer.length/(1024*multiplier),selection.selStart=!0,renderEditableItems(),renderEditor(editing),updateSelectionEl(),editPanelEl.open||editPanelEl.showModal(),void renderEditPanelWaveform();"opExport"===view&&(samples=data,createOpData(),renderOpExport(),opExportPanelEl.classList.add("show"),rightButtonsEl.classList.add("fade"))}function createOpData(){samples.json=samples.json||buildOpData([],conf.masterChannels,!0)}function renderKey(color,index){return`\n    <div class="op-key ${color} key-${index}"\n         ondragenter="this.classList.add('drag-over')"\n         ondragleave="this.classList.remove('drag-over')"\n         ondrop="this.classList.remove('drag-over')"\n         >\n        <div class="left-a"\n           ondragenter="this.classList.add('drag-over')"\n           ondragleave="this.classList.remove('drag-over')"\n           ondrop="this.classList.remove('drag-over')"\n        >L</div>     \n        <div class="right-b"\n           ondragenter="this.classList.add('drag-over')"\n           ondragleave="this.classList.remove('drag-over')"\n           ondrop="this.classList.remove('drag-over')"\n        >R</div>     \n    </div>   \n  `}function renderOpExport(){const keys={black:[1,3,5,8,10,13,15,17,20,22],white:[0,2,4,6,7,9,11,12,14,16,18,19,21,23]};opExportEl.innerHTML=`\n    <div>\n    <div class="op-keys row">\n            <div class="white-keys float-right">${keys.white.reduce(((a,i)=>a+renderKey("white",i)),"")}</div>\n        <div class="black-keys float-right">${keys.black.reduce(((a,i)=>a+renderKey("black",i)),"")}</div>\n    </div><br>\n      <div class="op-buttons row">\n        <button class="button float-right" onclick="digichain.editor.buildOpKit()">Build Kit</button>\n      </div>\n    </div>\n  `}function buildOpKit(){const linkEl=document.querySelector(".aif-link-hidden"),dataView=encodeAif(samples[0].buffer,samples.json);let blob=new window.Blob([dataView],{type:"audio/aiff"});linkEl.href=URL.createObjectURL(blob),linkEl.setAttribute("download","test-kit.aif"),linkEl.click()}export function renderEditor(item){editing=item===editing?editing:item,editEl.innerHTML='\n<div class="above-waveform-buttons">\n<div class="sample-selection-buttons text-align-left float-left">\n    <button title="Clicking on the waveform will set the selection start point." onclick="digichain.editor.setSelStart(true);" class="button check btn-select-start">Start</button>\n  <button title="Clicking on the waveform will set the selection end point." onclick="digichain.editor.setSelStart(false);" class="button-outline check btn-select-end">End</button>\n    <button title="Reset the waveform selectio to the whole sample." onclick="digichain.editor.resetSelectionPoints();" class="button-outline check">All</button>\n</div>\n  \n  <div class="playback-controls text-align-right float-right" style="padding-left: 1.5rem;">\n    <button onclick="digichain.playFile(event);" class="button-outline check">Play</button>\n    <button onclick="digichain.playFile({ editor: true }, false, true);" class="button-outline check">Loop</button>\n    <button onclick="digichain.stopPlayFile(event);" class="button-outline check">Stop</button>  \n  </div>\n  <div class="zoom-level text-align-right">\n    <button title="Zoom out waveform view." class="zoom-out button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', .5)">-</button>\n    <button title="Reset zoom level waveform view."  class="zoom-reset button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', 1)">1x</button>\n    <button title="Zoom in on waveform view."  class="zoom-in button-outline check" onclick="digichain.editor.zoomLevel(\'editor\', 2)">+</button>\n  </div>\n  </div>\n  <div class="waveform-container">\n    <div>\n      <canvas class="edit-panel-waveform"\n        oncontextmenu="return false;"\n        onclick="digichain.editor.changeSelectionPoint(event)"\n        ></canvas>\n      <div id="editLines">\n        <div class="edit-line"></div>\n      </div>\n    </div>\n  </div>\n\n  <div class="sample-op-buttons">\n  <div class="edit-btn-group float-left">\n  \n  <button title="Normalize the volume of the sample." class="normalize button button-outline" onclick="digichain.editor.normalize(event)">Normalize</button>\n  \n  <button title="Reverses the sample playback" class="reverse button button-outline" onclick="digichain.editor.reverse(event)">Reverse</button>\n  <button title="Crop the sample to the selected area." class="trim-right button button-outline" onclick="digichain.editor.truncate(event)">Crop</button>\n  <button title="Fade in the selected audio." class="fade-in button button-outline" onclick="digichain.editor.fade(\'in\')">Fade In</button>\n  <button title="Silence the selected audio." class="silence button button-outline" onclick="digichain.editor.fade()">Silence</button>\n  <button title="Fade out the selected audio." class="fade-out button button-outline" onclick="digichain.editor.fade(\'out\')">Fade Out</button>\n</div>\n<div class="edit-btn-group float-right">\n    <div class="edit-pitch-btn-group">  \n    <button title="Lower pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, .5, 12)">-12</button>\n    <button title="Lower pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(-1/12), 1)">-1</button>\n    &nbsp;<span> Pitch (semitones) </span>&nbsp;\n    <button title="Increase pitch by 1 semi-tone" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2**(1/12), -1)">+1</button>\n    <button title="Increase pitch by 12 semi-tones" class="pitch button-outline check" onclick="digichain.editor.perSamplePitch(event, 2, -12)">+12</button>\n    </div>\n    <br>\n      <button title="Trims any zero valued audio from the end of the sample." class="trim-right button button-outline" onclick="digichain.editor.trimRight(event)">Trim Right</button>\n  </div>\n</div>\n  <span class="edit-info">\n    Normalize, Silence, Fade In, Fade Out, Crop, and Reverse affect the selected part of the sample; Trim Right and Pitch Adjustments affect the whole sample.<br>\n    Note: sample operations are destructive, applied immediately, no undo.\n  </span>\n  '}function renderEditableItems(){editableItemsEl.innerHTML=`\n      <div class="input-set">\n      <label for="editFileName" class="before-input">File Name</label>\n      <input type="text" onkeyup="digichain.editor.updateFile(event)" placeholder="Sample file name" id="editFileName" value="${getNiceFileName("",editing,!0)}" readonly>\n      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFileName')"><i class="gg-pen"></i></button>\n    </div><br>\n    <div class="input-set">\n    <label for="editFilePath" class="before-input">File Path</label>\n      <input type="text" onkeyup="digichain.editor.updateFile(event)" placeholder="File path of the sample (if known)" id="editFilePath" value="${editing.file.path}" id="editFilePath" list="folderOptions" readonly>\n      <datalist id="folderOptions">\n        ${folders.map((f=>'<option value="'+f+'">')).join("")}\n      </datalist>\n      <button class="button-clear" onclick="digichain.editor.toggleReadOnlyInput('editFilePath')"><i class="gg-pen"></i></button>\n    </div>\n  `}function renderEditPanelWaveform(multiplier=1){const waveformWidth=1024*multiplier,editPanelWaveformEl=document.querySelector(".edit-panel-waveform");drawWaveform(editing,editPanelWaveformEl,editing.meta.channel,{width:waveformWidth,height:128,multiplier:multiplier})}export function drawWaveform(file,el,channel,dimensions){let drawData=[],drawResolution=Math.floor(file.buffer.length/32);2===conf.masterChannels&&file.buffer.numberOfChannels,drawResolution=file.buffer.length>512?(drawResolution>4096?4096:drawResolution)*(2*(dimensions?.multiplier||0)||1):file.buffer.length;for(let y=0;y<file.buffer.length;y+=Math.floor(file.buffer.length/drawResolution))drawData.push((file.buffer.getChannelData(0)[y]+file.buffer.getChannelData(file.buffer.numberOfChannels-1)[y])/2);draw(drawData,file.meta.id,el,dimensions)}export function getNiceFileName(name,file,excludeExtension,includePath){let fname=file?`${file.file.name.replace(/\.[^.]*$/,"")}${file.meta?.dupeOf?"-d":""}${file.meta?.sliceNumber?"-s"+file.meta.sliceNumber:""}.wav`:name.replace(/\.syx$|\.wav$|\.aif$|\.flac$|\.webm$|\.m4a$/,"");return fname=includePath&&file.file.path?`${file.file.path.replace(/\//gi,"-")}`+fname:fname,excludeExtension?fname.replace(/\.[^.]*$/,""):fname}export function getUniqueName(files,name){const count=files.filter((f=>f.file.filename===name)).length,parts=name.split("."),ext=parts.pop(),fname=parts.join(".");return count>0?`${fname}_${count+1}.${ext}`:name}function draw(normalizedData,id,canvas,dimensions){const drawLineSegment=(ctx,x,height,width,isEven)=>{ctx.lineWidth=1,ctx.strokeStyle="#a8a8a8",ctx.beginPath(),height=isEven?height:-height,ctx.moveTo(x,0),ctx.lineTo(x,height),ctx.arc(x+width/2,height,width/2,Math.PI,0,isEven),ctx.lineTo(x+width,0),ctx.stroke()};window.devicePixelRatio;canvas.width=dimensions?.width||150,canvas.height=dimensions?.height||60;const ctx=canvas.getContext("2d");ctx.translate(0,canvas.offsetHeight/2+0);const width=canvas.offsetWidth/normalizedData.length;for(let i=0;i<normalizedData.length;i++){const x=width*i;let height=normalizedData[i]/2*canvas.offsetHeight-0;height<0?height=0:height>canvas.offsetHeight/2&&(height=height>canvas.offsetHeight/2),drawLineSegment(ctx,x,height,width,(i+1)%2)}}function updateFile(event){const target=event.target;target&&("editFileName"===target.id&&(editing.file.name=target.value),"editFilePath"===target.id&&(editing.file.path=target.value))}function toggleReadOnlyInput(inputId){const input=document.getElementById(inputId);input.readOnly?input.removeAttribute("readonly"):input.setAttribute("readonly",!0)}function getSelectionStartPoint(){return Math.round(selection.start/selection.step)}function getSelectionEndPoint(){const end=Math.floor((selection.end-selection.start)/selection.step),max=1024*multiplier-getSelectionStartPoint();return end>max?max:end}function updateSelectionEl(){const selection=document.querySelector("#editLines .edit-line"),width=getSelectionEndPoint()>=1024*multiplier?1024*multiplier:getSelectionEndPoint();selection.style.marginLeft=`${getSelectionStartPoint()}px`,selection.style.width=`${width}px`}function zoomLevel(view,level){if("editor"===view){1!==level&&(level*=multiplier);const step=editing.buffer.length/(1024*level);if(1024*level<1024||1024*level>32768||step<1)return alert("Unable to zoom any further");renderEditPanelWaveform(level),selection.step=step,multiplier=level,updateSelectionEl();document.querySelector(".waveform-container")}}function setSelStart(value){const startBtnEl=document.querySelector(".btn-select-start"),endBtnEl=document.querySelector(".btn-select-end");selection.selStart=value,startBtnEl.classList[value?"remove":"add"]("button-outline"),endBtnEl.classList[value?"add":"remove"]("button-outline")}function changeSelectionPoint(event,shiftKey=!1){event.preventDefault();const max=1024*multiplier;if(event.shiftKey||shiftKey||!selection.selStart){let end=0;event.offsetX<=max&&event.offsetX>-1?end=Math.round(event.offsetX*selection.step):event.offsetX>max&&(end=editing.buffer.length),selection.end=end,selection.start=selection.start>=selection.end?selection.end-1:selection.start}else{let start=0;event.offsetX<=max&&event.offsetX>-1?start=Math.round(event.offsetX*selection.step):event.offsetX>max&&(start=editing.buffer.length),selection.start=start,selection.end=selection.end<=selection.start?selection.start+1:selection.end}selection.end=selection.end>=editing.buffer.length?editing.buffer.length:selection.end,selection.start=selection.start>=selection.end?selection.end-1:selection.start,updateSelectionEl()}function resetSelectionPoints(){selection.start=0,selection.end=editing.buffer.length,selection.selStart=!0,updateSelectionEl()}function perSamplePitch(event,pitchValue,pitchSteps,item,renderEditPanel=!0){if((item=item||editing).buffer.length<1024&&pitchValue>1)return alert("Sample too small to be pitched up further.");const pitchedWav=audioBufferToWav(item.buffer,item.meta,conf.masterSR*pitchValue,conf.masterBitDepth,item.buffer.numberOfChannels),pitchedBlob=new window.Blob([new DataView(pitchedWav)],{type:"audio/wav"});(async()=>{let linkedFile=await fetch(URL.createObjectURL(pitchedBlob)),arrBuffer=await linkedFile.arrayBuffer();await conf.audioCtx.decodeAudioData(arrBuffer,(buffer=>{item.buffer=buffer,item.meta={...item.meta,opPitch:(item.meta.opPitch??0)+512*pitchSteps,length:buffer.length,duration:Number(buffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:buffer.length,note:!1,slices:!!item.meta.slices&&item.meta.slices.map((slice=>({...slice,n:slice.n,s:Math.round(slice.s/pitchValue),e:Math.round(slice.e/pitchValue)})))},renderEditPanel&&(renderEditPanelWaveform(multiplier),selection.end=Math.round(selection.end/pitchValue),selection.start=Math.round(selection.start/pitchValue),selection.step=item.buffer.length/(1024*multiplier),updateSelectionEl(),item.waveform=!1)}))})()}function normalize(event,item,renderEditPanel=!0,findPeakOnly=!1){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;let maxSample=0;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel);for(let i=selection.start;i<selection.end;i++)maxSample=Math.max(Math.abs(data[i]),maxSample)}if(maxSample=maxSample||1,item.meta.peak=maxSample,findPeakOnly)return maxSample;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){item.buffer.getChannelData(channel);for(let i=selection.start;i<selection.end;i++)item.buffer.getChannelData(channel)[i]&&item.buffer.getChannelData(channel)[i]/maxSample!=0&&(item.buffer.getChannelData(channel)[i]=item.buffer.getChannelData(channel)[i]/maxSample)}renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function fade(type,item,renderEditPanel=!0){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length);(item=item||editing).buffer.numberOfChannels,item.buffer.sampleRate;const fadeDuration=selection.end-selection.start;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel);if("out"===type)for(let i=selection.start;i<selection.end;i++)data[i]=data[i]*((fadeDuration-(i-selection.start))/fadeDuration);else if("in"===type)for(let i=selection.end;i>selection.start;i--)data[i]=data[i]/((fadeDuration-(i-selection.end))/fadeDuration);else if("curse"===type)for(let i=selection.start;i<selection.end;i++)data[i]=(fadeDuration-i)/fadeDuration/data[i];else for(let i=selection.end;i>selection.start;i--)data[i]=0}renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function reverse(event,item,renderEditPanel=!0){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let data=item.buffer.getChannelData(channel).slice(selection.start,selection.end).reverse(),dataCount=0;for(let i=selection.start;i<selection.end;i++)item.buffer.getChannelData(channel)[i]=data[dataCount],dataCount++}item.meta={...item.meta},0===selection.start&&selection.end===item.buffer.length&&(item.meta.slices=!!item.meta.slices&&item.meta.slices.map((slice=>({...slice,n:slice.n,s:selection.end-slice.e,e:selection.end-slice.s})))),renderEditPanel&&renderEditPanelWaveform(multiplier),item.waveform=!1}function trimRight(event,item,renderEditPanel=!0,ampFloor=.003){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;let trimIndex=[];for(let channel=0;channel<item.buffer.numberOfChannels;channel++){trimIndex.push(item.buffer.length);let data=item.buffer.getChannelData(channel);for(let i=item.buffer.length;i>0;i--)if(Math.abs(data[i])>ampFloor&&void 0!==data[i]&&null!==data[i]){trimIndex[channel]=i+1;break}}const audioArrayBuffer=conf.audioCtx.createBuffer(item.buffer.numberOfChannels,+Math.max(...trimIndex),conf.masterSR);for(let channel=0;channel<item.buffer.numberOfChannels;channel++)for(let i=0;i<audioArrayBuffer.length;i++)audioArrayBuffer.getChannelData(channel)[i]=item.buffer.getChannelData(channel)[i];item.buffer=audioArrayBuffer,item.meta={...item.meta,length:audioArrayBuffer.length,duration:Number(audioArrayBuffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:audioArrayBuffer.length},item.meta.slices&&(item.meta.slices[item.meta.slices.length-1].e=item.buffer.length),renderEditPanel&&showEditor(editing,conf,"sample",folders),item.waveform=!1}function truncate(event,item,renderEditPanel=!0,lengthInSeconds=3){!renderEditPanel&&item&&(selection.start=0,selection.end=conf.masterSR*lengthInSeconds),item=item||editing;let truncIndex=selection.end-selection.start;if(truncIndex>item.buffer.length)return;const audioArrayBuffer=conf.audioCtx.createBuffer(item.buffer.numberOfChannels,truncIndex,conf.masterSR);for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let x=0;for(let i=selection.start;i<selection.end;i++)audioArrayBuffer.getChannelData(channel)[x]=item.buffer.getChannelData(channel)[i],x++}item.buffer=audioArrayBuffer,item.meta={...item.meta,length:audioArrayBuffer.length,duration:Number(audioArrayBuffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:audioArrayBuffer.length},item.meta.slices&&(item.meta.slices=!1),item.meta.op1Json&&(item.meta.op1Json=!1),renderEditPanel&&showEditor(editing,conf,"sample",folders),item.waveform=!1}function double(event,item,reverse=!1,renderEditPanel=!0){!renderEditPanel&&item&&(selection.start=0,selection.end=item.buffer.length),item=item||editing;const audioArrayBuffer=conf.audioCtx.createBuffer(item.buffer.numberOfChannels,2*item.buffer.length,conf.masterSR);for(let channel=0;channel<item.buffer.numberOfChannels;channel++){let x=0;for(let i=selection.start;i<selection.end;i++)audioArrayBuffer.getChannelData(channel)[x]=item.buffer.getChannelData(channel)[i],x++;let data=item.buffer.getChannelData(channel).slice(selection.start,selection.end);reverse&&(data=data.reverse());for(let i=selection.start;i<selection.end;i++)audioArrayBuffer.getChannelData(channel)[x]=data[i],x++}item.buffer=audioArrayBuffer,item.meta={...item.meta,length:audioArrayBuffer.length,duration:Number(audioArrayBuffer.length/conf.masterSR).toFixed(3),startFrame:0,endFrame:audioArrayBuffer.length},item.meta.slices&&(item.meta.slices=!1),item.meta.op1Json&&(item.meta.op1Json=!1),renderEditPanel&&showEditor(editing,conf,"sample",folders),item.waveform=!1}export const editor={updateFile:updateFile,toggleReadOnlyInput:toggleReadOnlyInput,zoomLevel:zoomLevel,changeSelectionPoint:changeSelectionPoint,resetSelectionPoints:resetSelectionPoints,setSelStart:setSelStart,normalize:normalize,fade:fade,trimRight:trimRight,truncate:truncate,perSamplePitch:perSamplePitch,double:double,buildOpKit:buildOpKit,getLastItem:()=>editing?.meta?.id,reverse:reverse};