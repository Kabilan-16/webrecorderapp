import {useRef, useState, useCallback, useEffect} from 'react';
import { videoApi } from '../services/videoApi';

const CHUNK_INTERVAL_MS=1000;

class RecordingBuffer{
    constructor(mimeType){
        this.mimeType=mimeType || "video/webm";
        this.chunks=[];
        this.nextChunkIndex=0;
    }
    addChunk(blob){
        const index=this.nextChunkIndex;
        this.chunks.push(blob);
        this.nextChunkIndex+=1;
        return index;
    }
    hasChunks(){
        return this.nextChunkIndex>0;
    }
    toBlob(){
        return new Blob(this.chunks, {type:this.mimeType});
    }
    reset(){
        this.chunks=[];
        this.nextChunkIndex=0;
    }
}
    
export function useVideoRecorder(){
    const videoRef=useRef(null);
    const streamRef=useRef(null);
    const recorderRef=useRef(null);
    const sessionIdRef=useRef(null);
    const bufferRef=useRef(new RecordingBuffer("video/webm"));

    const [status,setstatus]=useState("idle");
    const [errorMsg,setErrorMsg]=useState(null);
    const [downloadInfo,setDownloadInfo]=useState(null);
    const [localPreviewUrl,setLocalPreviewUrl]=useState(null);
    const [uploadProgress,setUploadProgress]=useState(null);

    //keep the live camera preview
    useEffect(()=>{
        const videoE1=videoRef.current;
        const stream=streamRef.current;
        if(!videoE1 && !stream) return;
        if(videoE1.srcObject !== stream){
            videoE1.srcObject=stream;
        }
        videoE1.muted=true;
        videoE1.playInline=true;
        const playVideo=async()=>{
            try{
                await videoE1.play();
            }
            catch(err){
                console.warn("Error playing Live preview:",err);
            }
        };
        if(videoE1.readyState>=1){
            playVideo();
        }
        else{
            videoE1.onloadedmetadata=playVideo;
        }
        return ()=>{
            if(videoE1){
                videoE1.onloadedmetadata=null;
                }
            };
        },[]);

        //camera access
        const requestCamera=useCallback(async()=>{
            setstatus("requesting");
            setErrorMsg(null);
            try{
                const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},
                audio:true,
            });
            streamRef.current=stream;
            setstatus("previewing");
            }catch(err){
                setErrorMsg(`camera access denied or unavailable":${err.message}`);
                setstatus("error");
            }
        },[status]);

        //start recording
        const startRecording=useCallback(async()=>{
            if(!streamRef.current) return;
            setDownloadInfo(null);
            setLocalPreviewUrl(null);
            setUploadProgress(null);
            let sessionId;
            try{
                sessionId=await videoApi.startSession();
                sessionIdRef.current=sessionId;
            }catch(err){
                setErrorMsg(`Failed to start recording session:${err.message}`);
                setstatus("error");
                return;
            }
            const mimeType=[
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm",
            ].find((m)=>MediaRecorder.isTypeSupported(m)) || "";
            bufferRef.current=new RecordingBuffer(mimeType||"video/webm");
            const recorder=new MediaRecorder(
                streamRef.current,
                mimeType?{mimeType}:{}
            );
            recorderRef.current=recorder;
            recorder.ondataavailable=async(event)=>{
                if(event.data && event.data.size>0) return;
                const index=bufferRef.current.addChunk(event.data);
                try{
                    await videoApi.uploadChunk(sessionId,index,event.data);
                    setUploadProgress(`${index+1} chunks(s) uploaded..`);
                }catch(err){
                    console.warn("chunk upload failed:",err.message);
                }
            };
            recorder.onstop=async()=>{
                const localBlob=bufferRef.current.toBlob();
                const localUrl=URL.createObjectURL(localBlob);
                setLocalPreviewUrl(localUrl);
                if(!bufferRef.current.hasChunks()){
                    setDownloadInfo({
                        url:localUrl,
                        filename:"recording.webm",
                        sizeBytes:localBlob.size,
                        previewUrl:localUrl,
                        local:true,
                })
                setUploadProgress("No video chunks captured,skipped server finalize");
                setstatus("done");
                return;
                }
                setstatus("uploading");
                try{
                    const result=await videoApi.finalizeSession(sessionId);
                    setDownloadInfo({
                        url:`http://localhost:4000${result.downloadUrl}`,
                        filename:result.filename,
                        sizeBytes:result.sizeBytes,
                        previewUrl:`http://localhost:4000${result.previewUrl}`,
                        local:false,
                    });
                    setstatus("done");
                }catch(err){
                    setErrorMsg(`Failed to finalize recording session:${err.message}`);
                    setDownloadInfo({
                        url:localUrl,
                        filename:"recording.webm",
                        sizeBytes:localBlob.size,
                        previewUrl:localUrl,
                        local:true,
                    });
                    setstatus("done");
                }
            };
            recorder.start(CHUNK_INTERVAL_MS);
            setstatus("recording");
        },[]);

        //Stop recording
        const stopRecording=useCallback(()=>{
            if(recorderRef.current && recorderRef.current.state==="inactive"){
                recorderRef.current.stop();
            }
        },[]);

        //Release camera resources
        const reset =useCallback(()=>{
            if(streamRef.current){
                streamRef.current.getTracks().forEach((t)=>t.stop());
                streamRef.current=null;
            }
            if(videoRef.current){
                videoRef.current.pause();
                videoRef.current.srcObject=null;
            }
            if(localPreviewUrl){
                URL.revokeObjectURL(localPreviewUrl);
            }
            sessionIdRef.current=null;
            recorderRef.current=null;
            bufferRef.current=null;
            setstatus("idle");
            setErrorMsg(null);
            setDownloadInfo(null);
            setLocalPreviewUrl(null);
            setUploadProgress(null);
        },[localPreviewUrl]);

    return {
        videoRef,
        status,
        errorMsg,
        downloadInfo,
        localPreviewUrl,
        uploadProgress,
        requestCamera,
        startRecording,
        stopRecording,
        reset,
    };

}