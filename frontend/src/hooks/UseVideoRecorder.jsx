import { useRef, useState, useCallback, useEffect } from "react";
import { videoApi } from "../services/videoApi";

const CHUNK_INTERVAL_MS = 1000;

class RecordingBuffer {
  constructor(mimeType) {
    this.mimeType = mimeType || "video/webm";
    this.chunks = [];
    this.nextChunkIndex = 0;
  }
  addChunk(blob) {
    const index = this.nextChunkIndex;
    this.chunks.push(blob);
    this.nextChunkIndex += 1;
    return index;
  }
  hasChunks() {
    return this.nextChunkIndex > 0;
  }
  toBlob() {
    return new Blob(this.chunks, { type: this.mimeType });
  }
  reset() {
    this.chunks = [];
    this.nextChunkIndex = 0;
  }
}

export function useVideoRecorder() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const sessionIdRef = useRef(null);
  const bufferRef = useRef(new RecordingBuffer("video/webm"));

  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    const stream = streamRef.current;
    if (!videoEl) return;
    if (stream && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl.muted = true;
    const playVideo = async () => {
      try {
        await videoEl.play();
      } catch (err) {
        console.warn("Error playing live preview:", err);
      }
    };
    if (videoEl.readyState >= 1) {
      playVideo();
    } else {
      videoEl.onloadedmetadata = playVideo;
    }
    return () => {
      if (videoEl) {
        videoEl.onloadedmetadata = null;
      }
    };
  }, [status]);

  // Request access to camera and microphone
  const requestCamera = useCallback(async () => {
    setStatus("requesting");
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setStatus("previewing");
    } catch (err) {
      setErrorMsg(`Camera access denied or unavailable: ${err.message}`);
      setStatus("error");
    }
  }, []);

  //start recording, upload chunks
  const startRecording = useCallback(async () => {
    if (!streamRef.current) return;
    setDownloadInfo(null);
    setLocalPreviewUrl(null);
    setUploadProgress(null);
    setErrorMsg(null);
    let sessionId;
    try {
      sessionId = await videoApi.startSession();
      sessionIdRef.current = sessionId;
    } catch (err) {
      setErrorMsg(`Failed to start recording session: ${err.message}`);
      setStatus("error");
      return;
    }
    const mimeType =
      [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    bufferRef.current = new RecordingBuffer(mimeType || "video/webm");
    const recorder = new MediaRecorder(
      streamRef.current,
      mimeType ? { mimeType } : {}
    );
    recorderRef.current = recorder;
    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      const index = bufferRef.current.addChunk(event.data);
      try {
        await videoApi.uploadChunk(sessionId, index, event.data);
        setUploadProgress(`${index + 1} chunk(s) uploaded...`);
      } catch (err) {
        console.warn("Chunk upload failed:", err.message);
      }
    };
    recorder.onstop = async () => {
      const localBlob = bufferRef.current.toBlob();
      const localUrl = URL.createObjectURL(localBlob);
      setLocalPreviewUrl(localUrl);
      if (!bufferRef.current.hasChunks()) {
        setDownloadInfo({
          url: localUrl,
          filename: "recording.webm",
          sizeBytes: localBlob.size,
          previewUrl: localUrl,
          local: true,
        });
        setUploadProgress("No video chunks captured, skipped server finalize");
        setStatus("done");
        return;
      }
      setStatus("uploading");
      try {
        const result = await videoApi.finalizeSession(sessionId);
        setDownloadInfo({
          url: `http://localhost:4000${result.downloadUrl}`,
          filename: result.filename,
          sizeBytes: result.sizeBytes,
          previewUrl: `http://localhost:4000${result.previewUrl}`,
          local: false,
        });
        setStatus("done");
      } catch (err) {
        setErrorMsg(`Failed to finalize recording session: ${err.message}`);
        setDownloadInfo({
          url: localUrl,
          filename: "recording.webm",
          sizeBytes: localBlob.size,
          previewUrl: localUrl,
          local: true,
        });
        setStatus("done");
      }
    };
    recorder.start(CHUNK_INTERVAL_MS);
    setStatus("recording");
  }, []);

  //stop recording
  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  //reset everything to initial state
  const reset = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    sessionIdRef.current = null;
    recorderRef.current = null;
    bufferRef.current = new RecordingBuffer("video/webm");
    setStatus("idle");
    setErrorMsg(null);
    setDownloadInfo(null);
    setLocalPreviewUrl(null);
    setUploadProgress(null);
  }, [localPreviewUrl]);

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