import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect,wait} from './obs-client.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const production=path.join(root,'production'),output=path.join(root,'recording');
const game='E:/pcl2/.minecraft/versions/1.21.11-NeoForge_21.11.45-AltarFilmV2';
const control=path.join(game,'altarfilm-control');
const profileName='Altar V2 Raw 1080p60',sceneName='Altar V2 - Minecraft',inputName='Altar V2 - Game Window';
const mode=process.argv[2]||'status';
const obs=await connect();
const req=(type,data)=>obs.request(type,data);
const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(control,name),'utf8'));}catch{return null;}};
const command=value=>{
  const temp=path.join(control,'command.tmp');
  fs.writeFileSync(temp,value);
  fs.renameSync(temp,path.join(control,'command.txt'));
};
fs.mkdirSync(output,{recursive:true});
async function startConfirmed() {
  await req('StartRecord');
  for(let i=0;i<40;i++) {
    await wait(250);
    const status=await req('GetRecordStatus');
    if(status.outputActive&&status.outputDuration>=750&&status.outputBytes>0)return status;
  }
  throw Error(`OBS did not begin writing: ${JSON.stringify(await req('GetRecordStatus'))}`);
}

async function setup() {
  if((await req('GetRecordStatus')).outputActive)throw Error('OBS is already recording. No changes made.');
  const profiles=await req('GetProfileList'),scenes=await req('GetSceneList');
  const restore={profile:profiles.currentProfileName,scene:scenes.currentProgramSceneName,mutes:[]};
  const priorSetup=path.join(production,'obs-setup.json');
  const originalRestore=fs.existsSync(priorSetup)?JSON.parse(fs.readFileSync(priorSetup,'utf8')).restore:null;
  if(!profiles.profiles.includes(profileName))await req('CreateProfile',{profileName});
  else await req('SetCurrentProfile',{profileName});
  await wait(800);
  const params={Output:{Mode:'Simple'},SimpleOutput:{RecQuality:'HQ',RecEncoder:'nvenc',RecFormat2:'hybrid_mp4',
    FilePath:output,RecRB:'false',RecTracks:'1'},Video:{ColorSpace:'709',ColorRange:'Partial'}};
  for(const [parameterCategory,items] of Object.entries(params))for(const [parameterName,parameterValue] of Object.entries(items))
    await req('SetProfileParameter',{parameterCategory,parameterName,parameterValue});
  // Reload after API config writes so OBS rebuilds the actual output handler.
  const alternate=profiles.profiles.find(name=>name!==profileName);
  if(alternate) {
    await req('SetCurrentProfile',{profileName:alternate});await wait(500);
    await req('SetCurrentProfile',{profileName});await wait(500);
  }
  await req('SetVideoSettings',{fpsNumerator:60,fpsDenominator:1,baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080});
  await req('SetRecordDirectory',{recordDirectory:output});
  const currentScenes=await req('GetSceneList');
  if(!currentScenes.scenes.some(s=>s.sceneName===sceneName))await req('CreateScene',{sceneName});
  await req('SetCurrentProgramScene',{sceneName});
  const inputs=(await req('GetInputList')).inputs;
  if(!inputs.some(s=>s.inputName===inputName))await req('CreateInput',{
    sceneName,inputName,inputKind:'window_capture',inputSettings:{method:2,client_area:true,cursor:false},sceneItemEnabled:true});
  const windows=(await req('GetInputPropertiesListPropertyItems',{inputName,propertyName:'window'})).propertyItems;
  const candidates=windows.filter(w=>String(w.itemValue).includes('Altar V2 Film')||
    (String(w.itemName).includes('[java.exe]')&&String(w.itemName).includes('Minecraft NeoForge')));
  const window=windows.find(w=>String(w.itemValue).includes('Altar V2 Film'))||(candidates.length===1?candidates[0]:null);
  if(!window)throw Error(`Minecraft filming window not found: ${windows.map(w=>w.itemName).join(', ')}`);
  await req('SetInputSettings',{inputName,overlay:false,inputSettings:{window:window.itemValue,method:2,priority:1,client_area:true,cursor:false}});
  const sceneItems=(await req('GetSceneItemList',{sceneName})).sceneItems;
  const item=sceneItems.find(i=>i.sourceName===inputName);
  await req('SetSceneItemTransform',{sceneName,sceneItemId:item.sceneItemId,sceneItemTransform:{
    alignment:5,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsAlignment:0,boundsWidth:1920,boundsHeight:1080,
    positionX:0,positionY:0,rotation:0,scaleX:1,scaleY:1,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0}});
  // Keep unrelated desktop audio and microphones out of the raw game footage.
  for(const input of (await req('GetInputList')).inputs) {
    try {
      const mute=await req('GetInputMute',{inputName:input.inputName});
      restore.mutes.push({inputName:input.inputName,inputMuted:mute.inputMuted});
      await req('SetInputMute',{inputName:input.inputName,inputMuted:true});
    } catch {}
  }
  const result={profileName,sceneName,inputName,window:window.itemName,output,restore:originalRestore||restore,
    video:await req('GetVideoSettings'),input:await req('GetInputSettings',{inputName})};
  fs.writeFileSync(path.join(production,'obs-setup.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}

async function record() {
  const client=read('client.json'),state=read('status.json');
  if(client?.phase!==3||client.width!==1920||client.height!==1080||state?.status!=='ready'||state.placed!==0)
    throw Error(`Game is not ready for a fresh take: ${JSON.stringify({client,state})}`);
  if((await req('GetCurrentProgramScene')).currentProgramSceneName!==sceneName)throw Error('Wrong OBS scene');
  if((await req('GetRecordStatus')).outputActive)throw Error('OBS is already recording');
  const initialStats=await req('GetStats'),started=new Date();
  const samples=[];let report,startedRecord=false;
  try {
    await startConfirmed();startedRecord=true;
    await wait(1200);command('start');
    console.log('RECORDING_STARTED');
    let lastStage='',lastLog=0;
    const timeline=JSON.parse(fs.readFileSync(path.join(production,'timeline.json'),'utf8'));
    while(Date.now()-started.getTime()<15*60*1000) {
      await wait(2000);
      const s=read('status.json'),c=read('client.json');
      const liveRecord=await req('GetRecordStatus');
      if(!liveRecord.outputActive)throw Error('OBS stopped recording before the take finished');
      if(!s||Date.now()-s.updated>15000)throw Error('Game director status went stale');
      samples.push({wallSeconds:(Date.now()-started.getTime())/1000,playhead:s.playhead,placed:s.placed,fps:c?.fps});
      fs.appendFileSync(path.join(production,'capture-progress.jsonl'),JSON.stringify({...samples.at(-1),outputBytes:liveRecord.outputBytes})+'\n');
      const stage=timeline.stages.find(p=>s.playhead>=p.start&&s.playhead<p.end)?.name||s.status;
      if(stage!==lastStage||Date.now()-lastLog>30000) {
        console.log(JSON.stringify({stage,playhead:+s.playhead.toFixed(1),placed:s.placed,fps:c?.fps}));
        lastStage=stage;lastLog=Date.now();
      }
      if(s.status==='geometry_mismatch')throw Error('Completed world differs from the approved blueprint');
      if(s.status==='complete') {
        await wait(1500);
        const recordStatus=await req('GetRecordStatus'),stats=await req('GetStats');
        const stop=await req('StopRecord');startedRecord=false;
        report={raw:true,edited:false,world:s.world,outputPath:stop.outputPath,timelineSeconds:timeline.duration,
          actualRecordSeconds:recordStatus.outputDuration/1000,resolution:'1920x1080',fps:60,
          blocks:s.placed,approvedBlueprintMatch:true,completeGeometryMismatches:0,
          started:started.toISOString(),completed:new Date().toISOString(),initialStats,finalStats:stats,samples};
        fs.writeFileSync(path.join(production,'recording-report.json'),JSON.stringify(report,null,2));
        command('quit');
        console.log(JSON.stringify({...report,samples:undefined},null,2));
        return;
      }
    }
    throw Error('Take exceeded the safety timeout');
  } catch(error) {
    command('pause');
    if(startedRecord) {
      try {
        const stop=await req('StopRecord');
        fs.writeFileSync(path.join(production,'incomplete-recording.json'),JSON.stringify({error:error.message,...stop,samples},null,2));
      } catch {}
    }
    throw error;
  }
}

try {
  if(mode==='setup')await setup();
  else if(mode==='test') {
    await req('SetCurrentProfile',{profileName:'Altar Film 1080p60'});await wait(500);
    await req('SetCurrentProfile',{profileName});await wait(500);
    console.log(JSON.stringify(await startConfirmed(),null,2));
    await wait(2500);
    console.log(JSON.stringify(await req('StopRecord'),null,2));
  } else if(mode==='next') {command('world AltarFilm-V2-Take02-20260925');console.log('Fresh take requested.');}
  else if(mode==='probe') {
    await req('SaveSourceScreenshot',{sourceName:sceneName,imageFormat:'png',imageFilePath:path.join(production,'capture-probe.png'),imageWidth:960,imageHeight:540});
    console.log(JSON.stringify({video:await req('GetVideoSettings'),game:read('client.json'),director:read('status.json'),stats:await req('GetStats')},null,2));
  } else if(mode==='record')await record();
  else if(mode==='restore') {
    const {restore}=JSON.parse(fs.readFileSync(path.join(production,'obs-setup.json'),'utf8'));
    for(const mute of restore.mutes)try{await req('SetInputMute',mute);}catch{}
    await req('SetCurrentProgramScene',{sceneName:restore.scene});
    await req('SetCurrentProfile',{profileName:restore.profile});
    console.log('Previous OBS profile, scene and audio mute settings restored.');
  } else console.log(JSON.stringify({record:await req('GetRecordStatus'),game:read('client.json'),director:read('status.json')},null,2));
} finally {obs.close();}
