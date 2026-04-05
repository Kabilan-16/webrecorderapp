import React, { useEffect, useRef } from "react";
import {useVideoRecorder} from "../hooks/UseVideoRecorder";

export default function VideoRecorder() {
  const {
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
  } = useVideoRecorder();

  // Auto-play local preview when it becomes available
  const previewRef = useRef(null);
  useEffect(() => {
    if (previewRef.current && localPreviewUrl) {
      previewRef.current.load();
    }
  }, [localPreviewUrl]);

  const didAutoRequestRef = useRef(false);
  useEffect(() => {
    if (didAutoRequestRef.current || status !== "idle") return;
    didAutoRequestRef.current = true;
    requestCamera();
  }, [requestCamera, status]);

    const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Web Video Recorder</h1>

      {/* ── Status badge ───────────────────────────────────────────────── */}
      <div style={{ ...styles.badge, ...statusColor(status) }}>
        {statusLabel(status)}
      </div>

      {/* ── Error message ──────────────────────────────────────────────── */}
      {errorMsg && <p style={styles.error}>{errorMsg}</p>}

      {/* ── Live camera preview ────────────────────────────────────────── */}
      {(status === "previewing" || status === "recording") && (
        <div style={styles.videoWrapper}>
          {status === "recording" && <div style={styles.recDot} title="Recording" />}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={styles.video}
          />
        </div>
      )}

      {/* ── Playback preview of recorded video ────────────────────────── */}
      {localPreviewUrl && (status === "uploading" || status === "done") && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Recorded Video Preview</h3>
          <video
            ref={previewRef}
            src={localPreviewUrl}
            controls
            style={styles.video}
          />
        </div>
      )}

      {/* ── Upload progress ────────────────────────────────────────────── */}
      {status === "uploading" && (
        <p style={styles.info}>⏳ Finalizing on server… {uploadProgress}</p>
      )}
      {status === "recording" && uploadProgress && (
        <p style={styles.info}>📡 {uploadProgress}</p>
      )}

      {/* ── Download section ───────────────────────────────────────────── */}
      {downloadInfo && status === "done" && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            {downloadInfo.local ? "Local Download" : "Server Download"}
          </h3>
          <p style={styles.info}>
            File: <strong>{downloadInfo.filename}</strong> &nbsp;|&nbsp;
            Size: <strong>{formatBytes(downloadInfo.sizeBytes)}</strong>
          </p>
          <a
            href={downloadInfo.url}
            download={downloadInfo.filename}
            style={styles.downloadBtn}
          >
             Download Video
          </a>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div style={styles.controls}>
        {status === "idle" && (
          <button style={styles.btn} onClick={requestCamera}>
             Open Camera
          </button>
        )}

        {status === "requesting" && (
          <button style={{ ...styles.btn, opacity: 0.6 }} disabled>
            Waiting for permission…
          </button>
        )}

        {status === "previewing" && (
          <button style={{ ...styles.btn, background: "#c0392b" }} onClick={startRecording}>
             Start Recording
          </button>
        )}

        {status === "recording" && (
          <button style={{ ...styles.btn, background: "#e67e22" }} onClick={stopRecording}>
             Stop Recording
          </button>
        )}

        {(status === "done" || status === "error") && (
          <button style={{ ...styles.btn, background: "#27ae60" }} onClick={reset}>
             Record Again
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s) {
  return {
    idle:       "Idle",
    requesting: "Requesting camera…",
    previewing: "Camera ready",
    recording:  "Recording",
    uploading:  "Saving to server…",
    done:       "Done",
    error:      "Error",
  }[s] || s;
}

function statusColor(s) {
  const map = {
    idle:       { background: "#ecf0f1", color: "#7f8c8d" },
    requesting: { background: "#f39c12", color: "#fff" },
    previewing: { background: "#3498db", color: "#fff" },
    recording:  { background: "#c0392b", color: "#fff" },
    uploading:  { background: "#8e44ad", color: "#fff" },
    done:       { background: "#27ae60", color: "#fff" },
    error:      { background: "#e74c3c", color: "#fff" },
  };
  return map[s] || {};
}

// ── Styles (plain objects — no styling library needed) ───────────────────────
const styles = {
  container: {
    maxWidth: 700,
    margin: "40px auto",
    padding: "24px",
    fontFamily: "monospace",
    background: "#fafafa",
    border: "1px solid #ddd",
    borderRadius: 8,
  },
  title: {
    margin: "0 0 16px",
    fontSize: 24,
  },
  badge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 16,
  },
  error: {
    background: "#fdecea",
    border: "1px solid #e74c3c",
    color: "#c0392b",
    padding: "8px 12px",
    borderRadius: 4,
    fontSize: 13,
    marginBottom: 12,
  },
  videoWrapper: {
    position: "relative",
    marginBottom: 16,
  },
  video: {
    width: "100%",
    borderRadius: 6,
    background: "#000",
    display: "block",
  },
  recDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#e74c3c",
    boxShadow: "0 0 0 3px rgba(231,76,60,0.3)",
    animation: "pulse 1s infinite",
    zIndex: 10,
  },
  section: {
    marginBottom: 16,
    padding: "12px 16px",
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#fff",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: 15,
  },
  info: {
    margin: "4px 0 8px",
    fontSize: 13,
    color: "#555",
  },
  downloadBtn: {
    display: "inline-block",
    padding: "8px 18px",
    background: "#2c3e50",
    color: "#fff",
    borderRadius: 4,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: "bold",
  },
  controls: {
    display: "flex",
    gap: 12,
    margin: "16px 0",
  },
  btn: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: "bold",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    background: "#2c3e50",
    color: "#fff",
  },
  details: {
    marginTop: 24,
    fontSize: 13,
    color: "#555",
  },
  summary: {
    cursor: "pointer",
    fontWeight: "bold",
    marginBottom: 8,
  },
  steps: {
    paddingLeft: 20,
    lineHeight: 1.8,
  },
};